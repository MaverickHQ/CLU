// Task 3.2 behaviours (1)-(3): quoting + env-file formats (ADR-0005).
import { describe, expect, it } from 'vitest'
import { renderFishEnv, renderPlainEnvCommand, renderPosixEnv } from './envFile'
import { posixQuote } from './shellQuote'

describe('(1) posixQuote', () => {
  it('wraps plain paths', () => {
    expect(posixQuote('/p/a.ts')).toBe(`'/p/a.ts'`)
  })
  it('is inert for spaces, $, backticks and globs', () => {
    expect(posixQuote('/p/dir with space/$HOME `id` *.ts')).toBe(
      `'/p/dir with space/$HOME \`id\` *.ts'`,
    )
  })
  it('escapes embedded single quotes via the close-escape-reopen dance', () => {
    expect(posixQuote(`/p/it's.md`)).toBe(`'/p/it'\\''s.md'`)
  })
})

describe('(2) renderPosixEnv — ADR-0005 bash array format', () => {
  it('renders CLU_FILE + CLU_FILES array', () => {
    const out = renderPosixEnv({ file: '/p/readme.md', files: ['/p/a.ts', '/p/dir with space/b.md'] })
    expect(out).toBe(
      `export CLU_FILE='/p/readme.md'\n` +
        `CLU_FILES=('/p/a.ts' '/p/dir with space/b.md')\n` +
        `export CLU_FILES\n`,
    )
  })
  it('renders empty state (no pins, no viewer file)', () => {
    expect(renderPosixEnv({ file: null, files: [] })).toBe(
      `export CLU_FILE=''\nCLU_FILES=()\nexport CLU_FILES\n`,
    )
  })
})

describe('(3) renderFishEnv translation', () => {
  it('uses set -gx with fish quoting', () => {
    expect(renderFishEnv({ file: "/p/it's.md", files: ['/p/a.ts'] })).toBe(
      `set -gx CLU_FILE '/p/it\\'s.md'\nset -gx CLU_FILES '/p/a.ts'\n`,
    )
  })
})

describe('fallback single-var command', () => {
  it('space-joins into one quoted var', () => {
    expect(renderPlainEnvCommand({ file: '/p/x.md', files: ['/a', '/b'] })).toBe(
      `export CLU_FILE='/p/x.md' CLU_FILES='/a /b'`,
    )
  })
})

describe('fallbackEnvCommand (F4 — non-integrated shells)', () => {
  it('fish uses set -gx; other shells use the space-joined POSIX export', async () => {
    const { fallbackEnvCommand } = await import('./envFile')
    const exp = { file: '/p/a.md', files: ['/p/a.md', '/p/b.ts'] }
    expect(fallbackEnvCommand('fish', exp)).toContain('set -gx CLU_FILES')
    expect(fallbackEnvCommand('sh', exp)).toBe(
      `export CLU_FILE='/p/a.md' CLU_FILES='/p/a.md /p/b.ts'`,
    )
  })
})
