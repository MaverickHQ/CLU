// Task 3.2 behaviours (5)-(9): the ADR-0007 shell-init mechanism, proven
// against REAL bash and zsh through the PTY wrapper. These are the product's
// riskiest-component tests — if these pass, the differentiator works.
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { renderPosixEnv } from './envFile'
import { createNodePty } from './pty'
import { prepareShellInit } from './shellInit'

const HAS_BASH = existsSync('/bin/bash')
const HAS_ZSH = existsSync('/bin/zsh')

describe('prepareShellInit (pure plan)', () => {
  it('bash: --rcfile plan sourcing the user rc, hook as if-statement', () => {
    const plan = prepareShellInit({ shell: '/bin/bash', home: '/home/u', tmpDir: '/tmp/x' })
    expect(plan.integrated).toBe(true)
    expect(plan.args).toEqual(['--rcfile', '/tmp/x/clu-bashrc.sh'])
    expect(plan.files[0].content).toContain('[ -f "/home/u/.bashrc" ] && . "/home/u/.bashrc"')
    expect(plan.files[0].content).toContain('if [ -n "$CLU_ENV_FILE" ] && [ -f "$CLU_ENV_FILE" ]')
    expect(plan.files[0].content).toContain('PROMPT_COMMAND="_clu_load_env')
  })

  it('zsh: ZDOTDIR plan sources user .zshenv + .zshrc, precmd hook', () => {
    const plan = prepareShellInit({ shell: '/bin/zsh', home: '/home/u', tmpDir: '/tmp/z' })
    expect(plan.integrated).toBe(true)
    expect(plan.env).toEqual({ ZDOTDIR: '/tmp/z' })
    const zshenv = plan.files.find((f) => f.path === '/tmp/z/.zshenv')!
    const zshrc = plan.files.find((f) => f.path === '/tmp/z/.zshrc')!
    expect(zshenv.content).toContain('. "/home/u/.zshenv"') // PATH/env (claude) sourced
    expect(zshrc.content).toContain('. "/home/u/.zshrc"')
    expect(zshrc.content).toContain('precmd_functions+=(_clu_load_env)')
  })

  it('zsh: honors a real $ZDOTDIR instead of hardcoding ~ (F1)', () => {
    const plan = prepareShellInit({
      shell: '/bin/zsh',
      home: '/home/u',
      tmpDir: '/tmp/z',
      zdotdir: '/home/u/.config/zsh',
    })
    const zshrc = plan.files.find((f) => f.path === '/tmp/z/.zshrc')!
    const zshenv = plan.files.find((f) => f.path === '/tmp/z/.zshenv')!
    expect(zshrc.content).toContain('. "/home/u/.config/zsh/.zshrc"')
    expect(zshenv.content).toContain('. "/home/u/.config/zsh/.zshenv"')
    expect(zshrc.content).not.toContain('/home/u/.zshrc') // NOT the hardcoded home path
  })

  it('unknown shells are not integrated (fallback path), and expose the shell name', () => {
    for (const shell of ['/bin/sh', '/usr/bin/fish', '/usr/bin/nu']) {
      const plan = prepareShellInit({ shell, home: '/h', tmpDir: '/t' })
      expect(plan.integrated).toBe(false)
      expect(plan.shell).toBe(shell.split('/').pop())
    }
  })
})

/** Spawn a shell with the ADR-0007 plan applied; return helpers. */
function spawnWithInit(shell: string) {
  const tmpDir = mkdtempSync(join(tmpdir(), 'clu-init-'))
  const home = join(tmpDir, 'home')
  mkdirSync(home)
  const envFile = join(tmpDir, 'env.sh')

  const rcName = shell.endsWith('zsh') ? '.zshrc' : '.bashrc'
  writeFileSync(join(home, rcName), `export FIXTURE_MARK=from-user-rc\n`)

  const plan = prepareShellInit({ shell, home, tmpDir })
  for (const f of plan.files) writeFileSync(f.path, f.content)

  const pty = createNodePty()
  const id = pty.spawn({
    shell,
    args: plan.args,
    cwd: tmpDir,
    cols: 100,
    rows: 30,
    env: { HOME: home, CLU_ENV_FILE: envFile, TERM: 'xterm-256color', ...plan.env },
  })

  function waitFor(marker: string, timeoutMs = 5000): Promise<string> {
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
        reject(new Error(`timeout waiting for "${marker}"; got: ${JSON.stringify(buf.slice(-400))}`))
      }, timeoutMs)
    })
  }

  return { pty, id, envFile, waitFor, kill: () => pty.kill(id) }
}

