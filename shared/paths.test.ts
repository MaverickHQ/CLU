// Task 2.4 behaviour: state-path derivation (pure).
import { describe, expect, it } from 'vitest'
import { basename, cluDir, envFilePath, parentDir, stateFilePath } from './paths'

describe('clu path derivation', () => {
  it('derives .clu paths from a project root', () => {
    expect(cluDir('/Users/me/proj')).toBe('/Users/me/proj/.clu')
    expect(stateFilePath('/Users/me/proj')).toBe('/Users/me/proj/.clu/state.json')
    expect(envFilePath('/Users/me/proj')).toBe('/Users/me/proj/.clu/env.sh')
  })

  it('normalises trailing slashes', () => {
    expect(stateFilePath('/p/')).toBe('/p/.clu/state.json')
    expect(stateFilePath('/p///')).toBe('/p/.clu/state.json')
  })
})

describe('(3.6h) basename / parentDir (consolidated helpers)', () => {
  it('basename returns the last segment, ignoring trailing slashes', () => {
    expect(basename('/Users/me/proj')).toBe('proj')
    expect(basename('/Users/me/proj/')).toBe('proj')
    expect(basename('/a.ts')).toBe('a.ts')
    expect(basename('/')).toBe('/') // degenerate root falls back to itself
  })

  it('parentDir returns the enclosing directory; a root-level path returns itself', () => {
    expect(parentDir('/Users/me/proj/a.ts')).toBe('/Users/me/proj')
    expect(parentDir('/Users/me/proj/')).toBe('/Users/me')
    expect(parentDir('/a.ts')).toBe('/a.ts') // no real parent → self (caller fallback)
  })
})
