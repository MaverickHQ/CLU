// Cockpit store — renderer-canonical state (ADR-0002). Vanilla Zustand
// (createStore, no React import) so it runs in plain-Node tests against the
// fake Host; React hooks wrap it in context.tsx (task 2.5).
//
// Persistence: every mutation schedules a debounced (200 ms) atomic save of
// that Tab's ProjectState via host.state.saveProject; closeTab flushes
// immediately. App-level prefs (theme, lastProjectPath) save the same way.

import { createStore, type StoreApi } from 'zustand/vanilla'
import type { Host } from '@shared/host'
import type {
  AgentStatusConfig,
  HiddenMode,
  ProjectState,
  SplitLayout,
  TabId,
  ThemeName,
} from '@shared/types'
import {
  cycleHiddenMode,
  defaultAgentStatusConfig,
  defaultAppState,
  defaultProjectState,
  SCHEMA_VERSION,
} from '@shared/types'
import type { AgentState } from '@shared/agentStatus/types'
import { shouldNotifyBlocked } from '@shared/agentStatus/detect'
import { basename } from '@shared/paths'

export const SAVE_DEBOUNCE_MS = 200

/** Runtime Tab state — the persisted ProjectState slice plus identity. */
export interface TabRuntime {
  id: TabId
  projectPath: string
  name: string
  pinSet: string[]
  viewerFile: string | null
  treeExpansion: string[]
  hiddenMode: HiddenMode
  splits: SplitLayout
  /** First-open gitignore prompt answered (persisted; Skip leaves it unset). */
  gitignoreAnswered?: boolean
  /** Runtime-only (not persisted): the Tab's shell process has exited. */
  shellExited?: boolean
  /** Runtime-only: the projectPath no longer exists on disk (error-state A). */
  missing?: boolean
  /** Runtime-only: pinned paths currently missing on disk (ADR-0005 — stale
   *  pins stay visible and exported until explicitly unpinned). */
  stalePins?: string[]
  /** Runtime-only: detected Claude session state (R2.1 / ADR-0011). */
  agentState?: AgentState
}

/** A close/quit awaiting user confirmation (close-confirm mockup). */
export type PendingClose = { kind: 'tab'; tabId: TabId } | { kind: 'quit' } | null

export interface CockpitState {
  tabs: TabRuntime[]
  activeTabId: TabId | null
  theme: ThemeName
  pendingClose: PendingClose
  dontAskCloseTab: boolean
  dontAskQuit: boolean
  /** Sticky: survives closing all tabs — powers the Welcome "Recent" row. */
  lastProjectPath: string | null

  /** Open a Project (restoring its persisted state); re-selects if already open. */
  openTab(projectPath: string): Promise<TabId>
  /** Flush state, then remove the Tab and activate a neighbour. */
  closeTab(id: TabId): Promise<void>
  selectTab(id: TabId): void

  pin(id: TabId, absPath: string): void
  unpin(id: TabId, absPath: string): void
  setViewerFile(id: TabId, absPath: string | null): void
  toggleExpanded(id: TabId, dirPath: string): void
  cycleHidden(id: TabId): void

  /** Stale-pin runtime flags (set by the staleness wiring; never persisted). */
  markPinStale(id: TabId, absPath: string): void
  clearPinStale(id: TabId, absPath: string): void

  setGitignoreAnswered(id: TabId): void
  clearLastProject(): void
  setSplits(id: TabId, splits: SplitLayout): void
  setTheme(theme: ThemeName): void

  /** Runtime-only shell status (set by terminal wiring; never persisted). */
  markShellExited(id: TabId): void
  /** Agent status detection prefs (R2.1). */
  agentStatus: AgentStatusConfig
  /** Set a Tab's detected Claude state; notifies on a background→blocked transition (R2.1). */
  setAgentState(id: TabId, state: AgentState): void
  /** Update agent-status prefs (persisted). */
  setAgentStatusConfig(patch: Partial<AgentStatusConfig>): void
  clearShellExited(id: TabId): void

