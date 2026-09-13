// Typed IPC contract between main and renderer. Channel names + the shape
// preload exposes on window.cluHost. Keeping this in shared/ means both sides
// agree; the renderer's electronHost wraps the bridge into the full Host.

import type { AppState, ProjectState } from './types'
import type { GitStatus } from './host'

export const IPC = {
  stateSaveProject: 'clu:state:save-project',
  stateLoadProject: 'clu:state:load-project',
  stateSaveApp: 'clu:state:save-app',
  stateLoadApp: 'clu:state:load-app',
  fileRead: 'clu:file:read',
  fileWrite: 'clu:file:write',
  fileList: 'clu:file:list',
  envWrite: 'clu:env:write',
  gitStatus: 'clu:git:status',
  pathExists: 'clu:file:exists',
  registerRoot: 'clu:root:register',
  pickDirectory: 'clu:dialog:pick-directory',
  quitRequest: 'clu:app:quit-request', // main → renderer (push)
  quitConfirm: 'clu:app:quit-confirm',
  notify: 'clu:app:notify', // renderer → main (R2.1k)
  focusTab: 'clu:app:focus-tab', // main → renderer (push, on notification click)
  watchStart: 'clu:watch:start',
  watchStop: 'clu:watch:stop',
  watchEvent: 'clu:watch:event', // main → renderer (push)
  ptySpawn: 'clu:pty:spawn',
  ptyWrite: 'clu:pty:write',
  ptyResize: 'clu:pty:resize',
  ptyKill: 'clu:pty:kill',
  ptyData: 'clu:pty:data', // main → renderer (push)
  ptyExit: 'clu:pty:exit', // main → renderer (push)
} as const

/** The surface preload puts on window.cluHost. */
export interface PreloadBridge {
  state: {
    saveProject(projectPath: string, payload: ProjectState): Promise<void>
    loadProject(projectPath: string): Promise<ProjectState | null>
    saveApp(payload: AppState): Promise<void>
    loadApp(): Promise<AppState | null>
  }
  readFile(absPath: string): Promise<{ content: string; sizeBytes: number; tooLarge?: boolean }>
  writeFile(absPath: string, content: string): Promise<void>
  listDir(absPath: string): Promise<Array<{ name: string; isDir: boolean }>>
  writeEnvFile(projectPath: string, exp: { file: string | null; files: string[] }): Promise<void>
  gitStatus(projectPath: string): Promise<GitStatus | null>
  pathExists(absPath: string): Promise<boolean>
  registerRoot(projectPath: string): Promise<void>
  /** Resolve a dropped File to an absolute path (webUtils.getPathForFile). */
  getDroppedPath(file: File): string
  pickDirectory(): Promise<string | null>
  onQuitRequest(cb: () => void): () => void
  confirmQuit(): void
  notify(opts: { title: string; body: string; tabId: string }): void
  onFocusTab(cb: (tabId: string) => void): () => void

  watchStart(absPath: string): Promise<number>
  watchStop(watchId: number): Promise<void>
  onWatchEvent(cb: (watchId: number, events: unknown) => void): () => void

  ptySpawn(opts: {
    shell?: string
    cwd: string
    cols: number
    rows: number
    env?: Record<string, string>
  }): Promise<string>
  ptyWrite(id: string, data: string): void
  ptyResize(id: string, cols: number, rows: number): void
  ptyKill(id: string): void
  onPtyData(cb: (id: string, data: string) => void): () => void
  onPtyExit(cb: (id: string) => void): () => void
}

declare global {
  interface Window {
    cluHost?: PreloadBridge
  }
}
