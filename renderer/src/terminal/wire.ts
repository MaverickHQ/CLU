// Wires the store to the terminal sessions manager: closed Tabs kill their
// PTYs (ADR-0004); PTY exits flip the Tab's shellExited flag (error-state E).

import type { StoreApi } from 'zustand/vanilla'
import type { Host } from '@shared/host'
import type { CockpitState } from '../store/cockpit'
import type { TerminalSessions } from './sessions'

/** Quit handshake: main asks → store decides (confirm dialog vs immediate). */
export function wireQuit(
  store: StoreApi<CockpitState>,
  sessions: TerminalSessions,
  host: Host,
): () => void {
  if (!host.onQuitRequest) return () => {}
  return host.onQuitRequest(() => {
    const hasLiveSessions = store.getState().tabs.some((t) => sessions.has(t.id))
    store.getState().requestQuit({ hasLiveSessions })
  })
}

export function wireTerminals(
  store: StoreApi<CockpitState>,
  sessions: TerminalSessions,
): () => void {
  const exitUnsubs = new Map<string, () => void>()

  function track(tabId: string): void {
    if (exitUnsubs.has(tabId)) return
    exitUnsubs.set(
      tabId,
      sessions.onExit(tabId, () => store.getState().markShellExited(tabId)),
    )
  }

  store.getState().tabs.forEach((t) => track(t.id))

  const off = store.subscribe((state, prev) => {
    if (state.tabs === prev.tabs) return
    const current = new Set(state.tabs.map((t) => t.id))
    for (const tab of prev.tabs) {
      if (!current.has(tab.id)) {
        sessions.kill(tab.id)
        exitUnsubs.get(tab.id)?.()
        exitUnsubs.delete(tab.id)
      }
    }
    state.tabs.forEach((t) => track(t.id))
  })

  return () => {
    off()
    exitUnsubs.forEach((offExit) => offExit())
    exitUnsubs.clear()
  }
}
