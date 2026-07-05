// Task 3.8 behaviours (1)(2)(4): validation is the corruption gate.
import { describe, expect, it } from 'vitest'
import { parseAppState, parseProjectState } from './stateValidate'
import { defaultProjectState, defaultAppState } from './types'

describe('parseProjectState', () => {
  it('(1) accepts a well-formed payload with schemaVersion 1', () => {
    const good = JSON.stringify({ ...defaultProjectState('clu'), pinSet: ['/p/a.ts'] })
    expect(parseProjectState(good)?.pinSet).toEqual(['/p/a.ts'])
  })

  it('(2) rejects torn/corrupt JSON', () => {
    expect(parseProjectState('{"schemaVersion":1,"name":"x"')).toBeNull() // truncated write
    expect(parseProjectState('not json at all')).toBeNull()
    expect(parseProjectState('')).toBeNull()
  })

  it('(2b) rejects shape-mangled payloads (external edits)', () => {
    expect(parseProjectState(JSON.stringify({ schemaVersion: 1, name: 'x', pinSet: 'oops' }))).toBeNull()
    expect(
      parseProjectState(
        JSON.stringify({ ...defaultProjectState('x'), splits: { treePct: 'wide' } }),
      ),
    ).toBeNull()
  })

  it('(4) rejects unknown/newer schemaVersion (corrupt-safe until migrations land)', () => {
    expect(parseProjectState(JSON.stringify({ ...defaultProjectState('x'), schemaVersion: 2 }))).toBeNull()
    expect(parseProjectState(JSON.stringify({ ...defaultProjectState('x'), schemaVersion: 0 }))).toBeNull()
  })
})

describe('parseAppState', () => {
  it('accepts valid, rejects corrupt/unknown-theme payloads', () => {
    expect(parseAppState(JSON.stringify(defaultAppState()))?.theme).toBe('kiro-dark')
    expect(parseAppState('{broken')).toBeNull()
    expect(parseAppState(JSON.stringify({ ...defaultAppState(), theme: 'hotdog-stand' }))).toBeNull()
  })
})
