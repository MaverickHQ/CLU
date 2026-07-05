// Browser-fallback Host: lets the renderer run outside Electron (vite dev in a
// plain browser, jsdom). State persists to localStorage; fs/git/pty are inert.
// Real behaviour lives behind the Electron Host; tests use the fake Host.

import type { Host, Unsubscribe } from '@shared/host'
import type { AppState, ProjectState, TabId } from '@shared/types'

export function createBrowserHost(): Host {
  const key = (k: string) => `clu:${k}`

  return {
    async readFile() {
      throw new Error('browserHost: no filesystem')
    },
    async writeFile() {},
    async listDir() {
      return []
    },
    watchDir(): Unsubscribe {
      return () => {}
    },
    async pickDirectory() {
      return null
    },
    async gitStatus() {
      return null
    },
    async pathExists() {
      return true // no filesystem to be missing from
    },
    async registerRoot() {},
    droppedFilePath: (file) => (file as { path?: string })?.path ?? null,
    async writeEnvFile() {},
    // (droppedFilePath / registerRoot above)

    state: {
      async saveProject(projectPath: string, payload: ProjectState) {
        localStorage.setItem(key(`project:${projectPath}`), JSON.stringify(payload))
      },
      async loadProject(projectPath: string) {
        const raw = localStorage.getItem(key(`project:${projectPath}`))
        return raw ? (JSON.parse(raw) as ProjectState) : null
      },
      async saveApp(payload: AppState) {
        localStorage.setItem(key('app'), JSON.stringify(payload))
      },
      async loadApp() {
        const raw = localStorage.getItem(key('app'))
        return raw ? (JSON.parse(raw) as AppState) : null
      },
    },

    spawnPty: (): TabId => 'browser-pty',
    ptyWrite: () => {},
    ptyResize: () => {},
    ptyKill: () => {},
    onPtyData: (): Unsubscribe => () => {},
    onPtyExit: (): Unsubscribe => () => {},
  }
}
