// R2.2a — pure mapping from a project cwd to Claude Code's transcript dir slug.
// Claude Code collapses both '/' and '.' to '-' when naming ~/.claude/projects/<slug>,
// which is why a path containing a dotted directory yields a '--' run.
import { describe, expect, it } from 'vitest'
import { projectSlug } from './paths'

describe('projectSlug', () => {
  it('replaces every / with - (leading slash → leading -)', () => {
    expect(projectSlug('/home/dev/app')).toBe('-home-dev-app')
  })

  it('replaces . as well as / (the dotted-dir double-dash case)', () => {
    // /home/dev/app/.worktrees/x → …-app--worktrees-x (the '/.' collapses to '--')
    expect(projectSlug('/home/dev/app/.worktrees/x')).toBe('-home-dev-app--worktrees-x')
  })

  it('leaves existing hyphens in a dir name untouched', () => {
    expect(projectSlug('/home/dev/my-test-lab')).toBe('-home-dev-my-test-lab')
  })
})
