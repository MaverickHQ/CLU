import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

// Two projects: node for logic (shared/main/preload + store), jsdom for
// renderer component tests (which also load jest-dom matchers).
export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve('shared'),
      '@renderer': resolve('renderer/src'),
    },
  },
  test: {
    globals: true,
    projects: [
      {
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          include: [
            '{main,preload,shared}/**/*.test.{ts,tsx}',
            'renderer/src/*.test.ts', // top-level pure renderer tests (e.g. testHook)
            'renderer/**/store/**/*.test.ts',
            'renderer/**/host/**/*.test.ts',
            'renderer/**/terminal/**/*.test.ts',
            'renderer/**/pins/**/*.test.ts',
            'renderer/**/tree/**/*.test.ts',
          ],
        },
      },
      {
        extends: true,
        test: {
          name: 'dom',
          environment: 'jsdom',
          setupFiles: ['renderer/src/test-setup.ts'],
          include: ['renderer/**/*.test.tsx'],
          exclude: ['renderer/**/store/**'],
        },
      },
    ],
  },
})
