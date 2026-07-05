// Task 3.4 behaviours (1)-(5): tree model pure functions.
import { describe, expect, it } from 'vitest'
import {
  buildTree,
  cycleHiddenMode,
  filterEntries,
  parsePorcelain,
  sortEntries,
  statusFor,
} from './model'

describe('(1) sortEntries', () => {
  it('sorts dirs first, then case-insensitive alphabetical', () => {
    const sorted = sortEntries([
      { name: 'zeta.ts', isDir: false },
      { name: 'src', isDir: true },
      { name: 'Alpha.md', isDir: false },
      { name: 'Docs', isDir: true },
    ])
    expect(sorted.map((e) => e.name)).toEqual(['Docs', 'src', 'Alpha.md', 'zeta.ts'])
  })
})

describe('(2) hidden-mode cycle + filtering', () => {
  it('cycles default → dotfiles → all → default', () => {
    expect(cycleHiddenMode('default')).toBe('dotfiles')
    expect(cycleHiddenMode('dotfiles')).toBe('all')
    expect(cycleHiddenMode('all')).toBe('default')
  })

  const entries = [
    { name: 'src', isDir: true },
    { name: '.clu', isDir: true },
    { name: '.env', isDir: false },
    { name: 'node_modules', isDir: true },
    { name: 'README.md', isDir: false },
  ]

  it('default hides dotfiles and ignored dirs', () => {
    expect(filterEntries(entries, 'default').map((e) => e.name)).toEqual(['src', 'README.md'])
  })
  it('dotfiles mode shows dotfiles (.env) but ignored dirs (.clu, node_modules) stay hidden', () => {
    // .clu is on the never-watch list → never shown, even though it's a dotfile.
    expect(filterEntries(entries, 'dotfiles').map((e) => e.name)).toEqual([
      'src',
      '.env',
      'README.md',
    ])
  })
  it('(F2) all mode still hides the never-watched ignored dirs (shown == watched)', () => {
    const shown = filterEntries(entries, 'all').map((e) => e.name)
    expect(shown).toContain('.env') // dotfile revealed
    expect(shown).not.toContain('node_modules') // never watched → never shown
    expect(shown).not.toContain('.clu')
  })
})

describe('(3) parsePorcelain', () => {
  it('maps unstaged/staged/untracked and renames (fixture from real git)', () => {
    const map = parsePorcelain({
      prefix: '',
      porcelain: [
        ' M src/a.ts',
        'M  src/staged.ts',
        'A  docs/new.md',
        '?? scratch.txt',
        'R  old-name.ts -> new-name.ts',
        '"?? name with space.md"', // quoted path passthrough
      ].join('\n'),
    })
    expect(map.get('src/a.ts')).toBe('M')
    expect(map.get('src/staged.ts')).toBe('A')
    expect(map.get('docs/new.md')).toBe('A')
    expect(map.get('scratch.txt')).toBe('?')
    expect(map.get('new-name.ts')).toBe('A') // rename decorates the new path
    expect(map.has('old-name.ts')).toBe(false)
  })

  it('(5) null status (not a git repo) → empty map, no error', () => {
    expect(parsePorcelain(null).size).toBe(0)
  })

  it('(3.6b) rebases repo-root-relative paths onto a Project that is a repo subdir', () => {
    // Project = <repo>/packages/app; git prints repo-root-relative paths.
    const map = parsePorcelain({
      prefix: 'packages/app/',
      porcelain: [
        ' M packages/app/src/a.ts', // inside the Project → decorated, rebased
        'A  packages/app/new.md',
        'R  packages/app/old.ts -> packages/app/renamed.ts',
        ' M packages/other/z.ts', // sibling package, outside the Project → dropped
        ' M README.md', // repo-root file, outside the Project → dropped
      ].join('\n'),
    })
    expect(map.get('src/a.ts')).toBe('M') // prefix stripped
    expect(map.get('new.md')).toBe('A')
    expect(map.get('renamed.ts')).toBe('A') // rename new path, rebased
    expect(map.has('packages/other/z.ts')).toBe(false)
    expect(map.has('README.md')).toBe(false)
    expect(map.size).toBe(3)
  })
})

describe('(4) statusFor directory aggregation', () => {
  const map = parsePorcelain({
    prefix: '',
    porcelain: [' M src/deep/a.ts', '?? src/new.ts', 'A  docs/d.md'].join('\n'),
  })

  it('files get their own status', () => {
    expect(statusFor('src/deep/a.ts', false, map)).toBe('M')
    expect(statusFor('clean.ts', false, map)).toBeNull()
  })
  it('dirs aggregate the highest-priority descendant (M > A > ?)', () => {
    expect(statusFor('src', true, map)).toBe('M')
    expect(statusFor('docs', true, map)).toBe('A')
    expect(statusFor('empty', true, map)).toBeNull()
  })
})

describe('buildTree', () => {
  it('nests loaded dirs, applies filter + sort, leaves unloaded dirs childless', () => {
    const entriesByDir = new Map([
      [
        '/p',
        [
          { name: 'src', isDir: true },
          { name: '.env', isDir: false },
          { name: 'README.md', isDir: false },
        ],
      ],
      ['/p/src', [{ name: 'main.ts', isDir: false }]],
    ])
    const tree = buildTree('/p', entriesByDir, 'default')
    expect(tree.map((n) => n.name)).toEqual(['src', 'README.md']) // .env hidden
    expect(tree[0].children?.map((n) => n.id)).toEqual(['/p/src/main.ts'])
    expect(tree[1].children).toBeUndefined()
  })
})
