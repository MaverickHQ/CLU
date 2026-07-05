// Task 3.2: quiet-moment fallback emitter (unknown shells), fake timers.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createQuietEmitter } from './quietEmitter'

describe('quiet-moment fallback emitter', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('emits the command once the PTY has been quiet long enough', () => {
    const write = vi.fn()
    const emitter = createQuietEmitter({ write, quietMs: 500, pollMs: 250 })

    emitter.send(`export CLU_FILE='/p/a.md'`)
    expect(write).not.toHaveBeenCalled()

    vi.advanceTimersByTime(600)
    expect(write).toHaveBeenCalledWith(`export CLU_FILE='/p/a.md'\r`)
    expect(write).toHaveBeenCalledTimes(1)
  })

  it('waits while output/keystrokes keep arriving (never corrupts mid-typing)', () => {
    const write = vi.fn()
    const emitter = createQuietEmitter({ write, quietMs: 500, pollMs: 100 })

    emitter.send('export CLU_FILE=x')
    for (let i = 0; i < 8; i++) {
      vi.advanceTimersByTime(200)
      emitter.notifyActivity() // user is typing / output streaming
    }
    expect(write).not.toHaveBeenCalled()

    vi.advanceTimersByTime(700) // quiet at last
    expect(write).toHaveBeenCalledTimes(1)
  })

  it('latest request supersedes earlier ones (env state is absolute)', () => {
    const write = vi.fn()
    const emitter = createQuietEmitter({ write, quietMs: 300, pollMs: 100 })

    emitter.send('export CLU_FILES=old')
    emitter.send('export CLU_FILES=new')
    vi.advanceTimersByTime(500)

    expect(write).toHaveBeenCalledTimes(1)
    expect(write).toHaveBeenCalledWith('export CLU_FILES=new\r')
  })
})
