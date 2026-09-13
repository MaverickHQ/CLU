// Task 2.4 behaviours: provisional-PTY-ID reconciliation + subscription routing
// in electronHost, tested against a mocked PreloadBridge (pure logic, no
// Electron). Runs in the node Vitest project (renderer/**/host/** include).
import { describe, expect, it, vi } from 'vitest'
import type { PreloadBridge } from '@shared/ipc'
import { createElectronHost } from './electronHost'

/** Mock bridge with controllable spawn resolution + push-channel emitters. */
function createMockBridge() {
  let emitData: (id: string, data: string) => void = () => {}
  let emitExit: (id: string) => void = () => {}
  let resolveSpawn: (id: string) => void = () => {}

  const writes: Array<{ id: string; data: string }> = []
  const kills: string[] = []
  const resizes: Array<{ id: string; cols: number; rows: number }> = []
  const watchStops: number[] = []

  const bridge: PreloadBridge = {
    state: {
      saveProject: vi.fn(async () => {}),
      loadProject: vi.fn(async () => null),
      saveApp: vi.fn(async () => {}),
      loadApp: vi.fn(async () => null),
    },
    readFile: vi.fn(async () => ({ content: '', sizeBytes: 0 })),
    writeFile: vi.fn(async () => {}),
    listDir: vi.fn(async () => []),
    writeEnvFile: vi.fn(async () => {}),
    gitStatus: vi.fn(async () => null),
    pathExists: vi.fn(async () => true),
    registerRoot: vi.fn(async () => {}),
    getDroppedPath: vi.fn(() => '/resolved/by/webutils'),
    pickDirectory: vi.fn(async () => null),
    onQuitRequest: vi.fn(() => () => {}),
    confirmQuit: vi.fn(),
    notify: vi.fn(),
    onFocusTab: vi.fn(() => () => {}),
    watchStart: vi.fn(async () => 7),
    watchStop: vi.fn(async (id: number) => {
      watchStops.push(id)
    }),
    onWatchEvent: vi.fn(() => () => {}),
    ptySpawn: vi.fn(
      () =>
        new Promise<string>((resolve) => {
          resolveSpawn = resolve
        }),
    ),
    ptyWrite: (id, data) => writes.push({ id, data }),
    ptyResize: (id, cols, rows) => resizes.push({ id, cols, rows }),
    ptyKill: (id) => kills.push(id),
    onPtyData: (cb) => {
      emitData = cb
      return () => {}
    },
    onPtyExit: (cb) => {
      emitExit = cb
      return () => {}
    },
  }

  return {
    bridge,
    writes,
    kills,
    resizes,
    watchStops,
    emitData: (id: string, data: string) => emitData(id, data),
    emitExit: (id: string) => emitExit(id),
    resolveSpawn: (id: string) => resolveSpawn(id),
  }
}

const flush = () => new Promise((r) => setTimeout(r, 0))

