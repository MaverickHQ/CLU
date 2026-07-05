# ADR-0003: Single-instance app via Electron's lock

**Status:** Accepted · **Date:** 2026-06-29

CLU uses `app.requestSingleInstanceLock()`. Launching `clu` while a CLU is already running focuses the existing window (and routes any `clu /path/to/project` CLI argument as an `openProject` call into it). Two parallel CLU processes would race on the global `projects.json` index for no UX win, and matches the convention of every comparable dev tool (VS Code, Cursor, Zed).

## Consequences

The per-project lock (`.clu/.lock`) handles the rarer "same project open in two CLUs" case (shared filesystem, second machine). It is redundant with single-instance for the same-machine case, but cheap insurance for the cross-machine one.
