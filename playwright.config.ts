import { defineConfig } from '@playwright/test'

// e2e covers what the fake-Host Vitest suite structurally can't: real IPC, the
// node-pty shell + shell-init sourcing, markdown/shiki rendering, git-status
// decorations, and state.json round-trips. Per-test hard timeout fails fast if
// the Electron launch is blocked; the global
// timeout has headroom for the serial per-launch suite.
// ⚠️ NEVER run `pnpm e2e` from an agent session on this machine.
export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  globalTimeout: 300_000,
  workers: 1, // Electron launches are serial
  use: { trace: 'retain-on-failure' },
})
