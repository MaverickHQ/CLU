import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

// Three-process build (three-layer discipline lives inside renderer/):
// main    = Electron main process (Host adapter impl: PTY, fs, watch, state)
// preload = contextBridge surface
// renderer = React app (UI / Zustand state / Host-adapter interface calls)
export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'out/main',
      // CommonJS .cjs: package.json is "type":"module", so .js would be parsed
      // as ESM — under which Electron's CJS named exports (app, BrowserWindow)
      // resolve to undefined. Electron's main process is canonically CJS.
      rollupOptions: {
        input: resolve('main/index.ts'),
        // `electron` (runtime API) and `node-pty` (native addon w/ relative
        // prebuild paths) must stay external — bundling breaks both.
        external: ['electron', 'node-pty'],
        output: { format: 'cjs', entryFileNames: '[name].cjs' },
      },
    },
    resolve: { alias: { '@shared': resolve('shared') } },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'out/preload',
      rollupOptions: {
        input: resolve('preload/index.ts'),
        external: ['electron'],
        output: { format: 'cjs', entryFileNames: '[name].cjs' },
      },
    },
    resolve: { alias: { '@shared': resolve('shared') } },
  },
  renderer: {
    root: 'renderer',
    plugins: [react()],
    build: {
      outDir: 'out/renderer',
      rollupOptions: { input: resolve('renderer/index.html') },
    },
    resolve: {
      alias: {
        '@shared': resolve('shared'),
        '@renderer': resolve('renderer/src'),
      },
    },
  },
})
