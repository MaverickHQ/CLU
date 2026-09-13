// R2.2 — Claude session resume (ADR-0012). Claude Code stores each session at
// ~/.claude/projects/<slug>/<session-id>.jsonl, where the slug is the project
// working directory with both path separators ('/') and dots ('.') replaced by
// '-'. This is the sole coupling to Claude Code's on-disk layout; it is pure and
// fixture-tested, and callers degrade to "no resume" if the computed dir is absent.

/** Map a project cwd to Claude Code's transcript directory slug. */
export function projectSlug(cwd: string): string {
  return cwd.replace(/[/.]/g, '-')
}
