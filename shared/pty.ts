// Real PTY manager wrapping node-pty — the keystone mechanism. One PTY per Tab
// (design doc Tab lifecycle); the map-by-id shape makes multi-Tab first-class.
// Runs in plain Node (proven by shared/pty.test.ts) and is reused by the
// Electron-backed Host. Kept free of Electron imports.

import * as nodePty from 'node-pty'
import type { Unsubscribe } from './host'
import type { TabId } from './types'

export interface PtySpawnOptions {
  shell: string
  /** Shell argv (e.g. ['--rcfile', path] for bash shell-init, ADR-0007). */
  args?: string[]
  cwd: string
  cols: number
  rows: number
  env?: Record<string, string>
}

export interface NodePtyManager {
  spawn(opts: PtySpawnOptions): TabId
  write(id: TabId, data: string): void
  resize(id: TabId, cols: number, rows: number): void
  kill(id: TabId): void
  /** Kill every live PTY (app quit / window close teardown, C6). */
  killAll(): void
  /** Live PTY ids (for teardown coordination / tests). */
  ids(): TabId[]
  onData(id: TabId, onData: (data: string) => void): Unsubscribe
  onExit(id: TabId, onExit: () => void): Unsubscribe
}

export function createNodePty(): NodePtyManager {
  const procs = new Map<TabId, nodePty.IPty>()
  let counter = 0

  const get = (id: TabId): nodePty.IPty => {
    const p = procs.get(id)
    if (!p) throw new Error(`NodePty: unknown pty id: ${id}`)
    return p
  }

  return {
    spawn(opts: PtySpawnOptions): TabId {
      const id = `pty-${++counter}`
      const proc = nodePty.spawn(opts.shell, opts.args ?? [], {
        name: 'xterm-256color',
        cwd: opts.cwd,
        cols: opts.cols,
        rows: opts.rows,
        env: { ...process.env, ...opts.env },
      })
      procs.set(id, proc)
      proc.onExit(() => procs.delete(id))
      return id
    },

    // write/resize on an unknown id no-op rather than throw: fire-and-forget
    // ipcMain.on handlers can't surface a rejection, so a throw here would be
    // an uncaught main-process exception (3.6a belt-and-suspenders).
    write(id, data) {
      procs.get(id)?.write(data)
    },

    resize(id, cols, rows) {
      procs.get(id)?.resize(cols, rows)
    },

    kill(id) {
      const proc = procs.get(id)
      if (!proc) return
      // Graceful first (SIGHUP is node-pty's default), then escalate: a shell
      // that traps HUP must not survive Tab close (ADR-0004: 1 s, then KILL).
      proc.kill()
      if (process.platform !== 'win32') {
        const timer = setTimeout(() => {
          if (procs.has(id)) {
            try {
              proc.kill('SIGKILL')
            } catch {
              // already gone
            }
          }
        }, 1000)
        timer.unref?.()
      }
    },

    killAll() {
      for (const id of [...procs.keys()]) this.kill(id)
    },

    ids() {
      return [...procs.keys()]
    },

    onData(id, onData): Unsubscribe {
      const sub = get(id).onData(onData)
      return () => sub.dispose()
    },

    onExit(id, onExit): Unsubscribe {
      const sub = get(id).onExit(() => onExit())
      return () => sub.dispose()
    },
  }
}
