// Task 3.5c: the __cluStore hook is installed only when explicitly enabled.
import { describe, expect, it } from 'vitest'
import { installTestHook } from './testHook'
import type { StoreApi } from 'zustand/vanilla'
import type { CockpitState } from './store/cockpit'

const fakeStore = {} as StoreApi<CockpitState>

describe('installTestHook', () => {
  it('does NOT attach the store when disabled (production posture)', () => {
    const win: Record<string, unknown> = {}
    installTestHook(win, fakeStore, false)
    expect(win.__cluStore).toBeUndefined()
  })

  it('attaches the store when explicitly enabled (dev/e2e)', () => {
    const win: Record<string, unknown> = {}
    installTestHook(win, fakeStore, true)
    expect(win.__cluStore).toBe(fakeStore)
  })

  it('attaches __cluForceState only when enabled (R2.1 UAT helper)', () => {
    const on: Record<string, unknown> = {}
    installTestHook(on, fakeStore, true)
    expect(typeof on.__cluForceState).toBe('function')

    const off: Record<string, unknown> = {}
    installTestHook(off, fakeStore, false)
    expect(off.__cluForceState).toBeUndefined()
  })
})
