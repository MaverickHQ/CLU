// Task 3.7 behaviours (3)(4): real chokidar over a temp dir (no Electron).
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { FsEvent } from './host'
import { createDirWatcher } from './watcher'

async function watchReady(dir: string, collect: FsEvent[]): Promise<() => void> {
  const stop = await new Promise<() => void>((resolve) => {
    const s = createDirWatcher(dir, (events) => collect.push(...events), {
      onReady: () => resolve(s),
      debounceMs: 50,
    })
  })
  // fsevents can drop writes made immediately after 'ready' while the stream
  // warms up (observed under parallel suite load) — let it settle.
  await new Promise((r) => setTimeout(r, 250))
  return stop
}

function waitFor(predicate: () => boolean, timeoutMs = 8000): Promise<void> {
  return new Promise((resolve, reject) => {
    const started = Date.now()
    const tick = (): void => {
      if (predicate()) return resolve()
      if (Date.now() - started > timeoutMs) return reject(new Error('waitFor timeout'))
      setTimeout(tick, 50)
    }
    tick()
  })
}

describe('chokidar dir watcher (real fs)', () => {
  it('(3) delivers add / change / unlink for real file operations', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'clu-watch-'))
    const events: FsEvent[] = []
    const stop = await watchReady(dir, events)

    const file = join(dir, 'a.ts')
    writeFileSync(file, 'one')
    await waitFor(() => events.some((e) => e.type === 'add' && e.path === file))

    writeFileSync(file, 'two')
    await waitFor(() => events.some((e) => e.type === 'change' && e.path === file))

    rmSync(file)
    await waitFor(() => events.some((e) => e.type === 'unlink' && e.path === file))
    stop()
  }, 15000)

  it('(3.6c) delivers addDir / unlinkDir for real directory operations', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'clu-watch-'))
    const events: FsEvent[] = []
    const stop = await watchReady(dir, events)

    const sub = join(dir, 'pkg')
    mkdirSync(sub)
    await waitFor(() => events.some((e) => e.type === 'addDir' && e.path === sub))

    rmSync(sub, { recursive: true })
    await waitFor(() => events.some((e) => e.type === 'unlinkDir' && e.path === sub))
    stop()
  }, 15000)

  it('(4) events under ignored subtrees never arrive', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'clu-watch-'))
    mkdirSync(join(dir, 'node_modules'))
    const events: FsEvent[] = []
    const stop = await watchReady(dir, events)

    writeFileSync(join(dir, 'node_modules', 'pkg.js'), 'ignored')
    writeFileSync(join(dir, 'visible.ts'), 'seen')
    await waitFor(() => events.some((e) => e.path.endsWith('visible.ts')))
    await new Promise((r) => setTimeout(r, 200)) // grace for any stray emit

    expect(events.some((e) => e.path.includes('node_modules'))).toBe(false)
    stop()
  }, 15000)
})
