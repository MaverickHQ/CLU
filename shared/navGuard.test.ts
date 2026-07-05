// Task 3.5b: navigation confinement (finding S1). RED-first.
import { describe, expect, it } from 'vitest'
import { shouldAllowNavigation } from './navGuard'

describe('shouldAllowNavigation — packaged (file://)', () => {
  const current = 'file:///Applications/CLU.app/Contents/Resources/app/out/renderer/index.html'

  it('allows an exact reload of the same renderer document', () => {
    expect(shouldAllowNavigation(current, current)).toBe(true)
  })
  it('denies a sibling file:// path (repo file, attacker HTML)', () => {
    expect(
      shouldAllowNavigation('file:///Users/victim/evil/index.html', current),
    ).toBe(false)
    expect(shouldAllowNavigation('file:///etc/passwd', current)).toBe(false)
  })
  it('denies external http(s) and about:blank', () => {
    expect(shouldAllowNavigation('https://evil.example.com', current)).toBe(false)
    expect(shouldAllowNavigation('http://localhost:9/x', current)).toBe(false)
    expect(shouldAllowNavigation('about:blank', current)).toBe(false)
  })
})

describe('shouldAllowNavigation — dev server (http)', () => {
  const current = 'http://localhost:5173/'

  it('allows same-origin dev navigations, denies cross-origin', () => {
    expect(shouldAllowNavigation('http://localhost:5173/', current)).toBe(true)
    expect(shouldAllowNavigation('http://localhost:5173/#/x', current)).toBe(true)
    expect(shouldAllowNavigation('http://localhost:5174/', current)).toBe(false)
    expect(shouldAllowNavigation('https://evil.example.com', current)).toBe(false)
  })
})

it('denies unparseable targets', () => {
  expect(shouldAllowNavigation('::not a url', 'http://localhost:5173/')).toBe(false)
})
