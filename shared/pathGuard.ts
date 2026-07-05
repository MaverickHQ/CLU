// Path confinement for the IPC fs surface (task 3.5a, findings S2/S4).
// Pure + string-only (no node:path) so it runs in main and in jsdom tests.
// The threat: with sandbox:false the renderer bridge exposes fs on absolute
// paths; a compromised renderer must not read/write/delete outside the roots
// the user actually opened. env.sh is sourced by the shell, so a traversal in
// a project path is code-exec — hence writes are confined too.

/** Collapse `.` / `..` / duplicate slashes in a POSIX absolute path. A `..`
 *  that would climb above `/` is dropped (can't escape the root of the fs). */
export function normalizeAbs(p: string): string {
  const out: string[] = []
  for (const seg of p.split('/')) {
    if (seg === '' || seg === '.') continue
    if (seg === '..') out.pop()
    else out.push(seg)
  }
  return '/' + out.join('/')
}

/** True when `absPath` is `root` itself or strictly inside it, after both are
 *  normalized. Rejects traversal (`root/../etc`) and prefix-siblings
 *  (`/proj/a` does NOT contain `/proj/ab`). */
export function isWithinRoot(root: string, absPath: string): boolean {
  const r = normalizeAbs(root)
  const p = normalizeAbs(absPath)
  if (p === r) return true
  const base = r === '/' ? '/' : r + '/'
  return p.startsWith(base)
}

/** True when `absPath` is within ANY of the roots. Empty roots → nothing is
 *  allowed (fail closed). */
export function isWithinRoots(roots: Iterable<string>, absPath: string): boolean {
  for (const root of roots) if (isWithinRoot(root, absPath)) return true
  return false
}

/** A projectPath is only usable as a write target if it contains no traversal
 *  and normalizes to itself (rejects `/p/../q`, `/p/./.clu`, trailing junk). */
export function isCleanProjectPath(projectPath: string): boolean {
  if (projectPath === '') return false
  if (projectPath.split('/').includes('..')) return false
  const stripped = projectPath.replace(/\/+$/, '')
  return normalizeAbs(projectPath) === (stripped === '' ? '/' : stripped)
}

/** Thrown by confined handlers; distinguishable from fs errno errors. */
export class PathConfinementError extends Error {
  constructor(absPath: string) {
    super(`path outside the open project roots: ${absPath}`)
    this.name = 'PathConfinementError'
  }
}