describe('electronHost PTY reconciliation', () => {
  it('returns a provisional id synchronously and buffers writes until spawn resolves', async () => {
    const m = createMockBridge()
    const host = createElectronHost(m.bridge)

    const id = host.spawnPty({ cwd: '/p', cols: 80, rows: 24 })
    expect(id).toMatch(/^provisional-/)

    host.ptyWrite(id, 'first\r')
    host.ptyWrite(id, 'second\r')
    expect(m.writes).toEqual([]) // buffered — real id not known yet

    m.resolveSpawn('pty-9')
    await flush()
    expect(m.writes).toEqual([
      { id: 'pty-9', data: 'first\r' },
      { id: 'pty-9', data: 'second\r' },
    ])

    host.ptyWrite(id, 'third\r') // post-reconciliation writes go straight through
    expect(m.writes[2]).toEqual({ id: 'pty-9', data: 'third\r' })
  })

  it('re-keys data subscriptions from provisional to real id', async () => {
    const m = createMockBridge()
    const host = createElectronHost(m.bridge)
    const onData = vi.fn()

    const id = host.spawnPty({ cwd: '/p', cols: 80, rows: 24 })
    host.onPtyData(id, onData)

    m.resolveSpawn('pty-3')
    await flush()

    m.emitData('pty-3', 'hello')
    expect(onData).toHaveBeenCalledWith('hello')
  })

  it('routes exit events and maps kill/resize through the real id', async () => {
    const m = createMockBridge()
    const host = createElectronHost(m.bridge)
    const onExit = vi.fn()

    const id = host.spawnPty({ cwd: '/p', cols: 80, rows: 24 })
    host.onPtyExit(id, onExit)
    m.resolveSpawn('pty-1')
    await flush()

    host.ptyResize(id, 120, 40)
    host.ptyKill(id)
    expect(m.resizes).toEqual([{ id: 'pty-1', cols: 120, rows: 40 }])
    expect(m.kills).toEqual(['pty-1'])

    m.emitExit('pty-1')
    expect(onExit).toHaveBeenCalledTimes(1)
  })

  it('(3.6a) buffers a resize on the provisional id and applies it on spawn resolve', async () => {
    const m = createMockBridge()
    const host = createElectronHost(m.bridge)

    const id = host.spawnPty({ cwd: '/p', cols: 80, rows: 24 })
    // FitAddon fits on mount, before the async spawn resolves. A bare
    // ptyResize(provisional) would throw 'unknown pty id' in main.
    host.ptyResize(id, 200, 50)
    expect(m.resizes).toEqual([]) // buffered, not sent to the (unknown) provisional

    m.resolveSpawn('pty-5')
    await flush()
    expect(m.resizes).toEqual([{ id: 'pty-5', cols: 200, rows: 50 }]) // applied on real id

    host.ptyResize(id, 120, 40) // post-reconciliation resizes go straight through
    expect(m.resizes).toEqual([
      { id: 'pty-5', cols: 200, rows: 50 },
      { id: 'pty-5', cols: 120, rows: 40 },
    ])
  })

  it('unsubscribing one data listener leaves siblings attached', async () => {
    const m = createMockBridge()
    const host = createElectronHost(m.bridge)
    const a = vi.fn()
    const b = vi.fn()

    const id = host.spawnPty({ cwd: '/p', cols: 80, rows: 24 })
    m.resolveSpawn('pty-2')
    await flush()

    const offA = host.onPtyData(id, a)
    host.onPtyData(id, b)
    offA()

    m.emitData('pty-2', 'tick')
    expect(a).not.toHaveBeenCalled()
    expect(b).toHaveBeenCalledWith('tick')
  })

  it('keeps two concurrent tabs isolated across reconciliation', async () => {
    const m = createMockBridge()
    // Two spawns need two separately controllable promises.
    const resolvers: Array<(id: string) => void> = []
    m.bridge.ptySpawn = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          resolvers.push(resolve)
        }),
    )
    const host = createElectronHost(m.bridge)
    const dataA = vi.fn()
    const dataB = vi.fn()

    const a = host.spawnPty({ cwd: '/a', cols: 80, rows: 24 })
    const b = host.spawnPty({ cwd: '/b', cols: 80, rows: 24 })
    host.onPtyData(a, dataA)
    host.onPtyData(b, dataB)

    resolvers[0]('pty-a')
    resolvers[1]('pty-b')
    await flush()

    m.emitData('pty-b', 'for-b')
    expect(dataB).toHaveBeenCalledWith('for-b')
    expect(dataA).not.toHaveBeenCalled()
  })
})

describe('electronHost provisional kill (C4)', () => {
  it('killing before spawn resolves kills the real pty on resolve (no orphan)', async () => {
    const m = createMockBridge()
    const host = createElectronHost(m.bridge)

    const id = host.spawnPty({ cwd: '/p', cols: 80, rows: 24 })
    host.ptyKill(id) // killed while spawn is still pending
    expect(m.kills).toEqual([]) // nothing to kill yet

    m.resolveSpawn('pty-7')
    await flush()
    expect(m.kills).toEqual(['pty-7']) // real pty killed on resolve → no orphan
  })

  it('a rejected spawn surfaces an exit to subscribers and cleans up', async () => {
    const m = createMockBridge()
    m.bridge.ptySpawn = vi.fn(() => Promise.reject(new Error('posix_spawnp failed')))
    const host = createElectronHost(m.bridge)
    const onExit = vi.fn()

    const id = host.spawnPty({ cwd: '/bad', cols: 80, rows: 24 })
    host.onPtyExit(id, onExit)
    await flush()

    expect(onExit).toHaveBeenCalledTimes(1) // UI can show shell-exited
  })
})

describe('electronHost watch routing', () => {
  it('delivers only events for its own watchId and stops on unsubscribe', async () => {
    const m = createMockBridge()
    let watchCb: (id: number, events: unknown) => void = () => {}
    m.bridge.onWatchEvent = vi.fn((cb) => {
      watchCb = cb
      return () => {}
    })
    const host = createElectronHost(m.bridge)
    const onEvents = vi.fn()

    const unsub = host.watchDir('/p', onEvents)
    await flush() // watchStart resolves → watchId = 7

    watchCb(7, [{ type: 'change', path: '/p/x.ts' }])
    watchCb(99, [{ type: 'change', path: '/q/other.ts' }])
    expect(onEvents).toHaveBeenCalledTimes(1)
    expect(onEvents).toHaveBeenCalledWith([{ type: 'change', path: '/p/x.ts' }])

    unsub()
    expect(m.watchStops).toEqual([7])
  })
})
