// Tree + viewer end-to-end: real listDir over the filesystem, real markdown/
// shiki rendering, real `git status` decorations. None of this is reachable
// through the fake-Host Vitest suite.

import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { closeApp, launch, makeProject, openProject } from './helpers'

test('tree lists the project and a Markdown file renders in the viewer', async () => {
  const project = makeProject({
    'README.md': '# CLU Fixture\n\nHello from **e2e**.\n',
    'src/main.ts': 'export const answer = 42\n',
  })
  const { app, page } = await launch()
  await openProject(page, project)

  // Root listing appears (dirs + files).
  await expect(page.getByTestId('tree-row-README.md')).toBeVisible()
  await expect(page.getByTestId('tree-row-src')).toBeVisible()

  // Click the Markdown file → markdown viewer renders the heading text.
  await page.getByTestId('tree-row-README.md').click()
  await expect(page.getByTestId('viewer-markdown')).toBeVisible()
  await expect(page.getByTestId('viewer-markdown')).toContainText('CLU Fixture')
  await closeApp(app, page)
})

test('expanding a directory reveals children; a code file renders highlighted', async () => {
  const project = makeProject({
    'README.md': '# x\n',
    'src/main.ts': 'export const answer = 42\n',
  })
  const { app, page } = await launch()
  await openProject(page, project)

  // Expand src/ → its child loads lazily.
  await page.getByTestId('tree-row-src').click()
  await expect(page.getByTestId('tree-row-main.ts')).toBeVisible()

  // Open the code file → code viewer with the source text.
  await page.getByTestId('tree-row-main.ts').click()
  await expect(page.getByTestId('viewer-code')).toBeVisible()
  await expect(page.getByTestId('viewer-code')).toContainText('answer')
  await closeApp(app, page)
})

test('git decorations mark a modified tracked file (real git repo)', async () => {
  const project = makeProject({ 'tracked.ts': 'export const a = 1\n' })
  // Commit a clean baseline, then dirty the file so it shows as modified.
  execFileSync('git', ['init', '-q'], { cwd: project })
  execFileSync('git', ['add', '.'], { cwd: project })
  execFileSync(
    'git',
    ['-c', 'user.email=e@e', '-c', 'user.name=e', 'commit', '-q', '-m', 'init'],
    { cwd: project },
  )
  writeFileSync(join(project, 'tracked.ts'), 'export const a = 2\n')

  const { app, page } = await launch()
  await openProject(page, project)

  const decoration = page.locator('[data-testid="tree-row-tracked.ts"] .git-status')
  await expect(decoration).toHaveText('M', { timeout: 10_000 })
  await closeApp(app, page)
})
