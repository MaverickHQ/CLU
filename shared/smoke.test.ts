// Task 2.1 tracer bullet: proves the Vitest node pipeline loads TS from shared/.
// Written RED-first: fails until package.json + vitest.config.ts exist and
// `pnpm install` has run.
import { describe, expect, it } from 'vitest'

describe('vitest node pipeline', () => {
  it('runs TypeScript tests from shared/', () => {
    const stack: string[] = ['electron', 'react', 'xterm.js', 'node-pty']
    expect(stack).toHaveLength(4)
  })
})
