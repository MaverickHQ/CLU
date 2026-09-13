// Claude Code state-detection ruleset (R2.1, ADR-0011).
//
// Patterns adapted from herdr's `src/detect/manifests/claude.toml`
// (https://github.com/herdrdev/herdr, Apache-2.0) — see README credits.
// CLU embeds one agent (Claude), so a single versioned ruleset suffices.
//
// Priority ladder (highest wins): a *visible blocker* (permission / confirm
// prompt) beats everything, because it is the strongest signal that a human is
// needed; then the OSC-title spinner; then the transcript-view skip; then the
// bottom-of-screen working chrome; idle sits lowest so it only wins when
// nothing else matches (which also keeps a plain shell prompt from reading as
// Claude-idle — that stays `unknown`).

import type { Ruleset } from './types'

export const claudeRuleset: Ruleset = {
  id: 'claude',
  version: '2026.09.13.1',
  rules: [
    // ---- blocked: a human answer is required (visible blocker wins) ----
    {
      id: 'blocked_confirm',
      state: 'blocked',
      priority: 1200,
      region: { kind: 'bottomLines', n: 12 },
      match: {
        anyOf: [
          { contains: ['do you want to proceed?'] },
          { contains: ['do you want to allow this connection?'] },
          { contains: ['waiting for permission'] },
          { contains: ['do you trust the files in this folder?'] },
        ],
      },
      // If Claude is interruptible it is working, not blocked — even if an old
      // prompt lingers in the tail.
      not: [{ contains: ['esc to interrupt'] }],
    },

    // ---- working: OSC-title spinner (braille <=2.1.227; half-circles 2.1.228+) ----
    {
      id: 'osc_title_spinner',
      state: 'working',
      priority: 1100,
      region: { kind: 'oscTitle' },
      match: { regex: '^[\\u{2800}-\\u{28FF}\\u{25D0}-\\u{25D3}] ' },
    },

    // ---- transcript viewer: hold the last committed state ----
    {
      id: 'transcript_viewer',
      state: 'unknown',
      priority: 1000,
      region: { kind: 'bottomLines', n: 3 },
      match: { contains: ['showing detailed transcript'] },
      skipStateUpdate: true,
    },

    // ---- working: live turn chrome in the bottom lines ----
    {
      id: 'live_turn_working',
      state: 'working',
      priority: 970,
      region: { kind: 'bottomLines', n: 12 },
      match: {
        anyOf: [
          { lineRegex: 'esc to interrupt' },
          // spinner glyph + activity word + elapsed "(12s"/"(3m" tail
          { lineRegex: '…\\s*\\(\\d+[smh]' },
        ],
      },
    },
    {
      id: 'background_work',
      state: 'working',
      priority: 965,
      region: { kind: 'bottomLines', n: 12 },
      match: {
        anyOf: [
          { lineRegex: 'Waiting for [1-9]\\d* background agents? to finish' },
          { contains: ['MCP tasks still running'] },
        ],
      },
    },

    // ---- idle: Claude prompt visible, nothing happening ----
    {
      id: 'idle_prompt',
      state: 'idle',
      priority: 100,
      region: { kind: 'bottomLines', n: 6 },
      match: {
        anyOf: [
          { contains: ['? for shortcuts'] },
          // the input box prompt line: "│ > " (box-drawing border + caret)
          { lineRegex: '^\\s*[│|]\\s*>\\s' },
        ],
      },
      // don't call it idle mid-turn
      not: [{ contains: ['esc to interrupt'] }],
    },
  ],
}