describe.runIf(HAS_BASH)('bash shell-init integration (real /bin/bash)', () => {
  it('(5) still loads the user rc through our --rcfile', async () => {
    const s = spawnWithInit('/bin/bash')
    const seen = s.waitFor('MARK=from-user-rc')
    s.pty.write(s.id, 'echo "MARK=$FIXTURE_MARK"\n')
    await expect(seen).resolves.toContain('MARK=from-user-rc')
    s.kill()
  })

  it('(6) env.sh written mid-session is live at the next prompt, quoting intact', async () => {
    const s = spawnWithInit('/bin/bash')
    // Pin after the shell is already running — the whole point of ADR-0007.
    writeFileSync(
      s.envFile,
      renderPosixEnv({ file: "/pinned/it's file.md", files: ["/pinned/it's file.md", '/p/b.ts'] }),
    )
    const seen = s.waitFor('COUNT=2')
    // Empty line cycles a prompt (hook sources env.sh), then read it back.
    s.pty.write(s.id, '\n')
    s.pty.write(s.id, 'echo "F=$CLU_FILE"; echo "COUNT=${#CLU_FILES[@]}"\n')
    const out = await seen
    expect(out).toContain("F=/pinned/it's file.md")
    expect(out).toContain('COUNT=2')
    s.kill()
  })

  it('(8) a mid-typed command line is never corrupted by a pin change', async () => {
    const s = spawnWithInit('/bin/bash')
    s.pty.write(s.id, 'echo abc') // user is mid-typing — no newline
    writeFileSync(s.envFile, renderPosixEnv({ file: '/p/new.md', files: ['/p/new.md'] }))
    await new Promise((r) => setTimeout(r, 400)) // pin change settles
    const seen = s.waitFor('abc def')
    s.pty.write(s.id, ' def\n') // finish the line
    await expect(seen).resolves.toContain('abc def')
    s.kill()
  })

  it('(9) an rc with `set -e` survives a missing env file', async () => {
    const s = spawnWithInit('/bin/bash')
    // Overwrite fixture rc BEFORE spawn happens? Too late — instead verify the
    // hook's if-form with a strict shell option enabled interactively.
    const seen = s.waitFor('still-alive')
    s.pty.write(s.id, 'set -e\n') // strict mode ON, env file still missing
    s.pty.write(s.id, '\n') // prompt cycle → hook runs against missing file
    s.pty.write(s.id, 'echo still-alive\n')
    await expect(seen).resolves.toContain('still-alive')
    s.kill()
  })
})

describe.runIf(HAS_ZSH)('zsh shell-init integration (real /bin/zsh)', () => {
  it('(7) ZDOTDIR init: user rc loads AND env.sh is live at the next prompt', async () => {
    const s = spawnWithInit('/bin/zsh')
    const rcSeen = s.waitFor('MARK=from-user-rc')
    s.pty.write(s.id, 'echo "MARK=$FIXTURE_MARK"\n')
    await expect(rcSeen).resolves.toContain('MARK=from-user-rc')

    writeFileSync(s.envFile, renderPosixEnv({ file: '/p/zsh.md', files: ['/p/zsh.md'] }))
    const envSeen = s.waitFor('F=/p/zsh.md')
    s.pty.write(s.id, '\n')
    s.pty.write(s.id, 'echo "F=$CLU_FILE"\n')
    await expect(envSeen).resolves.toContain('F=/p/zsh.md')
    s.kill()
  })
})
