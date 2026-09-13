// R2.2 (ADR-0012) — session-resume store behaviour: config round-trip, capture
// on close, offer on reopen. Tested through public actions against the fake Host.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createFakeHost } from '@shared/host.fake'
import { SCHEMA_VERSION, defaultAppState } from '@shared/types'
import { createCockpitStore, SAVE_DEBOUNCE_MS } from './cockpit'

const ID_OLD = '11111111-1111-4111-8111-111111111111'
const ID_NEW = '22222222-2222-4222-8222-222222222222'

describe('session resume store (R2.2)', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  function setup() {
    const host = createFakeHost()
    host.pathExists = async () => true
    const store = createCockpitStore({ host })
    return { host, store }
  }

  it('(d) hydrate restores sessionResume + resumeCandidates; missing → defaults', async () => {
    const { host, store } = setup()
    await host.state.saveApp({
      ...defaultAppState(),
      sessionResume: { enabled: false },
      resumeCandidates: { '/proj/a': { sessionId: ID_NEW, capturedAt: 123 } },
    })
    await store.getState().hydrate()
    expect(store.getState().sessionResume).toEqual({ enabled: false })
    expect(store.getState().resumeCandidates['/proj/a']).toEqual({ sessionId: ID_NEW, capturedAt: 123 })

    // An older app.json with neither field → defaults, no crash.
    const bare = createCockpitStore({ host })
    await host.state.saveApp({ schemaVersion: SCHEMA_VERSION, theme: 'kiro-dark', lastProjectPath: null })
    await bare.getState().hydrate()
    expect(bare.getState().sessionResume).toEqual({ enabled: true })
    expect(bare.getState().resumeCandidates).toEqual({})
  })

  it('(e) closeTab captures the newest session touched during the Tab lifetime', async () => {
    const { host, store } = setup()
    const id = await store.getState().openTab('/proj/a')
    const openedAt = store.getState().tabs[0].openedAt!
    host.fake.setSessions('/proj/a', [
      { id: ID_OLD, mtimeMs: openedAt - 5000 }, // before this Tab → ignored
      { id: ID_NEW, mtimeMs: openedAt + 5000 }, // during this Tab → captured
    ])
    await store.getState().closeTab(id)
    expect(store.getState().resumeCandidates['/proj/a']?.sessionId).toBe(ID_NEW)
  })

  it('(e) no session touched during the Tab → no candidate captured', async () => {
    const { host, store } = setup()
    const id = await store.getState().openTab('/proj/a')
    const openedAt = store.getState().tabs[0].openedAt!
    host.fake.setSessions('/proj/a', [{ id: ID_OLD, mtimeMs: openedAt - 5000 }])
    await store.getState().closeTab(id)
    expect(store.getState().resumeCandidates['/proj/a']).toBeUndefined()
  })

  it('(e) capture is skipped when session resume is disabled', async () => {
    const { host, store } = setup()
    store.getState().setSessionResumeConfig({ enabled: false })
    const id = await store.getState().openTab('/proj/a')
    const openedAt = store.getState().tabs[0].openedAt!
    host.fake.setSessions('/proj/a', [{ id: ID_NEW, mtimeMs: openedAt + 5000 }])
    await store.getState().closeTab(id)
    expect(store.getState().resumeCandidates['/proj/a']).toBeUndefined()
  })

  it('(f) reopen offers the captured session when it still exists on disk', async () => {
    const { host, store } = setup()
    store.setState({ resumeCandidates: { '/proj/a': { sessionId: ID_NEW, capturedAt: 1 } } })
    host.fake.setSessions('/proj/a', [{ id: ID_NEW, mtimeMs: 10 }])
    await store.getState().openTab('/proj/a')
    await vi.runAllTimersAsync()
    expect(store.getState().tabs[0].resumeAvailable).toBe(ID_NEW)
  })

  it('(f) a candidate whose file is gone is dropped and not offered', async () => {
    const { host, store } = setup()
    store.setState({ resumeCandidates: { '/proj/a': { sessionId: ID_NEW, capturedAt: 1 } } })
    host.fake.setSessions('/proj/a', [{ id: ID_OLD, mtimeMs: 10 }]) // ID_NEW deleted
    await store.getState().openTab('/proj/a')
    await vi.runAllTimersAsync()
    expect(store.getState().tabs[0].resumeAvailable).toBeUndefined()
    expect(store.getState().resumeCandidates['/proj/a']).toBeUndefined()
  })

  it('(f) no offer when session resume is disabled', async () => {
    const { host, store } = setup()
    store.getState().setSessionResumeConfig({ enabled: false })
    store.setState({ resumeCandidates: { '/proj/a': { sessionId: ID_NEW, capturedAt: 1 } } })
    host.fake.setSessions('/proj/a', [{ id: ID_NEW, mtimeMs: 10 }])
    await store.getState().openTab('/proj/a')
    await vi.runAllTimersAsync()
    expect(store.getState().tabs[0].resumeAvailable).toBeUndefined()
  })

  it('clearResumeAvailable drops the offer without persisting', async () => {
    const { host, store } = setup()
    store.setState({ resumeCandidates: { '/proj/a': { sessionId: ID_NEW, capturedAt: 1 } } })
    host.fake.setSessions('/proj/a', [{ id: ID_NEW, mtimeMs: 10 }])
    const id = await store.getState().openTab('/proj/a')
    await vi.runAllTimersAsync()
    expect(store.getState().tabs[0].resumeAvailable).toBe(ID_NEW)
    store.getState().clearResumeAvailable(id)
    expect(store.getState().tabs[0].resumeAvailable).toBeUndefined()
    // candidate stays (only the transient offer cleared)
    expect(store.getState().resumeCandidates['/proj/a']).toBeDefined()
  })

  it('(d) persists sessionResume + resumeCandidates through saveApp', async () => {
    const { host, store } = setup()
    store.getState().setSessionResumeConfig({ enabled: false })
    store.setState({ resumeCandidates: { '/proj/a': { sessionId: ID_NEW, capturedAt: 9 } } })
    store.getState().setSessionResumeConfig({ enabled: false }) // trigger scheduleAppSave
    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS)
    const saved = await host.state.loadApp()
    expect(saved?.sessionResume).toEqual({ enabled: false })
  })
})
