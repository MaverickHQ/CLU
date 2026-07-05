// Task 3.6 behaviours (1)(2)(6): viewer routing pure functions.
import { describe, expect, it } from 'vitest'
import { classifyFile, isBinarySample, MAX_BYTES, restoreTopLine, shikiTheme } from './classify'

describe('(1) classifyFile routing', () => {
  it('routes markdown, code, plain', () => {
    expect(classifyFile('/p/README.md', 100, '# hi').kind).toBe('markdown')
    expect(classifyFile('/p/App.tsx', 100, 'export {}')).toMatchObject({
      kind: 'code',
      language: 'tsx',
    })
    expect(classifyFile('/p/main.go', 100, 'package main').language).toBe('go')
    expect(classifyFile('/p/notes.txt', 100, 'hello').kind).toBe('plain')
    expect(classifyFile('/p/Makefile', 100, 'build:').kind).toBe('plain') // no ext
    expect(classifyFile('/p/data.unknownext', 100, 'x').kind).toBe('plain')
  })

  it('sniffs binaries (NUL byte or >30% control chars)', () => {
    expect(classifyFile('/p/blob.dat', 100, 'abc\0def').kind).toBe('binary')
    expect(isBinarySample('\x01\x02\x03\x04plain')).toBe(true)
    expect(isBinarySample('perfectly normal text\nwith lines\t and tabs')).toBe(false)
  })

  it('(2) enforces size limits: 10MB default, 50MB for .log', () => {
    expect(classifyFile('/p/bundle.js', MAX_BYTES + 1, 'x').kind).toBe('too-large')
    expect(classifyFile('/p/server.log', MAX_BYTES + 1, 'x').kind).toBe('plain') // logs get 50MB
    expect(classifyFile('/p/server.log', 51 * 1024 * 1024, 'x').kind).toBe('too-large')
  })
})

describe('(4) shiki theme mapping', () => {
  it('maps CLU themes to bundled shiki themes', () => {
    expect(shikiTheme('kiro-dark')).toBe('tokyo-night')
    expect(shikiTheme('tomorrow-night-blue')).toBe('tokyo-night')
    expect(shikiTheme('solarized-light')).toBe('solarized-light')
  })
})

describe('(6) restoreTopLine', () => {
  it('keeps the line when it survives; clamps when content shrank', () => {
    expect(restoreTopLine(40, 100)).toBe(40)
    expect(restoreTopLine(40, 20)).toBe(19)
    expect(restoreTopLine(0, 0)).toBe(0)
  })
})
