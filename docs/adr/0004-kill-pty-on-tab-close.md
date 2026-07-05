# ADR-0004: Tab close kills the PTY — no detach/reattach

**Status:** Accepted · **Date:** 2026-06-29

Closing a Tab sends SIGHUP, waits up to 1 s for graceful exit, then SIGKILLs the PTY. There is no tmux-style detach/reattach. Building one would require either tmux-as-a-dependency (heavy) or CLU's own session multiplexer (a v0 Go-prototype mistake already paid for). Users who genuinely want a persistent Claude session can `tmux new-session` *inside* CLU's PTY — that works fine and stays the user's choice.

## Consequences

Accidentally closing an active Claude session destroys the in-memory conversation. Mitigated by a one-line confirm prompt on close-with-active-session (with a "don't ask again" checkbox stored in `app.json`). Session log files preserve the *output transcript* on disk so the conversation history survives — just not the runtime PTY context.
