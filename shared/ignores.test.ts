// Task 3.5m: the canonical ignore set drives both tree-hide and watch-drop (F2).
import { describe, expect, it } from 'vitest'
import { IGNORED_DIRS, isIgnoredName, isIgnoredPath } from './ignores'
import { filterEntries } from '../renderer/src/tree/model'

describe('canonical ignores (F2)', () => {
  it('the same set that hides in the tree drops in the watcher', () => {
    for (const name of IGNORED_DIRS) {
      expect(isIgnoredName(name)).toBe(true) // tree hides it
      expect(isIgnoredPath('/p', `/p/${name}/x`)).toBe(true) // watcher drops it
    }
  })

  it('nothing the tree shows in "all" mode is unwatched', () => {
    const entries = [...IGNORED_DIRS].map((name) => ({ name, isDir: true }))
    entries.push({ name: '.env', isDir: false }, { name: 'src', isDir: true })
    for (const e of filterEntries(entries, 'all')) {
      expect(isIgnoredPath('/p', `/p/${e.name}`)).toBe(false) // shown ⇒ watched
    }
  })
})
