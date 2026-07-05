# ADR-0008: Single repo for CLU; v0 Go prototype preserved as `legacy-go-prototype/`

**Status:** Accepted · **Date:** 2026-06-29

The Electron rewrite ships into `MaverickHQ/CLU` — the same repo as the v0 Go + Bubbletea TUI prototype. At the start of Phase 2, Go sources move into a `legacy-go-prototype/` subdirectory and the pre-move HEAD is tagged `v0-go-final` for recoverability. The repo's identity is the *product*, not the language — stars, issues, Homebrew tap target, and inbound documentation links all remain valid.

## Alternatives rejected

- **Fresh repo** — loses stars, issue continuity, brand investment; breaks every inbound link to `MaverickHQ/CLU`.
- **Long-running `feat/electron` branch** — weeks on a branch splits CI and ends in a brutal mega-PR.
- **Delete the Go code** — loses the thesis-validation lessons that have grep-value forever (`$CLU_FILE` works, line-buffer shell pane doesn't).

## Consequences

The repo briefly contains *two products* during Phase 2 scaffolding. The `legacy-go-prototype/README.md` clearly marks the Go subtree as reference-only and not built. The Makefile at repo root is owned by the Electron project after Phase 2 — running `make` defaults to the new build, not the Go one.
