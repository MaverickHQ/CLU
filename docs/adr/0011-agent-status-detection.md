# ADR-0011: Agent status detection via terminal-tail pattern matching

**Status:** Accepted · **Date:** 2026-09-13 · **Shipped:** v1.1.0 (Release 2)

CLU detects whether the Claude session in each Tab is **working**, **blocked** (needs a human answer), **idle**, or **unknown**, and surfaces it as a per-Tab status dot plus a background-Tab "needs you" OS notification. State is derived by **sampling the Tab's rendered terminal buffer** (the xterm.js grid — bottom non-empty lines + the OSC window title) and matching it against a **priority-ordered, declarative Claude ruleset**, arbitrated against recent PTY activity. The classifier is a **pure function** in `shared/`, so it is fully Vitest-testable against captured terminal fixtures with no Electron.

The problem this solves: CLU is a multi-Tab cockpit, but today nothing tells you *which* Tab's Claude has stopped and is waiting on you. With three projects open you have to click into each to find the one blocked on a permission prompt. Detection turns the Tab strip from cosmetic into a genuine "never hunt for the stuck one" surface.

The approach is adapted from **[herdr](https://github.com/herdrdev/herdr)** (Apache-2.0), which proves terminal-tail pattern matching classifies agent state reliably across ~20 agents at scale. We take the *concept* — and, where we adapt herdr's Claude regex patterns, we credit it in the ruleset header and README (same posture as graphify/ponytail). We do **not** vendor herdr's engine; CLU embeds one agent (Claude), so a single versioned Claude ruleset suffices.

## Why read the rendered xterm buffer, not the raw stream

Claude's TUI redraws in place — spinners overwrite a line, prompt boxes repaint, transcripts scroll. Matching the **raw PTY byte stream** would drown in cursor-movement and repaint escapes. xterm.js already parses those into a stable character grid, so reading `terminal.buffer.active` bottom rows (plus `onTitleChange` for the OSC title) gives the *resolved* on-screen text — the same thing a human reads. Detection therefore lives **renderer-side** (where xterm runs), feeding a pure classifier; the store holds `agentState` per Tab; the Tab strip renders the dot; a notification effect fires on background→blocked transitions.

## Alternatives rejected

- **Parse Claude's session JSONL / `~/.claude` state files** — brittle, undocumented internal format, path- and version-dependent; also can't see live "blocked on a prompt" UI state.
- **Raw PTY byte-stream regex** — misses/duplicates state because it sees repaint escapes, not resolved screen text; spinners and in-place prompt boxes defeat it.
- **A Claude "status hook" / MCP status API** — no stable public surface for "the TUI is currently blocked on input"; would couple us to an internal contract.
- **OSC-133 prompt markers only** — tells us "a prompt is showing," not working-vs-blocked; insufficient alone (kept as a corroborating signal where present).
- **Do nothing (status quo)** — leaves the multi-Tab value on the table; the whole point of Tabs is weakened.

## Consequences

- **The ruleset is coupled to Claude's TUI output** and will need updates when Claude changes its interface. Mitigation: the ruleset is a single versioned data structure (`version` + `updated_at`, like herdr's manifests), isolated from the engine, and covered by fixtures captured from real Claude output — a UI change fails a fixture test, not production silently.
- **Pure-function core keeps it fully testable** on the Host-adapter discipline: `classify(sample) → AgentDetection` is Vitest-covered; only the thin xterm-sampling adapter and the Electron `Notification` are manual-UAT.
- **Renderer-side, not main-side** — detection needs the parsed grid xterm owns. The main process is untouched except for a `notify` Host method.
- **Claude-specific by design.** The ruleset *structure* generalizes to other agents, but CLU stays the Claude cockpit; adding agents is explicitly out of scope (that is herdr's lane).
- **Hysteresis is required.** Raw sampling flickers working↔idle between spinner frames; the classifier debounces (a state must persist across samples, and PTY activity is the working authority) so the dot is calm.
- **Attribution obligation.** Adapted herdr patterns are Apache-2.0 → credited in `shared/agentStatus/` and README. Concept-only reuse carries no obligation, but we err toward crediting.
