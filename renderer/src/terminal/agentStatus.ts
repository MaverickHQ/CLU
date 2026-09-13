// R2.1i — xterm sampler + tracker: turn a Tab's live terminal into agent-state
// updates. The buffer read is a pure function over a minimal xterm-buffer
// interface (node-testable with a fake buffer); the tracker folds successive
// samples through the shared classifier + hysteresis committer.

import { claudeRuleset } from '@shared/agentStatus/claudeRuleset'
import {
  classify,
  commit,
  initialCommitState,
  type CommitState,
} from '@shared/agentStatus/detect'
import type { AgentState, DetectSample, Ruleset } from '@shared/agentStatus/types'

/** Minimal slice of xterm.js's `Terminal` that the sampler needs. */
export interface TermBufferLike {
  buffer: {
    active: {
      length: number
      getLine(index: number): { translateToString(trim?: boolean): string } | undefined
    }
  }
}

/** Read the bottom `n` resolved lines (newest last), skipping trailing blanks. */
export function readBottomLines(term: TermBufferLike, n: number): string[] {
  const buf = term.buffer.active
  let end = buf.length - 1
  while (end >= 0 && (buf.getLine(end)?.translateToString(true) ?? '') === '') end--
  if (end < 0) return []
  const start = Math.max(0, end - n + 1)
  const out: string[] = []
  for (let i = start; i <= end; i++) out.push(buf.getLine(i)?.translateToString(true) ?? '')
  return out
}

/** How many bottom lines to sample (matches the ruleset's widest region). */
export const SAMPLE_LINES = 12

export function buildSample(
  term: TermBufferLike,
  oscTitle: string | null,
  msSinceData: number,
): DetectSample {
  return { bottomLines: readBottomLines(term, SAMPLE_LINES), oscTitle, msSinceData }
}

export interface AgentTracker {
  /** Classify + commit one sample; returns the committed state. */
  feed(sample: DetectSample): AgentState
  readonly committed: AgentState
}

/** Stateful tracker: holds the hysteresis committer across samples for one Tab. */
export function createAgentTracker(ruleset: Ruleset = claudeRuleset): AgentTracker {
  let state: CommitState = initialCommitState
  return {
    feed(sample) {
      state = commit(state, classify(sample, ruleset))
      return state.committed
    },
    get committed() {
      return state.committed
    },
  }
}
