// Task 3.5d: quit coordinator (finding C1). RED-first.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createQuitController, type WindowLike } from './quit'

function makeWin() {
  const sent: string[] = []
  let destroyed = false
  const win: WindowLike = {
    isDestroyed: () => destroyed,
    destroy: () => {
      destroyed = true
    },
    webContents: { send: (ch: string) => sent.push(ch) },
  }
  return { win, sent, isDestroyed: () => destroyed }
}

describe('quit controller', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('vetoes the first close, sends a quit request, then allows close after confirm', () => {
    const { win, sent, isDestroyed } = makeWin()
    const c = createQuitController({ quitRequestChannel: 'q:req', forceQuitMs: 3000 })

    expect(c.onClose(win)).toBe(false) // vetoed
    expect(sent).toEqual(['q:req'])

    c.confirm()
    expect(isDestroyed()).toBe(true) // controller destroyed the window
  })

  it('force-quits if the renderer never confirms within the timeout', () => {
    const { win, isDestroyed } = makeWin()
    const c = createQuitController({ quitRequestChannel: 'q:req', forceQuitMs: 3000 })
    c.onClose(win)
    expect(isDestroyed()).toBe(false)

    vi.advanceTimersByTime(3100)
    expect(isDestroyed()).toBe(true) // forced
  })

  it('never destroys an already-destroyed window (the C1 crash)', () => {
    const { win } = makeWin()
    const c = createQuitController({ quitRequestChannel: 'q:req' })
    c.onClose(win)
    win.destroy() // window died some other way
    expect(() => c.confirm()).not.toThrow() // guarded by isDestroyed()
  })

  it('a confirm with no pending close is a harmless no-op', () => {
    const c = createQuitController({ quitRequestChannel: 'q:req' })
    expect(() => c.confirm()).not.toThrow()
  })
})
