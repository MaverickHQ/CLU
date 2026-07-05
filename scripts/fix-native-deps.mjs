// Postinstall: make pnpm-installed native deps reliable and reproducible.
//
//  1. node-pty: pnpm's tarball extraction can drop the exec bit on the macOS/
//     Linux `spawn-helper` binary -> pty.spawn fails with "posix_spawnp failed".
//     Restore +x.
//  2. electron: pnpm can gate electron's postinstall, leaving the binary
//     un-downloaded -> the dev launcher prints "Downloading Electron binary..."
//     and can race. Ensure the dist binary exists (run electron's install.js).
//
// No-ops where not applicable. Non-fatal on error (a later install retries).

import { chmodSync, existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'

const require = createRequire(import.meta.url)

function fixNodePty() {
  if (process.platform === 'win32') return // conpty, no spawn-helper
  try {
    const pkgRoot = join(dirname(require.resolve('node-pty')), '..')
    const arch = `${process.platform}-${process.arch}`
    const helper = join(pkgRoot, 'prebuilds', arch, 'spawn-helper')
    if (existsSync(helper)) {
      chmodSync(helper, 0o755)
      console.log(`[fix-native-deps] chmod +x ${arch}/spawn-helper`)
    }
  } catch (err) {
    console.warn('[fix-native-deps] node-pty skipped:', err.message)
  }
}

function ensureElectron() {
  try {
    // Resolve electron's package dir without triggering its index.js download.
    const pkgJson = require.resolve('electron/package.json')
    const electronDir = dirname(pkgJson)
    const pathFile = join(electronDir, 'path.txt')
    if (!existsSync(pathFile)) {
      runElectronInstall(electronDir)
      return
    }
    const rel = readFileSync(pathFile, 'utf-8').trim()
    const binary = join(electronDir, 'dist', rel)
    if (!existsSync(binary)) {
      runElectronInstall(electronDir)
    } else {
      console.log('[fix-native-deps] electron binary present')
    }
  } catch (err) {
    console.warn('[fix-native-deps] electron skipped:', err.message)
  }
}

function runElectronInstall(electronDir) {
  const installJs = join(electronDir, 'install.js')
  if (!existsSync(installJs)) return
  console.log('[fix-native-deps] downloading electron binary…')
  execFileSync(process.execPath, [installJs], { cwd: electronDir, stdio: 'inherit' })
}

fixNodePty()
ensureElectron()
