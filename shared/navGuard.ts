// Navigation confinement (task 3.5b, finding S1). With sandbox:false the
// renderer holds the cluHost bridge, so it must never navigate away to foreign
// content that would inherit it. Pure so it's testable without Electron.

/**
 * Allow a navigation only when it stays on the app's own renderer document.
 * `current` is the app's renderer URL (the dev server URL, or the packaged
 * file:// index.html). Everything else — external http(s), other file:// paths,
 * about:blank — is denied and should be opened in the OS browser instead.
 */
export function shouldAllowNavigation(target: string, current: string): boolean {
  if (target === current) return true // reloads / in-page
  try {
    const t = new URL(target)
    const c = new URL(current)
    if (t.protocol !== c.protocol) return false
    if (t.protocol === 'file:') {
      // Same packaged renderer file only (no sibling file:// paths).
      return t.pathname === c.pathname
    }
    // Dev server (http/https): same origin only.
    return t.origin === c.origin
  } catch {
    return false // unparseable → deny
  }
}
