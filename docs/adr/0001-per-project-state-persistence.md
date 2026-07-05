# ADR-0001: Tab state lives per-project, with a small global index

**Status:** Accepted · **Date:** 2026-06-29

Tab state (PinSet, viewer state, tree expansion, custom Tab name) lives at `<project-root>/.clu/state.json` so that state travels with the project — clone a repo, the PinSet comes with it. Session logs are separate append-only files at `<project-root>/.clu/sessions/<tab-uuid>-<timestamp>.md` to avoid rewriting JSON on every Claude turn. A small global index at `~/Library/Application Support/CLU/projects.json` (and platform equivalents) tracks which projects to reopen on launch.

## Considered alternatives

- **Global only** — orphans accumulate when projects move or are deleted; no path for team sharing of PinSets.
- **Mirror (canonical in both places)** — reconciliation race conditions for no UX win.
- **Hash-keyed XDG (`~/.config/clu/<sha>.json`)** — project moves or renames orphan the state.

## Consequences

Two CLU instances opening the *same* project can race on `state.json`. Mitigation is an advisory `.clu/.lock` PID file; not in v1 — revisit if real users hit it.