  /** Close-confirm flow (ADR-0004 + close-confirm mockup). The caller supplies
   *  whether a live PTY exists — the store stays decoupled from sessions. */
  requestCloseTab(id: TabId, opts: { hasLiveSession: boolean }): void
  requestQuit(opts: { hasLiveSessions: boolean }): void
  confirmPendingClose(): Promise<void>
  cancelPendingClose(): void
  setDontAskCloseTab(v: boolean): void
  setDontAskQuit(v: boolean): void

  /** Force-save every open Project immediately (quit path). */
  flushAllProjects(): Promise<void>

  /** Restore app prefs + the last-open Project (v1.0: last project only). */
  hydrate(): Promise<void>
}

function toProjectState(tab: TabRuntime): ProjectState {
  return {
    schemaVersion: SCHEMA_VERSION,
    name: tab.name,
    pinSet: [...tab.pinSet],
    viewerFile: tab.viewerFile,
    treeExpansion: [...tab.treeExpansion],
    hiddenMode: tab.hiddenMode,
    splits: { ...tab.splits },
    gitignoreAnswered: tab.gitignoreAnswered,
  }
}

export function createCockpitStore(deps: { host: Host }): StoreApi<CockpitState> {
  const { host } = deps
  const timers = new Map<string, ReturnType<typeof setTimeout>>()
  let hydrating = false
  // In-flight openTab promises keyed by projectPath. openTab has awaits between
  // its dedup check and the set() that appends, so two concurrent calls for the
  // same project (StrictMode double-invoke, HMR) would both append. Coalescing
  // them here yields exactly one Tab / one PTY (finding N3).
  const opening = new Map<string, Promise<TabId>>()
  let hydratePromise: Promise<void> | null = null

  const store = createStore<CockpitState>()((set, get) => {
    function scheduleProjectSave(projectPath: string): void {
      if (hydrating) return
      const existing = timers.get(projectPath)
      if (existing) clearTimeout(existing)
      timers.set(
        projectPath,
        setTimeout(() => {
          timers.delete(projectPath)
          void flushProject(projectPath)
        }, SAVE_DEBOUNCE_MS),
      )
    }

    async function flushProject(projectPath: string): Promise<void> {
      const timer = timers.get(projectPath)
      if (timer) {
        clearTimeout(timer)
        timers.delete(projectPath)
      }
      const tab = get().tabs.find((t) => t.projectPath === projectPath)
      // Never write into a missing project's dir — a mkdir would recreate the
      // folder the user deleted (N2). Swallow save failures (e.g. unmounted
      // volume) so closeTab / quit can always proceed.
      if (!tab || tab.missing) return
      try {
        await host.state.saveProject(projectPath, toProjectState(tab))
      } catch {
        // best-effort — a failed persist must not strand the tab or block quit
      }
    }

    function scheduleAppSave(): void {
      if (hydrating) return
      const existing = timers.get('::app')
      if (existing) clearTimeout(existing)
      timers.set(
        '::app',
        setTimeout(() => {
          timers.delete('::app')
          const { theme, lastProjectPath, dontAskCloseTab, dontAskQuit, agentStatus } = get()
          void host.state.saveApp({
            schemaVersion: SCHEMA_VERSION,
            theme,
            lastProjectPath,
            dontAskCloseTab,
            dontAskQuit,
            agentStatus,
          })
        }, SAVE_DEBOUNCE_MS),
      )
    }

    function updateTab(id: TabId, patch: (tab: TabRuntime) => Partial<TabRuntime>): void {
      const tab = get().tabs.find((t) => t.id === id)
      if (!tab) return
      set({ tabs: get().tabs.map((t) => (t.id === id ? { ...t, ...patch(t) } : t)) })
      scheduleProjectSave(tab.projectPath)
    }

    return {
      tabs: [],
      activeTabId: null,
      theme: defaultAppState().theme,
      pendingClose: null,
      dontAskCloseTab: false,
      dontAskQuit: false,
      lastProjectPath: null,
      agentStatus: { ...defaultAgentStatusConfig },

      async openTab(projectPath: string): Promise<TabId> {
        const already = get().tabs.find((t) => t.projectPath === projectPath)
        if (already) {
          set({ activeTabId: already.id, lastProjectPath: projectPath })
          scheduleAppSave()
          return already.id
        }
        // Coalesce concurrent opens of the same project (N3): a second call
        // while the first's awaits are in flight returns the same promise
        // rather than appending a duplicate Tab + PTY.
        const inFlight = opening.get(projectPath)
        if (inFlight) return inFlight

        const work = (async (): Promise<TabId> => {
          // Declare this project a root before any fs op so the main-process
          // confinement (S2) permits reads/writes within it.
          await host.registerRoot(projectPath)
          const exists = await host.pathExists(projectPath)
          const restored = exists ? await host.state.loadProject(projectPath) : null
          const base = restored ?? defaultProjectState(basename(projectPath))
          const tab: TabRuntime = {
            id: crypto.randomUUID(),
            projectPath,
            name: base.name,
            pinSet: [...base.pinSet],
            viewerFile: base.viewerFile,
            treeExpansion: [...base.treeExpansion],
            hiddenMode: base.hiddenMode,
            splits: { ...base.splits },
            gitignoreAnswered: base.gitignoreAnswered,
            missing: exists ? undefined : true,
          }
          set({
            tabs: [...get().tabs, tab],
            activeTabId: tab.id,
            lastProjectPath: exists ? projectPath : get().lastProjectPath,
          })
          scheduleAppSave()
          return tab.id
        })()

        opening.set(projectPath, work)
        try {
          return await work
        } finally {
          opening.delete(projectPath)
        }
      },

      async closeTab(id: TabId): Promise<void> {
        const { tabs, activeTabId } = get()
        const idx = tabs.findIndex((t) => t.id === id)
        if (idx < 0) return
        await flushProject(tabs[idx].projectPath)
        const remaining = tabs.filter((t) => t.id !== id)
        let nextActive = activeTabId
        if (activeTabId === id) {
          const neighbour = remaining[Math.min(idx, remaining.length - 1)]
          nextActive = neighbour?.id ?? null
        }
        set({ tabs: remaining, activeTabId: nextActive })
        scheduleAppSave()
      },

      selectTab(id: TabId): void {
        const { tabs, activeTabId } = get()
        if (!tabs.some((t) => t.id === id)) return
        // Force-save the outgoing Tab's Project (user-visible boundary,
        // ADR-0002) rather than waiting out the debounce.
        const outgoing = tabs.find((t) => t.id === activeTabId)
        if (outgoing && outgoing.id !== id) void flushProject(outgoing.projectPath)
        const incoming = tabs.find((t) => t.id === id)
        set({ activeTabId: id, lastProjectPath: incoming?.projectPath ?? get().lastProjectPath })
        scheduleAppSave()
      },

      pin(id: TabId, absPath: string): void {
        updateTab(id, (t) => (t.pinSet.includes(absPath) ? {} : { pinSet: [...t.pinSet, absPath] }))
      },

      unpin(id: TabId, absPath: string): void {
        updateTab(id, (t) => ({
          pinSet: t.pinSet.filter((p) => p !== absPath),
          stalePins: t.stalePins?.filter((p) => p !== absPath),
        }))
      },

      markPinStale(id: TabId, absPath: string): void {
        // Runtime flag only — bypass updateTab so no persistence is scheduled.
        set({
          tabs: get().tabs.map((t) =>
            t.id === id && t.pinSet.includes(absPath) && !t.stalePins?.includes(absPath)
              ? { ...t, stalePins: [...(t.stalePins ?? []), absPath] }
              : t,
          ),
        })
      },

      setGitignoreAnswered(id: TabId): void {
        updateTab(id, () => ({ gitignoreAnswered: true }))
      },

      clearLastProject(): void {
        set({ lastProjectPath: null })
        scheduleAppSave()
      },

      clearPinStale(id: TabId, absPath: string): void {
        set({
          tabs: get().tabs.map((t) =>
            t.id === id ? { ...t, stalePins: t.stalePins?.filter((p) => p !== absPath) } : t,
          ),
        })
      },

      setViewerFile(id: TabId, absPath: string | null): void {
        updateTab(id, () => ({ viewerFile: absPath }))
      },

      toggleExpanded(id: TabId, dirPath: string): void {
        updateTab(id, (t) => ({
          treeExpansion: t.treeExpansion.includes(dirPath)
            ? t.treeExpansion.filter((p) => p !== dirPath)
            : [...t.treeExpansion, dirPath],
        }))
      },

      cycleHidden(id: TabId): void {
        updateTab(id, (t) => ({ hiddenMode: cycleHiddenMode(t.hiddenMode) }))
      },

      setSplits(id: TabId, splits: SplitLayout): void {
        updateTab(id, () => ({ splits: { ...splits } }))
      },

      setTheme(theme: ThemeName): void {
        set({ theme })
        scheduleAppSave()
      },

      requestCloseTab(id: TabId, opts: { hasLiveSession: boolean }): void {
        if (!opts.hasLiveSession || get().dontAskCloseTab) {
          void get().closeTab(id)
        } else {
          set({ pendingClose: { kind: 'tab', tabId: id } })
        }
      },

      requestQuit(opts: { hasLiveSessions: boolean }): void {
        if (!opts.hasLiveSessions || get().dontAskQuit) {
          void get()
            .flushAllProjects()
            .then(() => host.confirmQuit?.())
        } else {
          set({ pendingClose: { kind: 'quit' } })
        }
      },

      async confirmPendingClose(): Promise<void> {
        const pending = get().pendingClose
        set({ pendingClose: null })
        if (!pending) return
        if (pending.kind === 'tab') {
          await get().closeTab(pending.tabId)
        } else {
          await get().flushAllProjects()
          host.confirmQuit?.()
        }
      },

      cancelPendingClose(): void {
        set({ pendingClose: null })
      },

      setDontAskCloseTab(v: boolean): void {
        set({ dontAskCloseTab: v })
        scheduleAppSave()
      },

      setDontAskQuit(v: boolean): void {
        set({ dontAskQuit: v })
        scheduleAppSave()
      },

      async flushAllProjects(): Promise<void> {
        await Promise.all(get().tabs.map((t) => flushProject(t.projectPath)))
      },

      markShellExited(id: TabId): void {
        // Runtime flag only — bypass updateTab so no persistence is scheduled.
        set({ tabs: get().tabs.map((t) => (t.id === id ? { ...t, shellExited: true } : t)) })
      },

      setAgentState(id: TabId, state: AgentState): void {
        const { tabs, activeTabId, agentStatus } = get()
        const tab = tabs.find((t) => t.id === id)
        if (!tab || tab.agentState === state) return
        // Notify BEFORE committing, so we compare against the previous state.
        if (agentStatus.notifyOnBlocked && shouldNotifyBlocked(tab.agentState, state, id === activeTabId)) {
          host.notify?.({ title: 'Claude needs you', body: tab.name, tabId: id })
        }
        // Runtime-only — bypass updateTab so no persistence is scheduled.
        set({ tabs: get().tabs.map((t) => (t.id === id ? { ...t, agentState: state } : t)) })
      },

      setAgentStatusConfig(patch: Partial<AgentStatusConfig>): void {
        set({ agentStatus: { ...get().agentStatus, ...patch } })
        scheduleAppSave()
      },

      clearShellExited(id: TabId): void {
        set({ tabs: get().tabs.map((t) => (t.id === id ? { ...t, shellExited: false } : t)) })
      },

      async hydrate(): Promise<void> {
        // Re-entrant-safe (N3): StrictMode double-invokes the mount effect, so
        // a second hydrate() returns the first's promise instead of loading +
        // opening the last project twice. openTab's own coalescing is a second
        // line of defence.
        if (hydratePromise) return hydratePromise
        hydratePromise = (async () => {
          hydrating = true
          try {
            const app = await host.state.loadApp()
            if (app) {
              set({
                theme: app.theme,
                dontAskCloseTab: app.dontAskCloseTab ?? false,
                dontAskQuit: app.dontAskQuit ?? false,
                lastProjectPath: app.lastProjectPath,
                agentStatus: { ...defaultAgentStatusConfig, ...app.agentStatus },
              })
            }
            hydrating = false
            if (app?.lastProjectPath) await get().openTab(app.lastProjectPath)
          } finally {
            hydrating = false
          }
        })()
        return hydratePromise
      },
    }
  })

  return store
}
