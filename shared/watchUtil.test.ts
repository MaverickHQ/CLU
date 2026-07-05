// Task 3.7 behaviours (1)(2): batching + ignore filtering (pure, fake timers).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createEventBatcher, isIgnoredPath } from './watchUtil'

describe('(1) event batcher', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('coalesces a burst within the window into ONE emit', () => {
    const emit = vi.fn()
    const b = createEventBatcher(emit, 100)
    b.push({ type: 'add', path: '/p/a' })
    b.push({ type: 'change', path: '/p/a' })
    b.push({ type: 'unlink', path: '/p/b' })
    expect(emit).not.toHaveBeenCalled()

    vi.advanceTimersByTime(120)
    expect(emit).toHaveBeenCalledTimes(1)
    expect(emit.mock.calls[0][0]).toHaveLength(3)
  })

  it('separate quiet periods emit separately', () => {
    const emit = vi.fn()
    const b = createEventBatcher(emit, 100)
    b.push({ type: 'add', path: '/p/a' })
    vi.advanceTimersByTime(120)
    b.push({ type: 'add', path: '/p/b' })
    vi.advanceTimersByTime(120)
    expect(emit).toHaveBeenCalledTimes(2)
  })
})

describe('(2) static ignore list', () => {
  it('filters the noisy subtrees at any depth', () => {
    expect(isIgnoredPath('/p', '/p/node_modules/x/index.js')).toBe(true)
    expect(isIgnoredPath('/p', '/p/.git/objects/ab')).toBe(true)
    expect(isIgnoredPath('/p', '/p/.clu/env.sh')).toBe(true)
    expect(isIgnoredPath('/p', '/p/packages/app/dist/bundle.js')).toBe(true)
    expect(isIgnoredPath('/p', '/p/src/main.ts')).toBe(false)
    expect(isIgnoredPath('/p', '/p/README.md')).toBe(false)
  })
})
