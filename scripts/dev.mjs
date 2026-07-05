// Dev launcher. Sets ELECTRON_OVERRIDE_DIST_PATH to the resolved Electron dist
// dir BEFORE electron-vite runs, so electron's index.js returns the binary path
// directly — skipping the existence-check/auto-download path that otherwise
// prints "Downloading Electron binary..." and can race. Cross-platform: the
// path is resolved from the installed electron package, not hard-coded.

import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { spawn } from 'node:child_process'

const require = createRequire(import.meta.url)
const electronDir = dirname(require.resolve('electron/package.json'))
process.env.ELECTRON_OVERRIDE_DIST_PATH = join(electronDir, 'dist')

const bin = process.platform === 'win32' ? 'electron-vite.cmd' : 'electron-vite'
const child = spawn(join('node_modules', '.bin', bin), ['dev'], {
  stdio: 'inherit',
  env: process.env,
})
child.on('exit', (code) => process.exit(code ?? 0))
