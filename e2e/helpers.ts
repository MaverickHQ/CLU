// Shared e2e helpers. Real Electron + real node-pty + real filesystem: these
// cover what the fake-Host Vitest suite structurally can't (IPC, shell-init
// sourcing, shiki/markdown rendering, state.json round-trips). Run manually on
// an allowlisted machine — Electron launch is blocked in agent sessions.

import { _electron as electron, expect } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

// Minimal shape of the __cluStore test hook (installed only in VITE_CLU_E2E
// builds). Kept in sync with renderer/src/store/cockpit.ts by hand.
interface StoreState {
  openTab(projectPath: string): Promise<string>
  closeTab(id: string): Promise<void>
  selectTab(id: string): void
  pin(id: string, absPath: string): void
  unpin(id: string, absPath: string): void
  setViewerFile(id: string, absPath: string | null): void
  setDontAskQuit(v: boolean): void
  flushAllProjects(): Promise<void>
  activeTabId: string | null
  tabs: Array<{ id: string; name: string; projectPath: string }>
}
type CluWindow = { __cluStore: { getState(): StoreState } }

/** A throwaway userData profile so runs never touch the dev app.json (3.6f). */
export function tmpProfile(): string {
  return mkdtempSync(join(tmpdir(), 'clu-e2e-profile-'))
}

/** Launch the built app on an isolated (or given) profile; wait for the shell. */
export async function launch(
  profileDir: string = tmpProfile(),
): Promise<{ app: ElectronApplication; page: Page }> {
  const app = await electron.launch({
    args: [`--user-data-dir=${profileDir}`, 'out/main/index.cjs'],
  })
  const page = await app.firstWindow()
  await expect(page.getByRole('tablist')).toBeVisible()
  return { app, page }
}

/** Close deterministically: skip the "live sessions?" dialog so quit flushes
 *  state + confirms at once instead of waiting on the 3s force-quit timer. */
export async function closeApp(app: ElectronApplication, page: Page): Promise<void> {
  await page
    .evaluate(() => (window as unknown as CluWindow).__cluStore?.getState().setDontAskQuit(true))
    .catch(() => {})
  await app.close()
}

/** Create a temp project directory with the given relative files. */
export function makeProject(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'clu-e2e-proj-'))
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(dir, rel)
    mkdirSync(dirname(abs), { recursive: true })
    writeFileSync(abs, content)
  }
  return dir
}

/** Open a project through the store (native folder pickers can't be automated)
 *  and wait for its terminal pane. Returns the new Tab id. */
export async function openProject(page: Page, dir: string): Promise<string> {
  const id = await page.evaluate(
    (d) => (window as unknown as CluWindow).__cluStore.getState().openTab(d),
    dir,
  )
  await expect(page.getByTestId('pane-terminal')).toBeVisible()
  return id
}

/** Read the active Tab id from the store. */
export function activeTabId(page: Page): Promise<string | null> {
  return page.evaluate(() => (window as unknown as CluWindow).__cluStore.getState().activeTabId)
}

// Concrete store drivers for preconditions that aren't the UX under test (the
// keyboard/click paths for pin/unpin/open-in-viewer are exercised directly in
// the specs). page.evaluate can't capture the in-page store via a closure, so
// each helper is a self-contained in-page call.

/** Pin a file via the store (precondition helper). */
export function pinFile(page: Page, tabId: string, absPath: string): Promise<void> {
  return page.evaluate(
    ({ id, p }) => (window as unknown as CluWindow).__cluStore.getState().pin(id, p),
    { id: tabId, p: absPath },
  )
}

/** Force every open Project's state to disk now (deterministic persistence). */
export function flushState(page: Page): Promise<void> {
  return page.evaluate(() =>
    (window as unknown as CluWindow).__cluStore.getState().flushAllProjects(),
  )
}

/** Count of open Tabs, read from the store. */
export function tabCount(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as CluWindow).__cluStore.getState().tabs.length)
}

/** Type a command into a Tab's real shell and press Enter. */
export async function runInTerminal(page: Page, tabId: string, command: string): Promise<void> {
  await page.getByTestId(`xterm-${tabId}`).click()
  await page.keyboard.type(`${command}\n`)
}
