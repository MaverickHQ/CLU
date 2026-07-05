// Pure path derivation for CLU's per-project footprint (ADR-0001). String-only
// (no node:path) so both processes and jsdom tests can use it.

/** Last path segment (directory or file name); trailing slashes ignored. */
export function basename(p: string): string {
  const parts = p.replace(/\/+$/, '').split('/')
  return parts[parts.length - 1] || p
}

/** Parent directory of an absolute path. A root-level path (e.g. `/a.ts`)
 *  returns itself, matching the callers' historical `|| path` fallback. */
export function parentDir(p: string): string {
  const trimmed = p.replace(/\/+$/, '')
  const i = trimmed.lastIndexOf('/')
  return i > 0 ? trimmed.slice(0, i) : trimmed
}

/** `<project-root>/.clu` with trailing slashes normalised away. */
export function cluDir(projectPath: string): string {
  return `${projectPath.replace(/\/+$/, '')}/.clu`
}

/** Per-project persisted state: `<root>/.clu/state.json`. */
export function stateFilePath(projectPath: string): string {
  return `${cluDir(projectPath)}/state.json`
}

/** $CLU_FILES env file sourced by the shell hook (ADR-0007): `<root>/.clu/env.sh`. */
export function envFilePath(projectPath: string): string {
  return `${cluDir(projectPath)}/env.sh`
}
