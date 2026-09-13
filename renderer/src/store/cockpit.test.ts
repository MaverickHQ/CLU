// Task 2.3 behaviours (1)-(9): the cockpit store contract, tested through its
// public actions against the fake Host. Runs in the node Vitest project.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createFakeHost } from '@shared/host.fake'
import { defaultProjectState } from '@shared/types'
import { createCockpitStore, SAVE_DEBOUNCE_MS } from './cockpit'

describe('cockpit store', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  function setup() {
    const host = createFakeHost()
    // These are store-logic tests over existing projects; missing-project
    // behaviour is covered in lifecycle.test.ts. Treat all paths as present so
    // openTab isn't flagged missing (which would correctly skip persistence).
    host.pathExists = async () => true
    const store = createCockpitStore({ host })
    return { host, store }
  }

  it('(1) openTab adds a Tab with a unique id and makes it active', async () => {
    const { store } = setup()
    const id = await store.getState().openTab('/proj/alpha')
    expect(store.getState().tabs).toHaveLength(1)
    expect(store.getState().tabs[0]).toMatchObject({ projectPath: '/proj/alpha', name: 'alpha' })
    expect(store.getState().activeTabId).toBe(id)

    const id2 = await store.getState().openTab('/proj/beta')
    expect(id2).not.toBe(id)
    expect(store.getState().activeTabId).toBe(id2)
  })

  it('(1b) opening an already-open Project re-selects its Tab (one Tab per Project)', async () => {
    const { store } = setup()
    const a = await store.getState().openTab('/proj/alpha')
    await store.getState().openTab('/proj/beta')
    const again = await store.getState().openTab('/proj/alpha')
    expect(again).toBe(a)
    expect(store.getState().tabs).toHaveLength(2)
    expect(store.getState().activeTabId).toBe(a)
  })

  it('(2) closeTab removes the Tab and activates a neighbour', async () => {
    const { store } = setup()
    const a = await store.getState().openTab('/proj/a')
    const b = await store.getState().openTab('/proj/b')
    const c = await store.getState().openTab('/proj/c')

    store.getState().selectTab(b)
    await store.getState().closeTab(b)
    expect(store.getState().tabs.map((t) => t.id)).toEqual([a, c])
    expect(store.getState().activeTabId).toBe(c) // same index neighbour

    await store.getState().closeTab(c)
    expect(store.getState().activeTabId).toBe(a)
    await store.getState().closeTab(a)
    expect(store.getState().activeTabId).toBeNull()
  })

  it('(3) selectTab switches the active Tab; unknown ids are ignored', async () => {
    const { store } = setup()
    const a = await store.getState().openTab('/proj/a')
    await store.getState().openTab('/proj/b')
    store.getState().selectTab(a)
    expect(store.getState().activeTabId).toBe(a)
    store.getState().selectTab('nope')
    expect(store.getState().activeTabId).toBe(a)
  })

  it('(4) pin appends in insertion order; unpin removes', async () => {
    const { store } = setup()
    const id = await store.getState().openTab('/p')
    store.getState().pin(id, '/p/b.ts')
    store.getState().pin(id, '/p/a.ts')
    expect(store.getState().tabs[0].pinSet).toEqual(['/p/b.ts', '/p/a.ts'])

    store.getState().unpin(id, '/p/b.ts')
    expect(store.getState().tabs[0].pinSet).toEqual(['/p/a.ts'])
  })

  it('(5) pin is idempotent — no duplicates', async () => {
    const { store } = setup()
    const id = await store.getState().openTab('/p')
    store.getState().pin(id, '/p/a.ts')
    store.getState().pin(id, '/p/a.ts')
    expect(store.getState().tabs[0].pinSet).toEqual(['/p/a.ts'])
  })

  it('(6) a burst of mutations coalesces into ONE debounced saveProject', async () => {
    const { host, store } = setup()
    const id = await store.getState().openTab('/p')
    const saveSpy = vi.spyOn(host.state, 'saveProject')

    store.getState().pin(id, '/p/a.ts')
    store.getState().pin(id, '/p/b.ts')
    store.getState().setViewerFile(id, '/p/a.ts')
    expect(saveSpy).not.toHaveBeenCalled() // still inside the debounce window

    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS + 10)
    expect(saveSpy).toHaveBeenCalledTimes(1)
    expect(saveSpy.mock.calls[0][0]).toBe('/p')
    expect(saveSpy.mock.calls[0][1].pinSet).toEqual(['/p/a.ts', '/p/b.ts'])
    expect(saveSpy.mock.calls[0][1].viewerFile).toBe('/p/a.ts')
  })

  it('(7) hydrate restores app prefs + last Project without re-triggering saves', async () => {
    const { host, store } = setup()
    host.fake.addDir('/p')
    await host.state.saveApp({ schemaVersion: 1, theme: 'solarized-light', lastProjectPath: '/p' })
    await host.state.saveProject('/p', { ...defaultProjectState('p'), pinSet: ['/p/x.ts'] })
    const saveSpy = vi.spyOn(host.state, 'saveProject')

    await store.getState().hydrate()
    expect(store.getState().theme).toBe('solarized-light')
    expect(store.getState().tabs[0]).toMatchObject({ projectPath: '/p', pinSet: ['/p/x.ts'] })

    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS * 3)
    expect(saveSpy).not.toHaveBeenCalled() // hydration must not write back
  })

  it('(8) missing/corrupt persisted state falls back to defaults', async () => {
    const { store } = setup()
    const id = await store.getState().openTab('/fresh')
    const tab = store.getState().tabs.find((t) => t.id === id)!
    expect(tab.pinSet).toEqual([])
    expect(tab.hiddenMode).toBe('default')
    expect(tab.splits).toEqual({ treePct: 25, terminalPct: 35 })
  })

  it('(3.5n-N3) two concurrent openTab(sameProject) yield exactly one Tab', async () => {
    const { store } = setup()
    const [a, b] = await Promise.all([
      store.getState().openTab('/proj/dup'),
      store.getState().openTab('/proj/dup'),
    ])
    expect(a).toBe(b)
    expect(store.getState().tabs).toHaveLength(1)
  })

  it('(3.5n-N3) two concurrent hydrate() calls restore one Tab (StrictMode)', async () => {
    const { host, store } = setup()
    await host.state.saveApp({ schemaVersion: 1, theme: 'kiro-dark', lastProjectPath: '/p' })
    await Promise.all([store.getState().hydrate(), store.getState().hydrate()])
    expect(store.getState().tabs.filter((t) => t.projectPath === '/p')).toHaveLength(1)
  })

  it('(9) setTheme persists via app-level save (debounced)', async () => {
    const { host, store } = setup()
    host.fake.addDir('/p') // only existing projects become the sticky recent
    await store.getState().openTab('/p')
    store.getState().setTheme('tomorrow-night-blue')
    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS + 10)
    const app = await host.state.loadApp()
    expect(app?.theme).toBe('tomorrow-night-blue')
    expect(app?.lastProjectPath).toBe('/p')
  })

  it('(2b) closeTab flushes pending state before removal', async () => {
    const { host, store } = setup()
    const id = await store.getState().openTab('/p')
    store.getState().pin(id, '/p/a.ts')
    await store.getState().closeTab(id) // no timer advance — flush must be forced
    const persisted = await host.state.loadProject('/p')
    expect(persisted?.pinSet).toEqual(['/p/a.ts'])
  })

  describe('(R2.1) setAgentState + background→blocked notification', () => {
    it('updates the Tab agentState', async () => {
      const { store } = setup()
      const id = await store.getState().openTab('/p')
      store.getState().setAgentState(id, 'working')
      expect(store.getState().tabs.find((t) => t.id === id)?.agentState).toBe('working')
    })

    it('notifies when a BACKGROUND Tab becomes blocked', async () => {
      const { host, store } = setup()
      const a = await store.getState().openTab('/proj/a')
      await store.getState().openTab('/proj/b') // b is now active, a is background
      store.getState().setAgentState(a, 'blocked')
      expect(host.fake.notifies).toHaveLength(1)
      expect(host.fake.notifies[0]).toMatchObject({ tabId: a, body: 'a' })
    })

    it('does NOT notify for the active Tab (its terminal is on screen)', async () => {
      const { host, store } = setup()
      const a = await store.getState().openTab('/proj/a') // a is active
      store.getState().setAgentState(a, 'blocked')
      expect(host.fake.notifies).toHaveLength(0)
    })

    it('does NOT re-notify while a background Tab stays blocked', async () => {
      const { host, store } = setup()
      const a = await store.getState().openTab('/proj/a')
      await store.getState().openTab('/proj/b')
      store.getState().setAgentState(a, 'blocked')
      store.getState().setAgentState(a, 'blocked') // repeat sample
      expect(host.fake.notifies).toHaveLength(1)
    })
  })
})
