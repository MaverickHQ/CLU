// Persistence end-to-end: a real state.json round-trip across two launches of
// the SAME userData profile — the last project and its PinSet must restore.
// Only e2e exercises the real atomic writer + hydrate path together.

import { expect, test } from '@playwright/test'
import { closeApp, flushState, launch, makeProject, openProject, pinFile, tmpProfile } from './helpers'

test('last project + PinSet restore on relaunch (same profile)', async () => {
  const profile = tmpProfile() // reused across both launches on purpose
  const project = makeProject({ 'keep.ts': 'export const k = 1\n', 'other.md': '# o\n' })

  // Launch 1: open a project, pin a file, force state to disk, quit.
  {
    const { app, page } = await launch(profile)
    const tabId = await openProject(page, project)
    await pinFile(page, tabId, `${project}/keep.ts`)
    await flushState(page) // deterministic project-state write
    await page.waitForTimeout(500) // let the debounced app-state (lastProject) save land
    await closeApp(app, page)
  }

  // Launch 2: same profile → hydrate restores the tab and its pin.
  {
    const { app, page } = await launch(profile)
    await expect(page.getByRole('tab')).toHaveCount(1)
    await expect(page.getByRole('tab')).toContainText(project.split('/').pop() as string)
    await expect(page.getByTestId('pinned-keep.ts')).toBeVisible()
    await closeApp(app, page)
  }
})
