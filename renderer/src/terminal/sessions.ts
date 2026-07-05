// Terminal sessions manager — owns the tabId → ptyId mapping OUTSIDE React so
// PTYs survive tab switches and component unmounts (ADR-0004: they die only on
// Tab close or app quit). One PTY per Tab, spawned lazily on first ensure().

import type { Host, Unsubscribe } from '@shared/host'
import { envFilePath } from '@shared/paths'
import type { TabId } from '@shared/types'

export interface TerminalSessions {
  /** Spawn the Tab's PTY on first call; no-op (returns existing) after. */
  ensure(tab: { id: TabId; projectPath: string }): void
  has(tabId: TabId): boolean
  write(tabId: TabId, data: string): void
  resize(tabId: TabId, cols: number, rows: number): void
  /** Kill the Tab's PTY and forget it (Tab close / app quit). */
  kill(tabId: TabId): void
  /** Kill any existing PTY and spawn a fresh one (the "Restart shell" action). */
  restart(tab: { id: TabId; projectPath: string }): void
  onData(tabId: TabId, cb: (data: string) => void): Unsubscribe
  onExit(tabId: TabId, cb: () => void): Unsubscribe
}

const DEFAULT_COLS = 80
const DEFAULT_ROWS = 24

export function createTerminalSessions(deps: { host: Host }): TerminalSessions {
  const { host } = deps
  const ptys = new Map<TabId, string>()
  const cleanups = new Map<TabId, Unsubscribe[]>()
  const dataSubs = new Map<TabId, Set<(data: string) => void>>()
  const exitSubs = new Map<TabId, Set<() => void>>()

  function spawn(tab: { id: TabId; projectPath: string }): void {
    const ptyId = host.spawnPty({
      cwd: tab.projectPath,
      cols: DEFAULT_COLS,
      rows: DEFAULT_ROWS,
      env: {
        CLU_TAB_ID: tab.id,
        CLU_ENV_FILE: envFilePath(tab.projectPath),
        CLU_FILE: '',
        CLU_FILES: '',
      },
    })
    ptys.set(tab.id, ptyId)
    // Guard every callback on THIS specific ptyId: after a restart the tab.id
    // maps to a new pty, and a late exit/data event from the old pty (already
    // in flight across IPC) must not clobber the live one (finding C5).
    const offData = host.onPtyData(ptyId, (data) => {
      if (ptys.get(tab.id) !== ptyId) return
      dataSubs.get(tab.id)?.forEach((cb) => cb(data))
    })
    const offExit = host.onPtyExit(ptyId, () => {
      if (ptys.get(tab.id) !== ptyId) return // stale old-pty exit — ignore
      ptys.delete(tab.id)
      exitSubs.get(tab.id)?.forEach((cb) => cb())
    })
    cleanups.set(tab.id, [offData, offExit])
  }

  function teardown(tabId: TabId): void {
    cleanups.get(tabId)?.forEach((off) => off())
    cleanups.delete(tabId)
    ptys.delete(tabId)
  }

  return {
    ensure(tab) {
      if (!ptys.has(tab.id)) spawn(tab)
    },
    has: (tabId) => ptys.has(tabId),
    write(tabId, data) {
      const ptyId = ptys.get(tabId)
      if (ptyId) host.ptyWrite(ptyId, data)
    },
    resize(tabId, cols, rows) {
      const ptyId = ptys.get(tabId)
      if (ptyId) host.ptyResize(ptyId, cols, rows)
    },
    kill(tabId) {
      const ptyId = ptys.get(tabId)
      if (ptyId) host.ptyKill(ptyId)
      teardown(tabId)
    },
    restart(tab) {
      this.kill(tab.id)
      spawn(tab)
    },
    onData(tabId, cb): Unsubscribe {
      let subs = dataSubs.get(tabId)
      if (!subs) dataSubs.set(tabId, (subs = new Set()))
      subs.add(cb)
      return () => subs.delete(cb)
    },
    onExit(tabId, cb): Unsubscribe {
      let subs = exitSubs.get(tabId)
      if (!subs) exitSubs.set(tabId, (subs = new Set()))
      subs.add(cb)
      return () => subs.delete(cb)
    },
  }
}
