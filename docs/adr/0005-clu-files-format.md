# ADR-0005: $CLU_FILES format — bash array of POSIX single-quoted absolute paths

**Status:** Accepted · **Date:** 2026-06-29

`$CLU_FILES` is exported as a bash array of POSIX-single-quoted absolute paths, re-emitted into the active PTY on every PinSet change. `$CLU_FILE` (singular, most-recently-opened file in the viewer) is maintained alongside it. Bash-array form lets users iterate cleanly: `for f in "${CLU_FILES[@]}"; do claude "review $f"; done`. Absolute paths because the user's shell may `cd` freely; relative paths break the moment they do. The single-quoting routine is the one already proven in the v0 Go prototype.

## Alternatives rejected

- **NUL-separated single env var** — awkward for shell-array iteration, surprising to users.
- **Relative paths** — break on the first `cd`.
- **Double-quoting** — needs escaping for `$`, `` ` ``, and `\` separately; single-quoting only escapes `'` via `'\''`.

## Consequences

Non-array shells need translation in the Host adapter: fish gets `set -gx CLU_FILES 'p1' 'p2'`; unknown shells fall back to a space-joined single var with a one-time warning. The format becomes a stable API for user-authored prompt templates — changing it later breaks user configs.
