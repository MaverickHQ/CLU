// Task 3.3 behaviours: close-confirm flow, don't-ask prefs, quit aggregation,
// missing projects, forced saves on user-visible boundaries.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createFakeHost } from '@shared/host.fake'
import { createTerminalSessions } from '../terminal/sessions'
import { wireQuit, wireTerminals } from '../terminal/wire'
import { createCockpitStore, SAVE_DEBOUNCE_MS } from './cockpit'

describe('tab lifecycle', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  function setup() {
    const host = createFakeHost()
    host.fake.addDir('/p')
    host.fake.addDir('/q')
    const store = createCockpitStore({ host })
    const sessions = createTerminalSessions({ host })
    wireTerminals(store, sessions)
    wireQuit(store, sessions, host)
    return { host, store, sessions }
  }

  it('(1) closing a Tab with a live PTY asks first; without one it just closes', async () => {
    const { store, sessions } = setup()
    const id = await store.getState().openTab('/p')

    store.getState().requestCloseTab(id, { hasLiveSession: false })
    await vi.advanceTimersByTimeAsync(0)
    expect(store.getState().tabs).toHaveLength(0) // closed straight away

    const id2 = await store.getState().openTab('/p')
    sessions.ensure({ id: id2, projectPath: '/p' })
    store.getState().requestCloseTab(id2, { hasLiveSession: true })
    expect(store.getState().pendingClose).toEqual({ kind: 'tab', tabId: id2 })
    expect(store.getState().tabs).toHaveLength(1) // still open, awaiting confirm
  })

  it('(2) confirm closes + flushes; cancel is a no-op', async () => {
    const { host, store } = setup()
    const id = await store.getState().openTab('/p')
    store.getState().pin(id, '/p/a.ts')
    store.getState().requestCloseTab(id, { hasLiveSession: true })

    store.getState().cancelPendingClose()
    expect(store.getState().pendingClose).toBeNull()
    expect(store.getState().tabs).toHaveLength(1)

    store.getState().requestCloseTab(id, { hasLiveSession: true })
    await store.getState().confirmPendingClose()
    expect(store.getState().tabs).toHaveLength(0)
    expect((await host.state.loadProject('/p'))?.pinSet).toEqual(['/p/a.ts']) // flushed
  })

  it('(3) dontAskCloseTab bypasses the modal and persists', async () => {
    const { host, store } = setup()
    const id = await store.getState().openTab('/p')
    store.getState().setDontAskCloseTab(true)

    store.getState().requestCloseTab(id, { hasLiveSession: true })
    await vi.advanceTimersByTimeAsync(0)
    expect(store.getState().pendingClose).toBeNull()
    expect(store.getState().tabs).toHaveLength(0)

    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS + 10)
    expect((await host.state.loadApp())?.dontAskCloseTab).toBe(true)
  })

  it('(4) quit request aggregates live Tabs; confirm flushes all and approves the quit', async () => {
    const { host, store, sessions } = setup()
    const a = await store.getState().openTab('/p')
    await store.getState().openTab('/q')
    sessions.ensure({ id: a, projectPath: '/p' })
    store.getState().pin(a, '/p/x.ts')

    host.fake.emitQuitRequest() // main asks; one live session → dialog
    expect(store.getState().pendingClose).toEqual({ kind: 'quit' })

    await store.getState().confirmPendingClose()
    expect(host.fake.quitConfirms).toHaveLength(1)
    expect((await host.state.loadProject('/p'))?.pinSet).toEqual(['/p/x.ts'])
  })

  it('(4b) quit with no live sessions auto-confirms without a dialog', async () => {
    const { host, store } = setup()
    await store.getState().openTab('/p')

    host.fake.emitQuitRequest()
    await vi.advanceTimersByTimeAsync(0)
    expect(store.getState().pendingClose).toBeNull()
    expect(host.fake.quitConfirms).toHaveLength(1)
  })

  it('(3.5h-N2) closing a missing-project tab does NOT save (no dir resurrection)', async () => {
    const { host, store } = setup()
    const saveSpy = vi.spyOn(host.state, 'saveProject')
    const id = await store.getState().openTab('/gone/proj') // missing===true
    expect(store.getState().tabs[0].missing).toBe(true)

    await store.getState().closeTab(id)
    await vi.advanceTimersByTimeAsync(0)
    expect(saveSpy).not.toHaveBeenCalled() // never mkdir/writes into the deleted dir
    expect(store.getState().tabs).toHaveLength(0)
  })

  it('(3.5h-N2) a saveProject rejection still closes the tab and lets quit confirm', async () => {
    const { host, store, sessions } = setup()
    const a = await store.getState().openTab('/p') // exists
    const b = await store.getState().openTab('/q')
    sessions.ensure({ id: b, projectPath: '/q' }) // a live session → quit dialog path
    store.getState().pin(a, '/p/a.ts')
    vi.spyOn(host.state, 'saveProject').mockRejectedValue(new Error('EROFS'))

    await store.getState().closeTab(a) // must not throw / hang despite the failing flush
    expect(store.getState().tabs.map((t) => t.id)).toEqual([b])

    host.fake.emitQuitRequest()
    await store.getState().confirmPendingClose()
    expect(host.fake.quitConfirms).toHaveLength(1) // quit not blocked by the failed flush
  })

  it('(6) opening a projectPath that does not exist marks the Tab missing', async () => {
    const { store } = setup()
    const missing = await store.getState().openTab('/gone/project')
    expect(store.getState().tabs.find((t) => t.id === missing)?.missing).toBe(true)

    const ok = await store.getState().openTab('/p')
    expect(store.getState().tabs.find((t) => t.id === ok)?.missing).toBeUndefined()
  })

  it('(3.8-1) every persisted payload carries schemaVersion 1', async () => {
    const { host, store } = setup()
    const id = await store.getState().openTab('/p')
    store.getState().pin(id, '/p/a.ts')
    store.getState().setTheme('solarized-light')
    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS + 10)

    expect((await host.state.loadProject('/p'))?.schemaVersion).toBe(1)
    expect((await host.state.loadApp())?.schemaVersion).toBe(1)
  })

  it('(3.8-6) quit approval happens only AFTER every project is flushed', async () => {
    const { host, store, sessions } = setup()
    const a = await store.getState().openTab('/p')
    await store.getState().openTab('/q')
    sessions.ensure({ id: a, projectPath: '/p' })
    store.getState().pin(a, '/p/x.ts')

    const order: string[] = []
    vi.spyOn(host.state, 'saveProject').mockImplementation(async (p) => {
      order.push(`save:${p}`)
    })
    vi.spyOn(host, 'confirmQuit').mockImplementation(() => {
      order.push('quit')
    })

    host.fake.emitQuitRequest()
    await store.getState().confirmPendingClose()

    expect(order.filter((o) => o.startsWith('save:')).length).toBeGreaterThanOrEqual(2)
    expect(order[order.length - 1]).toBe('quit') // approval strictly last
  })

  it('(7) switching Tabs force-saves the outgoing Project (no debounce wait)', async () => {
    const { host, store } = setup()
    const a = await store.getState().openTab('/p')
    const b = await store.getState().openTab('/q')
    const saveSpy = vi.spyOn(host.state, 'saveProject')

    store.getState().selectTab(a) // b is outgoing
    store.getState().pin(a, '/p/z.ts')
    store.getState().selectTab(b) // a is outgoing — must flush a's pin NOW
    await vi.advanceTimersByTimeAsync(0)

    const savedForP = saveSpy.mock.calls.filter(([p]) => p === '/p')
    expect(savedForP.length).toBeGreaterThanOrEqual(1)
    expect(savedForP.at(-1)![1].pinSet).toEqual(['/p/z.ts'])
  })
})
