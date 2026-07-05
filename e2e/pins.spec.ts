// PinSet end-to-end: the keyboard pin UX, the unpin button, the real
// $CLU_FILE/$CLU_FILES shell-init pipeline (ADR-0007), and stale-pin marking
// when a pinned file is deleted from under the app.

import { expect, test } from '@playwright/test'
import { closeApp, launch, makeProject, openProject, pinFile, runInTerminal } from './helpers'

test('select a file + Space pins it; $CLU_FILE reaches the shell', async () => {
  const project = makeProject({ 'notes.md': '# notes\n' })
  const { app, page } = await launch()
  const tabId = await openProject(page, project)

  // Real pin UX: click the row (sets selection), focus the tree, press Space.
  await page.getByTestId('tree-row-notes.md').click()
  await page.getByTestId('tree-pane').focus()
  await page.keyboard.press(' ')

  await expect(page.getByTestId('pinned-notes.md')).toBeVisible()

  // The single-file export lands in the shell after a prompt cycle.
  await runInTerminal(page, tabId, '') // cycle a prompt so the hook sources env.sh
  await runInTerminal(page, tabId, 'echo "ONE=$CLU_FILE"')
  await expect(page.locator('.xterm')).toContainText(`ONE=${project}/notes.md`, {
    timeout: 10_000,
  })
  await closeApp(app, page)
})

test('two pins populate $CLU_FILES; the unpin button removes one', async () => {
  const project = makeProject({ 'a.ts': 'a\n', 'b.ts': 'b\n' })
  const { app, page } = await launch()
  const tabId = await openProject(page, project)

  await pinFile(page, tabId, `${project}/a.ts`)
  await pinFile(page, tabId, `${project}/b.ts`)
  await expect(page.getByTestId('pinned-a.ts')).toBeVisible()
  await expect(page.getByTestId('pinned-b.ts')).toBeVisible()

  await runInTerminal(page, tabId, '')
  await runInTerminal(page, tabId, 'echo "ALL=${CLU_FILES[@]}"')
  await expect(page.locator('.xterm')).toContainText(`ALL=${project}/a.ts ${project}/b.ts`, {
    timeout: 10_000,
  })

  // Click the × on a.ts's pinned row → it leaves the set.
  await page.getByRole('button', { name: 'Unpin a.ts' }).click()
  await expect(page.getByTestId('pinned-a.ts')).toHaveCount(0)
  await expect(page.getByTestId('pinned-b.ts')).toBeVisible()
  await closeApp(app, page)
})

test('deleting a pinned file marks it stale but keeps it pinned (ADR-0005)', async () => {
  const project = makeProject({ 'keep.ts': 'keep\n' })
  const { app, page } = await launch()
  const tabId = await openProject(page, project)

  await pinFile(page, tabId, `${project}/keep.ts`)
  await expect(page.getByTestId('pinned-keep.ts')).toBeVisible()

  // Remove it from the real shell → chokidar unlink → stale marker, still pinned.
  await runInTerminal(page, tabId, 'rm keep.ts')
  await expect(page.locator('[data-testid="pinned-keep.ts"].stale')).toBeVisible({
    timeout: 10_000,
  })
  await expect(page.getByTestId('pinned-keep.ts')).toContainText('⚠')
  await closeApp(app, page)
})
