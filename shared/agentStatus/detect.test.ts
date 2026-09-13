// R2.1 — agent status detection: classifier, ruleset, arbitration, hysteresis.
// Fixtures are representative Claude terminal snapshots (bottom lines + OSC
// title) derived from the documented UI patterns; real captures should augment
// these during UAT. All pure — runs in the node Vitest project, no Electron.
import { describe, expect, it } from 'vitest'
import { claudeRuleset } from './claudeRuleset'
import {
  ACTIVE_WINDOW_MS,
  classify,
  commit,
  initialCommitState,
  shouldNotifyBlocked,
  type CommitState,
} from './detect'
import type { AgentDetection, DetectSample } from './types'

const rs = claudeRuleset

function sample(
  bottomLines: string[],
  opts: { oscTitle?: string | null; msSinceData?: number } = {},
): DetectSample {
  return {
    bottomLines,
    oscTitle: opts.oscTitle ?? null,
    msSinceData: opts.msSinceData ?? 10_000, // stale by default (no live activity)
  }
}
const state = (s: DetectSample) => classify(s, rs).state

describe('classify — baseline', () => {
  it('empty / plain input is unknown', () => {
    expect(state(sample([]))).toBe('unknown')
    expect(state(sample([''], { oscTitle: '' }))).toBe('unknown')
  })
})

describe('classify — working', () => {
  it('OSC-title spinner (braille and half-circle)', () => {
    expect(state(sample([], { oscTitle: '⠋ Claude' }))).toBe('working') // ⠋
    expect(state(sample([], { oscTitle: '◐ building' }))).toBe('working') // ◐
  })
  it('live turn: "esc to interrupt" and spinner + elapsed', () => {
    expect(state(sample(['⏵ Forging… (12s · esc to interrupt)']))).toBe('working')
    expect(state(sample(['* Distilling… (3m'])))
      .toBe('working')
  })
  it('background agents and MCP tasks', () => {
    expect(state(sample(['· Waiting for 3 background agents to finish']))).toBe('working')
    expect(state(sample(['· 2 MCP tasks still running']))).toBe('working')
  })
})

describe('classify — blocked (visible blocker wins)', () => {
  it('permission / confirm prompts', () => {
    expect(state(sample(['Do you want to proceed?', '❯ 1. Yes', '  2. No']))).toBe('blocked')
    expect(state(sample(['Do you want to allow this connection?']))).toBe('blocked')
    expect(state(sample(['Waiting for permission…']))).toBe('blocked')
  })
  it('a blocker beats a lingering OSC spinner (priority)', () => {
    const s = sample(['Do you want to proceed?', '❯ 1. Yes'], { oscTitle: '⠋ Claude' })
    expect(classify(s, rs).matchedRuleId).toBe('blocked_confirm')
    expect(classify(s, rs).state).toBe('blocked')
  })
  it('but "esc to interrupt" means working, not blocked (not-guard)', () => {
    // an interruptible turn with a stale prompt in the tail is still working
    const s = sample(['Compiling… (5s · esc to interrupt)', 'Do you want to proceed?'])
    expect(state(s)).toBe('working')
  })
})

describe('classify — idle vs unknown', () => {
  it('Claude prompt chrome is idle', () => {
    expect(state(sample(['╭────╮', '│ > type your message', '╰────╯', '? for shortcuts']))).toBe(
      'idle',
    )
  })
  it('a plain shell prompt is unknown, not idle', () => {
    expect(state(sample(['maverick@mac clu %']))).toBe('unknown')
  })
  it('another program (vim) is unknown', () => {
    expect(state(sample(['~', '~', '-- INSERT --']))).toBe('unknown')
  })
})

describe('classify — transcript viewer holds state', () => {
  it('sets skipStateUpdate', () => {
    const d = classify(sample(['Showing detailed transcript · ctrl+o to toggle']), rs)
    expect(d.skipStateUpdate).toBe(true)
  })
})

describe('classify — PTY-activity arbitration', () => {
  it('idle screen + live output reads as working (mid-stream)', () => {
    const idle = ['│ > ', '? for shortcuts']
    expect(state(sample(idle, { msSinceData: ACTIVE_WINDOW_MS - 1 }))).toBe('working')
    expect(state(sample(idle, { msSinceData: ACTIVE_WINDOW_MS + 1 }))).toBe('idle')
  })
  it('unknown + live output stays unknown (shell output is not "working")', () => {
    expect(state(sample(['maverick@mac clu %'], { msSinceData: 10 }))).toBe('unknown')
  })
})

describe('commit — hysteresis', () => {
  const det = (s: AgentDetection['state']): AgentDetection => ({
    state: s,
    matchedRuleId: null,
    skipStateUpdate: false,
  })

  it('escalations commit immediately', () => {
    expect(commit(initialCommitState, det('working')).committed).toBe('working')
    const working: CommitState = { committed: 'working', pending: null, pendingCount: 0 }
    expect(commit(working, det('blocked')).committed).toBe('blocked')
  })

  it('de-escalations require two consecutive samples', () => {
    const working: CommitState = { committed: 'working', pending: null, pendingCount: 0 }
    const once = commit(working, det('idle'))
    expect(once.committed).toBe('working') // held after one idle sample
    const twice = commit(once, det('idle'))
    expect(twice.committed).toBe('idle') // committed after the second
  })

  it('a single idle blip between working samples does not flip the dot', () => {
    const working: CommitState = { committed: 'working', pending: null, pendingCount: 0 }
    const blip = commit(working, det('idle')) // pending idle
    const back = commit(blip, det('working')) // back to working — pending cleared
    expect(back.committed).toBe('working')
    expect(back.pending).toBeNull()
  })

  it('transcript view holds the committed state', () => {
    const working: CommitState = { committed: 'working', pending: null, pendingCount: 0 }
    const held = commit(working, {
      state: 'unknown',
      matchedRuleId: 'transcript_viewer',
      skipStateUpdate: true,
    })
    expect(held.committed).toBe('working')
  })
})

describe('shouldNotifyBlocked', () => {
  it('fires only on a transition into blocked for a background Tab', () => {
    expect(shouldNotifyBlocked('working', 'blocked', false)).toBe(true)
    expect(shouldNotifyBlocked(undefined, 'blocked', false)).toBe(true)
  })
  it('does not fire for the active Tab', () => {
    expect(shouldNotifyBlocked('working', 'blocked', true)).toBe(false)
  })
  it('does not re-fire while already blocked, or for non-blocked states', () => {
    expect(shouldNotifyBlocked('blocked', 'blocked', false)).toBe(false)
    expect(shouldNotifyBlocked('working', 'idle', false)).toBe(false)
  })
})
