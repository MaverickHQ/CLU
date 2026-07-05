# ADR-0002: Renderer-canonical state with Zustand

**Status:** Accepted · **Date:** 2026-06-29

The canonical UI store lives in the renderer process as a Zustand store. The main process is a stateless service layer (PTY, file watcher, GitHub client, file I/O) exposed via a typed Host adapter over IPC. State changes in the renderer trigger debounced atomic writes (200 ms) through `host.state.save()`. This keeps the common case (UI reads) IPC-free, makes main process restarts cheap, and lets us mock the Host in renderer tests without spinning up Electron.

## Considered alternatives

- **Main-canonical store** — IPC round trip per UI read; React reactivity across IPC is awkward; testing requires Electron.
- **Redux Toolkit instead of Zustand** — Overkill for a solo v1 with ~20 actions; migration later is mechanical if scale demands it.
- **Synced state in both processes** — Reconciliation races for no UX win.
- **electron-trpc / comlink for IPC** — Real wins at scale; for v1's ~20 channels, hand-rolled typed IPC with shared TypeScript types is leaner.

## Consequences

A renderer crash loses ≤200 ms of unsaved changes (the debounce window). Mitigation: force-save on user-visible boundaries — tab close, tab switch, app quit — in addition to the debounce timer. State files are versioned (`schemaVersion: number`) with explicit migration functions at load time, so schema evolution doesn't break v1 users.
