// Agent status detection — pure classifier + committer (R2.1, ADR-0011).
// See docs/design/agent-status-detection.md (local) for the full mechanism.

import type { AgentDetection, AgentState, DetectSample, Matcher, Region, Rule, Ruleset } from './types'

/** Output produced within this window counts as live PTY activity (working authority). */
export const ACTIVE_WINDOW_MS = 800

/** Consecutive samples a de-escalation (→idle/unknown) must persist before it commits. */
export const DEESCALATE_SAMPLES = 2

function regionLines(sample: DetectSample, region: Region): string[] {
  switch (region.kind) {
    case 'oscTitle':
      return sample.oscTitle ? [sample.oscTitle] : []
    case 'lastLine': {
      const last = sample.bottomLines[sample.bottomLines.length - 1]
      return last === undefined ? [] : [last]
    }
    case 'bottomLines':
      return sample.bottomLines.slice(-region.n)
  }
}

/** True when the matcher passes over `lines`. An empty matcher never matches. */
function matches(lines: string[], m: Matcher): boolean {
  const text = lines.join('\n')
  let any = false
  if (m.contains) {
    any = true
    const hay = text.toLowerCase()
    if (!m.contains.every((s) => hay.includes(s.toLowerCase()))) return false
  }
  if (m.regex) {
    any = true
    if (!new RegExp(m.regex, 'u').test(text)) return false
  }
  if (m.lineRegex) {
    any = true
    const re = new RegExp(m.lineRegex, 'u')
    if (!lines.some((l) => re.test(l))) return false
  }
  if (m.anyOf) {
    any = true
    if (!m.anyOf.some((sub) => matches(lines, sub))) return false
  }
  return any
}

function ruleFires(sample: DetectSample, rule: Rule): boolean {
  const lines = regionLines(sample, rule.region)
  if (lines.length === 0) return false
  if (!matches(lines, rule.match)) return false
  if (rule.not?.some((n) => matches(lines, n))) return false
  return true
}

/** Screen-only classification: the highest-priority matching rule wins. */
function classifyScreen(sample: DetectSample, ruleset: Ruleset): AgentDetection {
  const ordered = [...ruleset.rules].sort((a, b) => b.priority - a.priority)
  for (const rule of ordered) {
    if (ruleFires(sample, rule)) {
      return {
        state: rule.state,
        matchedRuleId: rule.id,
        skipStateUpdate: rule.skipStateUpdate ?? false,
      }
    }
  }
  return { state: 'unknown', matchedRuleId: null, skipStateUpdate: false }
}

/**
 * Classify a terminal sample into an instantaneous agent state.
 *
 * Screen rules match first; then PTY activity arbitrates:
 * - a transcript view holds the committed state (skipStateUpdate),
 * - a visible blocked or working screen wins as-is (a visible blocker is the
 *   strongest signal — it may override lingering working chrome, via rule
 *   priority in the ruleset),
 * - an *idle* screen with live output is really mid-stream working,
 * - *unknown* stays unknown — plain shell output must not read as "working".
 */
export function classify(sample: DetectSample, ruleset: Ruleset): AgentDetection {
  const screen = classifyScreen(sample, ruleset)
  if (screen.skipStateUpdate) return screen
  if (screen.state === 'blocked' || screen.state === 'working') return screen
  if (screen.state === 'idle' && sample.msSinceData < ACTIVE_WINDOW_MS) {
    return { state: 'working', matchedRuleId: screen.matchedRuleId, skipStateUpdate: false }
  }
  return screen
}

/** Committer state — carried across samples so hysteresis has memory. */
export interface CommitState {
  committed: AgentState
  pending: AgentState | null
  pendingCount: number
}

export const initialCommitState: CommitState = {
  committed: 'unknown',
  pending: null,
  pendingCount: 0,
}

/**
 * Fold a detection into the committed state with hysteresis:
 * - a transcript view (skipStateUpdate) holds the committed state,
 * - escalations (→working/blocked) commit immediately (fast "needs you" alerting),
 * - de-escalations (→idle/unknown) must persist DEESCALATE_SAMPLES consecutive
 *   samples, so spinner-frame gaps don't flicker the dot.
 */
export function commit(state: CommitState, detection: AgentDetection): CommitState {
  if (detection.skipStateUpdate) return { ...state, pending: null, pendingCount: 0 }
  const next = detection.state
  if (next === state.committed) return { ...state, pending: null, pendingCount: 0 }
  if (next === 'working' || next === 'blocked') {
    return { committed: next, pending: null, pendingCount: 0 }
  }
  const count = state.pending === next ? state.pendingCount + 1 : 1
  if (count >= DEESCALATE_SAMPLES) return { committed: next, pending: null, pendingCount: 0 }
  return { committed: state.committed, pending: next, pendingCount: count }
}

/**
 * Whether a state change should raise a "needs you" OS notification: only on a
 * *transition into* blocked, and only for a **background** (inactive) Tab — the
 * active Tab's terminal is already on screen, and repeat-blocked samples must
 * not re-notify.
 */
export function shouldNotifyBlocked(
  prev: AgentState | undefined,
  next: AgentState,
  isActive: boolean,
): boolean {
  return next === 'blocked' && prev !== 'blocked' && !isActive
}
