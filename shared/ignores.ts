// Single source of truth for ignored directories (task 3.5m, finding F2).
// Previously the tree's hide-list and the watcher's ignore-list diverged, so a
// dir the tree could reveal (dist/out/.clu in 'all'/'dotfiles' mode) was
// dropped by the watcher → stale, silently non-refreshing content.
//
// v1.0 rule: these dirs are NEVER watched, so they are NEVER shown — that keeps
// "what's shown" == "what's watched". (.gitignore-aware watching is v1.5.)

/** Directory names that are never shown in the tree and never watched. */
export const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  '.clu',
  'dist',
  'build',
  'out',
])

/** True when a directory entry name is on the never-show/never-watch list. */
export function isIgnoredName(name: string): boolean {
  return IGNORED_DIRS.has(name)
}

/** True when any path segment under `root` is ignored (watcher filtering). */
export function isIgnoredPath(root: string, absPath: string): boolean {
  const base = root.replace(/\/+$/, '')
  const rel =
    absPath === base
      ? ''
      : absPath.startsWith(`${base}/`)
        ? absPath.slice(base.length + 1)
        : absPath
  return rel.split('/').some((seg) => IGNORED_DIRS.has(seg))
}
