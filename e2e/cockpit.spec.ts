// CLU e2e smoke (task 3.10) — run manually on an allowlisted machine:
//   pnpm e2e
// The two original smoke tests: app launch, and the end-to-end demo flow.
// Feature-area breadth lives in the sibling *.spec.ts files.

import { expect, test } from '@playwright/test'
import { activeTabId, closeApp, launch, makeProject, openProject, pinFile } from './helpers'

test('app launches and the cockpit shell renders', async () => {
  const { app, page } = await launch()
  await expect(page.getByTestId('welcome-pane')).toBeVisible() // fresh profile
  await closeApp(app, page)
})

test('open project → live shell → pin → $CLU_FILES round-trip (the demo flow)', async () => {
  const project = makeProject({ 'README.md': '# e2e fixture\n' })
  const { app, page } = await launch()
  const tabId = await openProject(page, project)

  // Live shell: type into xterm, expect the echo back (DOM renderer).
  await page.getByTestId(`xterm-${tabId}`).click()
  await page.keyboard.type('echo clu-e2e-marker-99\n')
  await expect(page.locator('.xterm')).toContainText('clu-e2e-marker-99', { timeout: 10_000 })

  // Pin, then read $CLU_FILES back through the real shell-init pipeline
  // (ADR-0007): env.sh → prompt hook → array var.
  await pinFile(page, tabId, `${project}/README.md`)
  await page.keyboard.type('\n') // cycle a prompt so the hook sources env.sh
  await page.keyboard.type('echo "PINNED=${CLU_FILES[@]}"\n')
  await expect(page.locator('.xterm')).toContainText(`PINNED=${project}/README.md`, {
    timeout: 10_000,
  })

  expect(await activeTabId(page)).toBe(tabId)
  await closeApp(app, page)
})
