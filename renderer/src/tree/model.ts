// File-tree model — pure functions (no React, no react-arborist) so the tree
// behaviour is testable in plain Node. The component is a thin renderer.

import type { DirEntry, GitStatus } from '@shared/host'
import { isIgnoredName } from '@shared/ignores'
import type { HiddenMode } from '@shared/types'

export type GitCode = 'M' | 'A' | '?'

// cycleHiddenMode lives in @shared/types (single source of truth, 3.6h);
// re-exported here so existing tree-model importers keep working.
export { cycleHiddenMode } from '@shared/types'

/**
 * Visibility per the mockup cycle: default → +dotfiles → +everything. The
 * canonical ignored dirs (node_modules/.git/.clu/dist/build/out) are hidden in
 * EVERY mode because the watcher never watches them — showing them would mean
 * stale, non-refreshing content (F2). Everything shown is watched.
 */
export function filterEntries(entries: DirEntry[], mode: HiddenMode): DirEntry[] {
  return entries.filter((e) => {
    if (isIgnoredName(e.name)) return false // never shown (never watched)
    if (mode === 'all') return true
    if (mode === 'default' && e.name.startsWith('.')) return false
    return true
  })
}

/** Dirs first, then case-insensitive alphabetical (design doc: no type-first sort). */
export function sortEntries(entries: DirEntry[]): DirEntry[] {
  return [...entries].sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
    return a.name.toLowerCase().localeCompare(b.name.toLowerCase())
  })
}

/**
 * Parse `git status` into Project-relative path → decoration. Porcelain paths
 * are repo-root-relative, so when the Project is a subdirectory of the repo we
 * rebase each path by stripping `status.prefix` (the repo→project path) and
 * dropping entries outside the Project subtree (3.6b).
 * v1.0 codes only (D/R/! are v1.5): '??' → '?', staged (X in MARC) → 'A',
 * otherwise unstaged modify → 'M'. Renames decorate the NEW path as 'A'.
 */
export function parsePorcelain(status: GitStatus | null): Map<string, GitCode> {
  const map = new Map<string, GitCode>()
  if (!status) return map
  const prefix = status.prefix
  for (const line of status.porcelain.split('\n')) {
    if (line.length < 4) continue
    const x = line[0]
    const y = line[1]
    let path = line.slice(3)
    const arrow = path.indexOf(' -> ')
    if (arrow >= 0) path = path.slice(arrow + 4) // rename: decorate the new path
    if (path.startsWith('"') && path.endsWith('"')) path = path.slice(1, -1)
    if (prefix) {
      // Project is a repo subdir: keep only paths under it, rebased to Project-relative.
      if (!path.startsWith(prefix)) continue
      path = path.slice(prefix.length)
    }
    if (x === '?' && y === '?') map.set(path, '?')
    else if ('MARC'.includes(x)) map.set(path, 'A')
    else if (y === 'M') map.set(path, 'M')
  }
  return map
}

const PRIORITY: Record<GitCode, number> = { M: 3, A: 2, '?': 1 }

/** Decoration for one node: its own status, or the highest-priority status of
 *  any descendant when the node is a directory (mockup: aggregated). */
export function statusFor(relPath: string, isDir: boolean, map: Map<string, GitCode>): GitCode | null {
  if (!isDir) return map.get(relPath) ?? null
  const prefix = relPath === '' ? '' : `${relPath}/`
  let best: GitCode | null = null
  for (const [path, code] of map) {
    if (!path.startsWith(prefix)) continue
    if (best === null || PRIORITY[code] > PRIORITY[best]) best = code
  }
  return best
}

/** react-arborist node shape, assembled from lazily-loaded dir listings. */
export interface TreeNode {
  id: string // absolute path
  name: string
  isDir: boolean
  children?: TreeNode[]
}

export function buildTree(
  rootPath: string,
  entriesByDir: ReadonlyMap<string, DirEntry[]>,
  mode: HiddenMode,
): TreeNode[] {
  function childrenOf(dirPath: string): TreeNode[] {
    const entries = entriesByDir.get(dirPath)
    if (!entries) return []
    return sortEntries(filterEntries(entries, mode)).map((e) => {
      const abs = `${dirPath.replace(/\/+$/, '')}/${e.name}`
      return {
        id: abs,
        name: e.name,
        isDir: e.isDir,
        children: e.isDir ? childrenOf(abs) : undefined,
      }
    })
  }
  return childrenOf(rootPath)
}

/** Repo-relative path for decoration lookup. */
export function relTo(rootPath: string, absPath: string): string {
  const base = rootPath.replace(/\/+$/, '')
  return absPath === base ? '' : absPath.startsWith(`${base}/`) ? absPath.slice(base.length + 1) : absPath
}
