// Renderer-side Host backed by the preload bridge (window.cluHost) over IPC.
// Wraps the bridge into the full Host interface; routes PTY data/exit pushes to
// the right per-id subscribers. The bridge is injected so this logic is
// unit-testable without Electron (task 2.4 behaviours).

import type { FsEvent, Host, SpawnPtyOptions, Unsubscribe } from '@shared/host'
import type { PreloadBridge } from '@shared/ipc'
import type { TabId } from '@shared/types'

export function isElectron(): boolean {
  return typeof window !== 'undefined' && window.cluHost !== undefined
}

export function createElectronHost(bridge: PreloadBridge): Host {
  const dataSubs = new Map<TabId, Set<(d: string) => void>>()
  const exitSubs = new Map<TabId, Set<() => void>>()

  bridge.onPtyData((id, data) => dataSubs.get(id)?.forEach((cb) => cb(data)))
  bridge.onPtyExit((id) => exitSubs.get(id)?.forEach((cb) => cb()))

  // Spawn is async over IPC but Host.spawnPty is sync: hand back a provisional
  // id immediately, buffer writes, then re-key subscriptions to the real id.
  const realId = new Map<TabId, TabId>()
  const pending = new Map<TabId, string[]>()
  // Latest resize requested against a provisional id before its spawn resolved
  // (finding 3.6a). Applied once the real id exists; a bare ptyResize(provisional)
  // would throw 'unknown pty id' in main on ~every tab open (FitAddon fits on
  // mount, before the async spawn resolves).
  const pendingResize = new Map<TabId, { cols: number; rows: number }>()
  // Provisional ids killed before their spawn resolved — kill the real pty the
  // moment it exists so it can't run orphaned (finding C4).
  const killedBeforeResolve = new Set<TabId>()
  let provisionalCounter = 0

  const dropProvisional = (provisional: TabId): void => {
    pending.delete(provisional)
    pendingResize.delete(provisional)
    dataSubs.delete(provisional)
    exitSubs.delete(provisional)
    killedBeforeResolve.delete(provisional)
  }

  return {
    readFile: (p) => bridge.readFile(p),
    writeFile: (p, c) => bridge.writeFile(p, c),
    listDir: (p) => bridge.listDir(p),
    pickDirectory: () => bridge.pickDirectory(),
    gitStatus: (p) => bridge.gitStatus(p),
    pathExists: (p) => bridge.pathExists(p),
    registerRoot: (p) => bridge.registerRoot(p),
    droppedFilePath: (file) => {
      try {
        return bridge.getDroppedPath(file as File) || null
      } catch {
        // Older runtime with File.path still present — last-resort fallback.
        return (file as { path?: string })?.path ?? null
      }
    },
    writeEnvFile: (p, exp) => bridge.writeEnvFile(p, exp),
    onQuitRequest: (cb) => bridge.onQuitRequest(cb),
    confirmQuit: () => bridge.confirmQuit(),
    notify: (opts) => bridge.notify(opts),
    onFocusTab: (cb) => bridge.onFocusTab(cb),
    listSessions: (cwd) => bridge.listSessions(cwd),

    watchDir(absPath: string, onEvents: (events: FsEvent[]) => void): Unsubscribe {
      let watchId: number | null = null
      let stopped = false
      const off = bridge.onWatchEvent((id, events) => {
        if (id === watchId) onEvents(events as FsEvent[])
      })
      void bridge.watchStart(absPath).then((id) => {
        watchId = id
        if (stopped) void bridge.watchStop(id)
      })
      return () => {
        stopped = true
        off()
        if (watchId !== null) void bridge.watchStop(watchId)
      }
    },

    state: {
      saveProject: (p, payload) => bridge.state.saveProject(p, payload),
      loadProject: (p) => bridge.state.loadProject(p),
      saveApp: (payload) => bridge.state.saveApp(payload),
      loadApp: () => bridge.state.loadApp(),
    },

    spawnPty(opts: SpawnPtyOptions): TabId {
      const provisional = `provisional-${++provisionalCounter}`
      pending.set(provisional, [])
      void bridge
        .ptySpawn({
          shell: opts.shell,
          cwd: opts.cwd,
          cols: opts.cols,
          rows: opts.rows,
          env: opts.env,
        })
        .then((id) => {
          // Killed while the spawn was in flight → kill the real pty now so it
          // never runs orphaned, and drop the provisional bookkeeping (C4).
          if (killedBeforeResolve.has(provisional)) {
            bridge.ptyKill(id)
            dropProvisional(provisional)
            return
          }
          realId.set(provisional, id)
          // Re-key subscriptions registered against the provisional id.
          const d = dataSubs.get(provisional)
          if (d) {
            dataSubs.set(id, d)
            dataSubs.delete(provisional)
          }
          const x = exitSubs.get(provisional)
          if (x) {
            exitSubs.set(id, x)
            exitSubs.delete(provisional)
          }
          for (const data of pending.get(provisional) ?? []) bridge.ptyWrite(id, data)
          pending.delete(provisional)
          const rz = pendingResize.get(provisional)
          if (rz) bridge.ptyResize(id, rz.cols, rz.rows) // apply the buffered fit
          pendingResize.delete(provisional)
        })
        .catch(() => {
          // Spawn failed: surface an exit to subscribers (so the UI can show
          // the shell-exited state) and clean up the stranded provisional.
          exitSubs.get(provisional)?.forEach((cb) => cb())
          dropProvisional(provisional)
        })
      return provisional
    },

    ptyWrite(id: TabId, data: string): void {
      const real = realId.get(id)
      if (real) bridge.ptyWrite(real, data)
      else if (pending.has(id)) pending.get(id)!.push(data)
      else bridge.ptyWrite(id, data)
    },
    ptyResize(id: TabId, cols: number, rows: number): void {
      const real = realId.get(id)
      if (real) bridge.ptyResize(real, cols, rows)
      else if (pending.has(id)) pendingResize.set(id, { cols, rows }) // buffer (3.6a)
      else bridge.ptyResize(id, cols, rows)
    },
    ptyKill(id: TabId): void {
      const real = realId.get(id)
      if (real) {
        bridge.ptyKill(real)
      } else if (pending.has(id)) {
        // Provisional id whose spawn hasn't resolved — remember to kill the
        // real pty once it exists (C4); a bare bridge.ptyKill(provisional)
        // would no-op in main and leak the real pty.
        killedBeforeResolve.add(id)
      } else {
        bridge.ptyKill(id)
      }
    },
    onPtyData(id: TabId, onData: (data: string) => void): Unsubscribe {
      const key = realId.get(id) ?? id
      let subs = dataSubs.get(key)
      if (!subs) dataSubs.set(key, (subs = new Set()))
      subs.add(onData)
      return () => subs.delete(onData)
    },
    onPtyExit(id: TabId, onExit: () => void): Unsubscribe {
      const key = realId.get(id) ?? id
      let subs = exitSubs.get(key)
      if (!subs) exitSubs.set(key, (subs = new Set()))
      subs.add(onExit)
      return () => subs.delete(onExit)
    },
  }
}
