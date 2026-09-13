// R2.1i — sampler + tracker tests (node project; fake xterm buffer).
import { describe, expect, it } from 'vitest'
import { buildSample, createAgentTracker, readBottomLines, type TermBufferLike } from './agentStatus'
import type { DetectSample } from '@shared/agentStatus/types'

function fakeTerm(lines: string[]): TermBufferLike {
  return {
    buffer: {
      active: {
        length: lines.length,
        getLine: (i) => ({ translateToString: () => lines[i] ?? '' }),
      },
    },
  }
}

describe('readBottomLines', () => {
  it('returns the bottom n lines, newest last', () => {
    const term = fakeTerm(['a', 'b', 'c', 'd', 'e'])
    expect(readBottomLines(term, 3)).toEqual(['c', 'd', 'e'])
  })
  it('skips trailing blank lines (xterm pads the grid)', () => {
    const term = fakeTerm(['prompt', '> working', '', '', ''])
    expect(readBottomLines(term, 12)).toEqual(['prompt', '> working'])
  })
  it('handles an all-blank buffer', () => {
    expect(readBottomLines(fakeTerm(['', '']), 5)).toEqual([])
  })
})

describe('createAgentTracker', () => {
  const s = (bottomLines: string[], msSinceData = 10_000): DetectSample => ({
    bottomLines,
    oscTitle: null,
    msSinceData,
  })

  it('commits working, then de-escalates to idle only after two samples', () => {
    const t = createAgentTracker()
    expect(t.feed(s(['Forging… (2s · esc to interrupt)']))).toBe('working')
    expect(t.feed(s(['│ > ', '? for shortcuts']))).toBe('working') // hysteresis holds
    expect(t.feed(s(['│ > ', '? for shortcuts']))).toBe('idle') // second idle sample commits
  })

  it('escalates to blocked immediately', () => {
    const t = createAgentTracker()
    t.feed(s(['Forging… (2s · esc to interrupt)']))
    expect(t.feed(s(['Do you want to proceed?', '❯ 1. Yes']))).toBe('blocked')
  })
})

describe('buildSample', () => {
  it('assembles bottomLines + title + activity', () => {
    const sample = buildSample(fakeTerm(['line1', 'line2']), '⠋ Claude', 42)
    expect(sample).toEqual({ bottomLines: ['line1', 'line2'], oscTitle: '⠋ Claude', msSinceData: 42 })
  })
})
