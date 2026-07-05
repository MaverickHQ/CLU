// Multi-Tab end-to-end: per-Tab PTY isolation (ADR-0004), the close-confirm
// dialog for a live session, and the fall-back to the Welcome pane.

import { expect, test } from '@playwright/test'
import { closeApp, launch, makeProject, openProject } from './helpers'

test('two projects open two Tabs with isolated shells', async () => {
  const projA = makeProject({ 'a.md': '# A\n' })
  const projB = makeProject({ 'b.md': '# B\n' })
  const { app, page } = await launch()

  const idA = await openProject(page, projA)
  await page.getByTestId(`xterm-${idA}`).click()
  await page.keyboard.type('echo marker-in-A\n')
  await expect(page.getByTestId(`xterm-${idA}`)).toContainText('marker-in-A', { timeout: 10_000 })

  const idB = await openProject(page, projB) // B becomes active, A hidden but mounted
  await page.getByTestId(`xterm-${idB}`).click()
  await page.keyboard.type('echo marker-in-B\n')
  await expect(page.getByTestId(`xterm-${idB}`)).toContainText('marker-in-B', { timeout: 10_000 })

  await expect(page.getByRole('tab')).toHaveCount(2)
  // Each shell only ever saw its own command — no cross-talk between PTYs.
  await expect(page.getByTestId(`xterm-${idA}`)).toContainText('marker-in-A')
  await expect(page.getByTestId(`xterm-${idA}`)).not.toContainText('marker-in-B')
  await expect(page.getByTestId(`xterm-${idB}`)).not.toContainText('marker-in-A')
  await closeApp(app, page)
})

test('closing a live Tab confirms; closing the last returns to Welcome', async () => {
  const projA = makeProject({ 'a.md': '# A\n' })
  const projB = makeProject({ 'b.md': '# B\n' })
  const { app, page } = await launch()
  await openProject(page, projA)
  await openProject(page, projB)
  await expect(page.getByRole('tab')).toHaveCount(2)

  // Close one Tab: a live session pops the confirm dialog; confirm it.
  await page
    .getByRole('button', { name: /^Close / })
    .first()
    .click()
  await expect(page.getByTestId('confirm-close')).toBeVisible()
  await page.getByRole('button', { name: 'Close tab' }).click()
  await expect(page.getByRole('tab')).toHaveCount(1)

  // Close the last Tab → Welcome pane.
  await page.getByRole('button', { name: /^Close / }).click()
  await expect(page.getByTestId('confirm-close')).toBeVisible()
  await page.getByRole('button', { name: 'Close tab' }).click()
  await expect(page.getByTestId('welcome-pane')).toBeVisible()
  await closeApp(app, page)
})
