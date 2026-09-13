// In-memory Host adapter for fast, deterministic tests (no Electron, no disk).
// PTY methods are safe no-ops with call-recording — real PTY behaviour is
// covered separately in shared/pty.test.ts against node-pty.

import { renderPosixEnv } from './envFile'
import { isIgnoredPath } from './ignores'
import type { FsEvent, GitStatus, Host, SessionFile, SpawnPtyOptions, Unsubscribe } from './host'
import type { AppState, ProjectState, TabId } from './types'

/** True when `child` is `dir` itself or sits directly/indirectly under it. */
function isUnder(dir: string, child: string): boolean {
  const base = dir.endsWith('/') ? dir : dir + '/'
  return child === dir || child.startsWith(base)
}

export interface FakeHost extends Host {
  /** Test hooks — not part of the Host contract. */
  fake: {
    files: Map<string, string>
    /** Raw porcelain to return from gitStatus (null = not a git repo). The
     *  optional prefix is the repo→project path for subdir projects (3.6b). */
    setGitStatus(projectPath: string, porcelain: string | null, prefix?: string): void
    /** All spawnPty calls, for asserting per-Tab spawn behaviour. */
    spawns: SpawnPtyOptions[]
    /** All ptyWrite calls. */
    writes: Array<{ id: TabId; data: string }>
    /** All ptyKill calls. */
    kills: TabId[]
    /** Push data to a PTY's subscribers, as if the shell emitted it. */
    emitPtyData(id: TabId, data: string): void
    /** Fire a PTY's exit subscribers. */
    emitPtyExit(id: TabId): void
    /** Emit a watch event, as if the filesystem changed externally. */
    emitFsEvent(path: string, type: FsEvent['type']): void
    /** Simulate an external deletion: drop the file (and any descendants) and
     *  emit unlink through watchers. Replaces the former Host.remove, which was
     *  a real recursive-delete IPC that no production code called (3.6d). */
    deleteFile(absPath: string): void
    /** Register a directory as existing (pathExists also checks file keys). */
    addDir(absPath: string): void
    /** Force readFile(absPath) to return the too-large signal (C3). */
    setOversize(absPath: string, sizeBytes: number): void
    /** Fire the main-process quit request (window close intercepted). */
    emitQuitRequest(): void
    /** confirmQuit() calls, for asserting the quit handshake. */
    quitConfirms: number[]
    /** notify() calls, for asserting background→blocked notifications (R2.1). */
    notifies: Array<{ title: string; body: string; tabId: TabId }>
    /** Seed the Claude sessions listSessions(cwd) returns (R2.2). */
    setSessions(cwd: string, files: SessionFile[]): void
  }
}

