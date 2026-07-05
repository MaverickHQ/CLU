// Task 2.2 behaviours (4)-(8): real node-pty integration (no Electron). The
// Electron-backed Host reuses createNodePty; these tests document the PTY
// contract. Uses a real shell, so slower than fake-Host unit tests.
import { describe, expect, it, vi } from 'vitest'
import { createNodePty } from './pty'

const SHELL = process.platform === 'win32' ? 'powershell.exe' : '/bin/sh'

/** Collect PTY output until `marker` is seen or the timeout elapses. */
function waitForOutput(
  pty: ReturnType<typeof createNodePty>,
  id: string,
  marker: string,
  timeoutMs = 4000,
): Promise<string> {
  return new Promise((resolve, reject) => {
    let buf = ''
    const sub = pty.onData(id, (data) => {
      buf += data
      if (buf.includes(marker)) {
        sub()
        resolve(buf)
      }
    })
    setTimeout(() => {
      sub()
      reject(new Error(`timeout waiting for "${marker}"; got: ${JSON.stringify(buf)}`))
    }, timeoutMs)
  })
}

describe('node-pty', () => {
  it('echoes input typed into the PTY back through onData', async () => {
    const pty = createNodePty()
    const id = pty.spawn({ shell: SHELL, cwd: process.cwd(), cols: 80, rows: 24 })

    const seen = waitForOutput(pty, id, 'clu-marker-42')
    pty.write(id, 'echo clu-marker-42\n')

    await expect(seen).resolves.toContain('clu-marker-42')
    pty.kill(id)
  })

  it('runs the shell in the given cwd (the Tab projectPath contract)', async () => {
    const pty = createNodePty()
    const id = pty.spawn({ shell: SHELL, cwd: '/tmp', cols: 80, rows: 24 })

    const seen = waitForOutput(pty, id, '/tmp')
    pty.write(id, 'pwd\n')

    await expect(seen).resolves.toContain('/tmp')
    pty.kill(id)
  })

  it('passes custom env vars into the shell (CLU_TAB_ID contract)', async () => {
    const pty = createNodePty()
    const id = pty.spawn({
      shell: SHELL,
      cwd: process.cwd(),
      cols: 80,
      rows: 24,
      env: { CLU_TAB_ID: 'tab-under-test' },
    })

    const seen = waitForOutput(pty, id, 'tab-under-test')
    pty.write(id, 'echo $CLU_TAB_ID\n')

    await expect(seen).resolves.toContain('tab-under-test')
    pty.kill(id)
  })

  it('stops delivering data after unsubscribe', async () => {
    const pty = createNodePty()
    const id = pty.spawn({ shell: SHELL, cwd: process.cwd(), cols: 80, rows: 24 })
    const onData = vi.fn<(d: string) => void>()

    const unsub = pty.onData(id, onData)
    unsub()
    pty.write(id, 'echo after-unsub\n')
    await new Promise((r) => setTimeout(r, 500))

    expect(onData).not.toHaveBeenCalled()
    pty.kill(id)
  })

  it('exposes resize without throwing', () => {
    const pty = createNodePty()
    const id = pty.spawn({ shell: SHELL, cwd: process.cwd(), cols: 80, rows: 24 })

    expect(() => pty.resize(id, 120, 40)).not.toThrow()
    pty.kill(id)
  })

  it('(3.6a) write/resize on an unknown id no-op instead of throwing', () => {
    // Fire-and-forget ipcMain.on handlers can't surface a rejection, so a throw
    // here would be an uncaught main-process exception. Must be silent.
    const pty = createNodePty()
    expect(() => pty.write('pty-does-not-exist', 'data')).not.toThrow()
    expect(() => pty.resize('pty-does-not-exist', 120, 40)).not.toThrow()
  })

  it('kill terminates the process (exit fires)', async () => {
    const pty = createNodePty()
    const exited = new Promise<void>((resolve) => {
      const id = pty.spawn({ shell: SHELL, cwd: process.cwd(), cols: 80, rows: 24 })
      pty.onExit(id, () => resolve())
      pty.kill(id)
    })
    await expect(exited).resolves.toBeUndefined()
  })

  it('isolates two concurrent PTYs by id (multi-Tab contract)', async () => {
    const pty = createNodePty()
    const a = pty.spawn({ shell: SHELL, cwd: '/tmp', cols: 80, rows: 24 })
    const b = pty.spawn({ shell: SHELL, cwd: process.cwd(), cols: 80, rows: 24 })
    const dataB = vi.fn<(d: string) => void>()
    pty.onData(b, dataB)

    const seenA = waitForOutput(pty, a, 'only-in-a')
    pty.write(a, 'echo only-in-a\n')
    await expect(seenA).resolves.toContain('only-in-a')

    expect(a).not.toBe(b)
    expect(dataB.mock.calls.map((c) => c[0]).join('')).not.toContain('only-in-a')
    pty.kill(a)
    pty.kill(b)
  })
})

describe('node-pty kill escalation (ADR-0004)', () => {
  it('SIGKILLs a shell that traps SIGHUP within ~1s', async () => {
    if (process.platform === 'win32') return
    const pty = createNodePty()
    const id = pty.spawn({ shell: '/bin/sh', cwd: process.cwd(), cols: 80, rows: 24 })

    // Make the shell ignore SIGHUP, then confirm it processed the command.
    const ready = waitForOutput(pty, id, 'hup-trapped')
    pty.write(id, "trap '' HUP; echo hup-trapped\n")
    await ready

    const exited = new Promise<void>((resolve) => pty.onExit(id, () => resolve()))
    const started = Date.now()
    pty.kill(id)
    await expect(exited).resolves.toBeUndefined()
    expect(Date.now() - started).toBeLessThan(3000) // escalation fired
  }, 10000)
})

describe('killAll teardown (C6)', () => {
  it('kills every live pty and empties the id list', async () => {
    const pty = createNodePty()
    const a = pty.spawn({ shell: SHELL, cwd: process.cwd(), cols: 80, rows: 24 })
    const b = pty.spawn({ shell: SHELL, cwd: process.cwd(), cols: 80, rows: 24 })
    expect(pty.ids().sort()).toEqual([a, b].sort())

    const exits = Promise.all([
      new Promise<void>((r) => pty.onExit(a, () => r())),
      new Promise<void>((r) => pty.onExit(b, () => r())),
    ])
    pty.killAll()
    await expect(exits).resolves.toBeDefined()
    expect(pty.ids()).toEqual([])
  }, 10000)
})
