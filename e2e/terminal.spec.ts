// Terminal lifecycle end-to-end: a real shell exit flips to the shell-exited
// overlay, and "Restart shell" spawns a fresh PTY.

import { expect, test } from '@playwright/test'
import { closeApp, launch, makeProject, openProject, runInTerminal } from './helpers'

test('exiting the shell shows the overlay; Restart shell brings a fresh prompt', async () => {
  const project = makeProject({ 'README.md': '# x\n' })
  const { app, page } = await launch()
  const tabId = await openProject(page, project)

  // Prove the shell is live, then exit it.
  await runInTerminal(page, tabId, 'echo alive-before-exit')
  await expect(page.getByTestId(`xterm-${tabId}`)).toContainText('alive-before-exit', {
    timeout: 10_000,
  })
  await runInTerminal(page, tabId, 'exit')

  // PTY exit → overlay (error-state E).
  await expect(page.getByTestId('shell-exited')).toBeVisible({ timeout: 10_000 })

  // Restart respawns a PTY and dismisses the overlay.
  await page.getByRole('button', { name: 'Restart shell' }).click()
  await expect(page.getByTestId('shell-exited')).toHaveCount(0, { timeout: 10_000 })
  await runInTerminal(page, tabId, 'echo alive-after-restart')
  await expect(page.getByTestId(`xterm-${tabId}`)).toContainText('alive-after-restart', {
    timeout: 10_000,
  })
  await closeApp(app, page)
})
