// Task 3.5a: path confinement guard (findings S2, S4). RED-first.
import { describe, expect, it } from 'vitest'
import {
  isCleanProjectPath,
  isWithinRoot,
  isWithinRoots,
  normalizeAbs,
} from './pathGuard'

describe('normalizeAbs', () => {
  it('collapses ., .., and duplicate slashes', () => {
    expect(normalizeAbs('/proj/a/../b')).toBe('/proj/b')
    expect(normalizeAbs('/proj/./a//b/')).toBe('/proj/a/b')
    expect(normalizeAbs('/proj/a/../../etc/passwd')).toBe('/etc/passwd')
    expect(normalizeAbs('/../..')).toBe('/') // can't climb above root
  })
})

describe('isWithinRoot', () => {
  it('allows the root itself and paths inside it', () => {
    expect(isWithinRoot('/proj/a', '/proj/a')).toBe(true)
    expect(isWithinRoot('/proj/a', '/proj/a/src/main.ts')).toBe(true)
  })
  it('rejects traversal that escapes the root', () => {
    expect(isWithinRoot('/proj/a', '/proj/a/../../etc/passwd')).toBe(false)
    expect(isWithinRoot('/proj/a', '/etc/passwd')).toBe(false)
  })
  it('rejects prefix-sibling directories', () => {
    expect(isWithinRoot('/proj/a', '/proj/ab/x')).toBe(false)
  })
})

describe('isWithinRoots', () => {
  it('allows if within any root; fails closed on empty roots', () => {
    const roots = ['/proj/a', '/work/b']
    expect(isWithinRoots(roots, '/work/b/file')).toBe(true)
    expect(isWithinRoots(roots, '/proj/a/x')).toBe(true)
    expect(isWithinRoots(roots, '/other/z')).toBe(false)
    expect(isWithinRoots([], '/proj/a/x')).toBe(false)
  })

  it('(3.6e) a system temp path is NOT implicitly trusted — only registered roots are', () => {
    // host.ts no longer seeds roots with tmpdir()/userData; the world-writable
    // temp dir must be rejected unless explicitly registered as a project root.
    expect(isWithinRoots(['/proj/a'], '/tmp/anything')).toBe(false)
    expect(isWithinRoots(['/proj/a'], '/var/folders/xy/clu-shell-abc/env.sh')).toBe(false)
  })
})

describe('isCleanProjectPath (write-target confinement, S4)', () => {
  it('accepts a plain absolute project path', () => {
    expect(isCleanProjectPath('/Users/me/proj')).toBe(true)
    expect(isCleanProjectPath('/Users/me/proj/')).toBe(true) // trailing slash tolerated
  })
  it('rejects traversal and non-normalized paths', () => {
    expect(isCleanProjectPath('/Users/me/../evil')).toBe(false)
    expect(isCleanProjectPath('/Users/me/./proj')).toBe(false)
    expect(isCleanProjectPath('')).toBe(false)
  })
})
