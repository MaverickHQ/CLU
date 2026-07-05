# ADR-0007: `$CLU_FILES` updates via temp shell-init scripts, not direct PTY injection

**Status:** Accepted · **Date:** 2026-06-29

CLU writes `<project-root>/.clu/env.sh` atomically on every PinSet change, and the spawned PTY's shell sources that file on each prompt via integration baked into a temp rc script — `--rcfile` for bash, `ZDOTDIR` for zsh, `conf.d/` for fish. The user's permanent shell config is never modified. PinSet changes take effect on the *next* shell prompt; they cannot retroactively change a command line the user is currently typing. Shells we don't have integration for (sh, dash, ksh, nu, pwsh) fall back to best-effort "type `export` into PTY at quiet moments" with bracketed-paste safety.

The v0 Go prototype shipped the naive "type `export` into PTY whenever PinSet changes" approach and got away with it because nobody pushed it. For v1 with real users it corrupts input the first time someone is mid-typing when a pin changes — and the `\r` we emit submits the corrupted line.

## Alternatives rejected

- **Always type `export …` into the PTY** — corruption + visible scrollback noise.
- **Modify user's permanent `~/.bashrc` / `~/.zshrc`** — hostile; messy uninstall; surprise for the user.
- **Require a manual one-line snippet** — onboarding friction; people bounce.
- **OSC-133 prompt detection as primary mechanism** — still needs an injection path; doesn't solve the problem alone.

## Consequences

`$CLU_ENV_FILE` becomes a stable contract — additional cockpit env vars (`$CLU_ISSUE`, `$CLU_BRANCH`, …) all flow through the same file. The user's first surprise might be "I pinned a file but my current command line doesn't see it" — documented as intended behavior, matching the "pinning affects next command" mental model. Users with `set -e` in their rc still load it — our hook line is guarded with `[ -f "$CLU_ENV_FILE" ] && source "$CLU_ENV_FILE"` so it no-ops if the file is missing.
