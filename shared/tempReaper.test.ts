// Task 3.5g: temp-dir reaper. Uses a real mkdtemp so removal is genuinely
// exercised, plus a fake exit that fires the reap.
import { existsSync, mkdtempSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { createTempDirReaper } from './tempReaper'

const realRm = (dir: string) => rm(dir, { recursive: true, force: true })

describe('temp-dir reaper', () => {
  it('removes a tracked dir when its pty "exits"', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'clu-reap-'))
    expect(existsSync(dir)).toBe(true)

    const reaper = createTempDirReaper(realRm)
    reaper.track('pty-1', dir)
    // simulate the onExit callback firing
    await reaper.reap('pty-1')

    expect(existsSync(dir)).toBe(false)
    expect(reaper.size()).toBe(0)
  })

  it('reapAll clears every tracked dir (teardown)', async () => {
    const a = mkdtempSync(join(tmpdir(), 'clu-reap-'))
    const b = mkdtempSync(join(tmpdir(), 'clu-reap-'))
    const reaper = createTempDirReaper(realRm)
    reaper.track('a', a)
    reaper.track('b', b)

    await reaper.reapAll()
    expect(existsSync(a)).toBe(false)
    expect(existsSync(b)).toBe(false)
    expect(reaper.size()).toBe(0)
  })

  it('reaping an unknown id and a failing rm are harmless', async () => {
    const reaper = createTempDirReaper(vi.fn(async () => { throw new Error('EBUSY') }))
    await expect(reaper.reap('nope')).resolves.toBeUndefined()
    reaper.track('x', '/tmp/whatever')
    await expect(reaper.reap('x')).resolves.toBeUndefined() // swallows rm error
  })
})