export function createFakeHost(): FakeHost {
  const projectStates = new Map<string, ProjectState>()
  let appState: AppState | null = null
  const files = new Map<string, string>()
  const gitStatuses = new Map<string, GitStatus | null>()
  const watchers: Array<{ dir: string; onEvents: (events: FsEvent[]) => void }> = []

  const dirs = new Set<string>()
  const oversize = new Map<string, number>() // path → reported size, forces tooLarge
  const quitSubs = new Set<() => void>()
  const quitConfirms: number[] = []
  const notifies: Array<{ title: string; body: string; tabId: TabId }> = []
  const sessions = new Map<string, SessionFile[]>()
  const spawns: SpawnPtyOptions[] = []
  const writes: Array<{ id: TabId; data: string }> = []
  const kills: TabId[] = []
  const dataSubs = new Map<TabId, Set<(data: string) => void>>()
  const exitSubs = new Map<TabId, Set<() => void>>()
  let ptyCounter = 0

  function emit(path: string, type: FsEvent['type']): void {
    for (const w of watchers) {
      // Mirror the real chokidar watcher: events under ignored subtrees
      // (node_modules/.git/.clu/…) never reach subscribers (3.6g), so tests
      // exercise the same visibility the app actually sees.
      if (isUnder(w.dir, path) && !isIgnoredPath(w.dir, path)) w.onEvents([{ type, path }])
    }
  }

  return {
    async readFile(absPath) {
      if (oversize.has(absPath)) {
        return { content: '', sizeBytes: oversize.get(absPath)!, tooLarge: true }
      }
      const content = files.get(absPath)
      if (content === undefined) throw new Error(`FakeHost: no such file: ${absPath}`)
      return { content, sizeBytes: new TextEncoder().encode(content).length }
    },

    async writeFile(absPath, content) {
      const existed = files.has(absPath)
      files.set(absPath, content)
      emit(absPath, existed ? 'change' : 'add')
    },

    async listDir(absPath) {
      const base = absPath.endsWith('/') ? absPath : absPath + '/'
      const children = new Map<string, boolean>()
      for (const path of files.keys()) {
        if (!path.startsWith(base)) continue
        const rest = path.slice(base.length)
        const name = rest.split('/')[0]
        if (name) children.set(name, rest.includes('/') || children.get(name) === true)
      }
      for (const dir of dirs) {
        if (!dir.startsWith(base)) continue
        const name = dir.slice(base.length).split('/')[0]
        if (name) children.set(name, true)
      }
      return [...children.entries()].map(([name, isDir]) => ({ name, isDir }))
    },

    watchDir(absPath, onEvents): Unsubscribe {
      const entry = { dir: absPath, onEvents }
      watchers.push(entry)
      return () => {
        const i = watchers.indexOf(entry)
        if (i >= 0) watchers.splice(i, 1)
      }
    },

    async pickDirectory() {
      return null
    },

    async pathExists(absPath) {
      if (dirs.has(absPath)) return true
      const base = absPath.endsWith('/') ? absPath : absPath + '/'
      for (const path of files.keys()) {
        if (path === absPath || path.startsWith(base)) return true
      }
      return false
    },

    async registerRoot() {},

    droppedFilePath: (file) => (file as { path?: string })?.path ?? null,

    onQuitRequest(cb) {
      quitSubs.add(cb)
      return () => quitSubs.delete(cb)
    },
    confirmQuit() {
      quitConfirms.push(Date.now())
    },
    notify(opts) {
      notifies.push(opts)
    },
    async listSessions(cwd) {
      return sessions.get(cwd) ?? []
    },

    async gitStatus(projectPath) {
      return gitStatuses.get(projectPath) ?? null
    },

    async writeEnvFile(projectPath, exp) {
      const base = projectPath.endsWith('/') ? projectPath.slice(0, -1) : projectPath
      files.set(`${base}/.clu/env.sh`, renderPosixEnv(exp))
    },

    state: {
      async saveProject(projectPath, payload) {
        projectStates.set(projectPath, structuredClone(payload))
      },
      async loadProject(projectPath) {
        const found = projectStates.get(projectPath)
        return found ? structuredClone(found) : null
      },
      async saveApp(payload) {
        appState = structuredClone(payload)
      },
      async loadApp() {
        return appState ? structuredClone(appState) : null
      },
    },

    spawnPty(opts): TabId {
      spawns.push(opts)
      return `fake-pty-${++ptyCounter}`
    },
    ptyWrite(id, data) {
      writes.push({ id, data })
    },
    ptyResize() {},
    ptyKill(id) {
      kills.push(id)
    },
    onPtyData(id, onData): Unsubscribe {
      let subs = dataSubs.get(id)
      if (!subs) dataSubs.set(id, (subs = new Set()))
      subs.add(onData)
      return () => subs.delete(onData)
    },
    onPtyExit(id, onExit): Unsubscribe {
      let subs = exitSubs.get(id)
      if (!subs) exitSubs.set(id, (subs = new Set()))
      subs.add(onExit)
      return () => subs.delete(onExit)
    },

    fake: {
      files,
      setGitStatus: (projectPath, porcelain, prefix = '') =>
        gitStatuses.set(projectPath, porcelain === null ? null : { porcelain, prefix }),
      spawns,
      writes,
      kills,
      emitPtyData: (id, data) => dataSubs.get(id)?.forEach((cb) => cb(data)),
      emitPtyExit: (id) => exitSubs.get(id)?.forEach((cb) => cb()),
      emitFsEvent: (path, type) => emit(path, type),
      deleteFile: (absPath) => {
        const base = absPath.endsWith('/') ? absPath : absPath + '/'
        for (const path of [...files.keys()]) {
          if (path === absPath || path.startsWith(base)) {
            files.delete(path)
            emit(path, 'unlink')
          }
        }
      },
      addDir: (absPath) => dirs.add(absPath),
      setOversize: (absPath, sizeBytes) => oversize.set(absPath, sizeBytes),
      emitQuitRequest: () => quitSubs.forEach((cb) => cb()),
      quitConfirms,
      notifies,
      setSessions: (cwd, files) => sessions.set(cwd, files),
    },
  }
}
