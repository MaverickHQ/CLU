import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { IPC, type PreloadBridge } from '@shared/ipc'
import type { AppState, ProjectState } from '@shared/types'

// Exposes the typed Host bridge on window.cluHost. Push channels (watch/pty)
// use per-listener wrapper closures so unsubscribe removes exactly that
// listener — never a sibling component's.

const bridge: PreloadBridge = {
  state: {
    saveProject: (projectPath: string, payload: ProjectState) =>
      ipcRenderer.invoke(IPC.stateSaveProject, projectPath, payload),
    loadProject: (projectPath: string) => ipcRenderer.invoke(IPC.stateLoadProject, projectPath),
    saveApp: (payload: AppState) => ipcRenderer.invoke(IPC.stateSaveApp, payload),
    loadApp: () => ipcRenderer.invoke(IPC.stateLoadApp),
  },
  readFile: (absPath: string) => ipcRenderer.invoke(IPC.fileRead, absPath),
  writeFile: (absPath: string, content: string) =>
    ipcRenderer.invoke(IPC.fileWrite, absPath, content),
  listDir: (absPath: string) => ipcRenderer.invoke(IPC.fileList, absPath),
  writeEnvFile: (projectPath: string, exp: { file: string | null; files: string[] }) =>
    ipcRenderer.invoke(IPC.envWrite, projectPath, exp),
  gitStatus: (projectPath: string) => ipcRenderer.invoke(IPC.gitStatus, projectPath),
  pathExists: (absPath: string) => ipcRenderer.invoke(IPC.pathExists, absPath),
  registerRoot: (projectPath: string) => ipcRenderer.invoke(IPC.registerRoot, projectPath),
  // Electron 32 removed File.path; getPathForFile is the supported replacement
  // and must run in the preload (webUtils) — findng N1.
  getDroppedPath: (file: File) => webUtils.getPathForFile(file),
  pickDirectory: () => ipcRenderer.invoke(IPC.pickDirectory),
  onQuitRequest: (cb) => {
    const h = () => cb()
    ipcRenderer.on(IPC.quitRequest, h)
    return () => ipcRenderer.removeListener(IPC.quitRequest, h)
  },
  confirmQuit: () => ipcRenderer.send(IPC.quitConfirm),
  notify: (opts: { title: string; body: string; tabId: string }) =>
    ipcRenderer.send(IPC.notify, opts),
  onFocusTab: (cb: (tabId: string) => void) => {
    const h = (_e: unknown, tabId: string): void => cb(tabId)
    ipcRenderer.on(IPC.focusTab, h)
    return () => ipcRenderer.removeListener(IPC.focusTab, h)
  },

  watchStart: (absPath: string) => ipcRenderer.invoke(IPC.watchStart, absPath),
  watchStop: (watchId: number) => ipcRenderer.invoke(IPC.watchStop, watchId),
  onWatchEvent: (cb) => {
    const h = (_e: unknown, id: number, events: unknown) => cb(id, events)
    ipcRenderer.on(IPC.watchEvent, h)
    return () => ipcRenderer.removeListener(IPC.watchEvent, h)
  },

  ptySpawn: (opts) => ipcRenderer.invoke(IPC.ptySpawn, opts),
  ptyWrite: (id, data) => ipcRenderer.send(IPC.ptyWrite, id, data),
  ptyResize: (id, cols, rows) => ipcRenderer.send(IPC.ptyResize, id, cols, rows),
  ptyKill: (id) => ipcRenderer.send(IPC.ptyKill, id),
  onPtyData: (cb) => {
    const h = (_e: unknown, id: string, data: string) => cb(id, data)
    ipcRenderer.on(IPC.ptyData, h)
    return () => ipcRenderer.removeListener(IPC.ptyData, h)
  },
  onPtyExit: (cb) => {
    const h = (_e: unknown, id: string) => cb(id)
    ipcRenderer.on(IPC.ptyExit, h)
    return () => ipcRenderer.removeListener(IPC.ptyExit, h)
  },
}

contextBridge.exposeInMainWorld('cluHost', bridge)

// Tag <html> with the OS so CSS can inset the (hiddenInset) title bar for the
// macOS traffic-light window controls — otherwise tabs overlap them.
window.addEventListener('DOMContentLoaded', () => {
  document.documentElement.dataset.platform = process.platform
})
