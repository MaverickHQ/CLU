// Agent status detection — types (Release 2 / R2.1, ADR-0011).
//
// Concept adapted from herdr (https://github.com/herdrdev/herdr, Apache-2.0):
// classify a coding agent's terminal state by pattern-matching the *rendered*
// bottom-of-screen text plus the OSC title, arbitrated against PTY activity.
// The classifier is a pure function so it is fully Vitest-testable against
// captured terminal fixtures with no Electron (CLU sandbox constraint).

export type AgentState = 'working' | 'blocked' | 'idle' | 'unknown'

/** A snapshot of a Tab's terminal, fed to the classifier. */
export interface DetectSample {
  /** Resolved bottom-of-screen lines, oldest first / newest last, trailing blanks trimmed. */
  bottomLines: string[]
  /** Current OSC window title, or null. */
  oscTitle: string | null
  /** Milliseconds since the PTY last produced output (live-activity signal). */
  msSinceData: number
}

export interface AgentDetection {
  state: AgentState
  /** Id of the ruleset rule that matched, or null (no rule / activity-only). */
  matchedRuleId: string | null
  /** True when the screen is a transcript/scrollback view — hold the last committed state. */
  skipStateUpdate: boolean
}

/** Which slice of the sample a rule inspects. */
export type Region =
  | { kind: 'oscTitle' }
  | { kind: 'bottomLines'; n: number }
  | { kind: 'lastLine' }

/**
 * A matcher over a region's text/lines. Every present field must pass (AND);
 * `anyOf` passes when any child passes (OR). An empty matcher matches nothing.
 */
export interface Matcher {
  /** Regex (unicode) tested against the region's newline-joined text. */
  regex?: string
  /** Regex (unicode) tested per line; passes if any line matches. */
  lineRegex?: string
  /** Case-insensitive substrings; all must appear in the region text. */
  contains?: string[]
  /** Passes when any sub-matcher passes. */
  anyOf?: Matcher[]
}

export interface Rule {
  id: string
  state: AgentState
  /** Higher wins; rules are evaluated highest-priority first. */
  priority: number
  region: Region
  match: Matcher
  /** Veto: if any of these match the region, the rule does not fire. */
  not?: Matcher[]
  /** Mark the screen as a transcript view — the committer holds the last state. */
  skipStateUpdate?: boolean
}

export interface Ruleset {
  id: string
  /** Bump when patterns change; a fixture test failure signals a Claude UI drift. */
  version: string
  rules: Rule[]
}
