# Contributing to CLU

CLU is an Electron desktop app: **Electron + React + TypeScript + xterm.js + node-pty**, built with electron-vite and pnpm.

## Dev setup

**Prerequisites**: Node ≥ 20, [pnpm](https://pnpm.io), Git.

```bash
git clone https://github.com/maverickhq/clu
cd clu
pnpm install
pnpm dev        # launch the app with hot-reload
```

## Scripts

```bash
pnpm test       # Vitest — unit + integration (no Electron; fast)
pnpm typecheck  # tsc --noEmit
pnpm build      # compile main / preload / renderer
pnpm e2e        # Playwright smoke suite (launches Electron; run locally)
```

`pnpm test`, `pnpm typecheck`, and `pnpm build` are the CI gates and never launch Electron. `pnpm e2e` does launch the real app — run it locally before a PR that touches the main process, IPC, or a user-facing flow.

## Architecture at a glance

Four layers under a strict seam (the renderer never imports Electron directly):

```
main/       Electron main process — IPC handlers, node-pty, file I/O, windows
preload/    the typed contextBridge exposing the Host to the renderer
renderer/   React UI + Zustand store; talks only to the Host adapter
shared/     types, IPC channel defs, pure logic, the Host interface + fake
```

The **Host adapter** (`shared/host.ts`) is the primary testable seam: a fake in-memory Host backs fast unit tests; the Electron implementation is exercised by real node-pty integration tests and the Playwright smoke suite. Architecture decisions live in [docs/adr/](docs/adr/).

## Code conventions

- **TDD** — write a failing test first (RED), then the minimum code to pass it (GREEN), then refactor. Build in vertical slices; don't pre-write a suite of tests for imagined behaviour.
- **Test public interfaces, not implementation** — exercise the Host adapter, store actions/selectors, and pure domain functions. Never assert on internals.
- **Comment the *why*, not the *what*** — only hidden constraints, non-obvious invariants, and workarounds.
- **No speculative abstractions** — three similar lines beat a premature helper. Generalise when the third case actually arrives.
- **TypeScript strict**; no `any` escape hatches without a reason. Keep the renderer free of Electron/Node imports — go through the Host.

## PR checklist

- [ ] `pnpm test` passes (new code has a corresponding test, RED → GREEN)
- [ ] `pnpm typecheck` clean
- [ ] `pnpm build` succeeds
- [ ] `pnpm e2e` run locally if the change affects the main process / IPC / a user flow
- [ ] README / docs updated if behaviour or keybindings changed
- [ ] Commit message explains *why*, not just *what*

## A note on distribution

CLU ships **unsigned** (no Apple Developer Program, no notarization) via GitHub Releases. This is deliberate. Please don't add signing/notarization infrastructure without discussion.
