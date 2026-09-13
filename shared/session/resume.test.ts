// R2.2a — the command CLU types into the shell to reconnect a saved session.
import { describe, expect, it } from 'vitest'
import { resumeCommand } from './resume'

describe('resumeCommand', () => {
  it('builds `claude --resume` with the POSIX-quoted id', () => {
    expect(resumeCommand('11111111-2222-4333-8444-555555555555')).toBe(
      "claude --resume '11111111-2222-4333-8444-555555555555'",
    )
  })

  it('quotes defensively even though ids are UUIDs (no shell injection)', () => {
    // A pathological id must not break out of the single-quote wrapper.
    expect(resumeCommand("x'; rm -rf /")).toBe("claude --resume 'x'\\''; rm -rf /'")
  })
})
