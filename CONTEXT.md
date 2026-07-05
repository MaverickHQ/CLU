# CLU

A focused cross-platform desktop app that surrounds a Claude Code CLI session with file tree, viewer, terminal, GitHub view, and session tabs.

## Language

**Tab**:
A per-project workspace, fully self-contained. Owns one terminal PTY, one file tree, one PinSet, one viewer state, one session log, and one GitHub view. Persisted between app restarts.
_Avoid_: window, pane, workspace.

**Project**:
A directory CLU is operating on. A Tab is bound to exactly one Project; one Project can be open in at most one Tab at a time within a given CLU instance.
_Avoid_: workspace, folder, repo (a Project does not require a git remote).

**PinSet**:
The ordered, Tab-local collection of files exported as `$CLU_FILES` to that Tab's terminal. PinSets are scoped to a Tab, never global.
_Avoid_: pinned files (use the singular noun), selection, tags, favorites.

**Session log**:
The per-Tab append-only Markdown record of Claude conversations in that Tab. Stored at `<project-root>/.clu/sessions/<tab-uuid>-<timestamp>.md`. New file per Tab session; never edited in place after creation.
_Avoid_: history, transcript, conversation log.

**Host adapter**:
The Layer-1 TypeScript interface (`Host`) that abstracts all host-specific capabilities — PTY, file watching, file I/O, GitHub access, state persistence — behind a single typed API. The renderer always calls `host.xxx()` instead of touching Electron APIs directly. Swapping Electron for Tauri or Wails is implemented by writing a new Host adapter; nothing else changes.
_Avoid_: bridge, IPC layer (those are general concepts; "Host adapter" is CLU's specific abstraction).

**Tab session**:
A single open-close lifecycle of a Tab. Closing and re-opening a Tab produces a fresh Tab session (new Session log file, new PTY). PinSet and viewer state persist *across* Tab sessions because they live in `state.json`, but PTY conversation state does not.
_Avoid_: session (too generic — could mean a Claude session, a terminal session, a Tab session; use "Tab session" when that's what's meant).

