import { app, BrowserWindow, ipcMain, Menu, shell } from 'electron'
import { join } from 'node:path'
import { IPC } from '@shared/ipc'
import { shouldAllowNavigation } from '@shared/navGuard'
import { registerHostIpc } from './host'
import { createQuitController } from './quit'

// Product name: fixes the macOS menu-bar title + About panel (was "Electron").
// Must run before whenReady/menu build. The dev *dock* icon still reads
// "Electron" (that's the unpackaged Electron.app bundle) — a packaged build
// picks up productName from package.json for the dock too.
app.setName('CLU')
app.setAboutPanelOptions({ applicationName: 'CLU' })

/** Standard macOS application menu, whose first item shows the app name and
 *  which provides the Edit roles (copy/paste) a terminal app needs. Only set
 *  on macOS; Windows/Linux keep Electron's default menu. */
function installAppMenu(): void {
  if (process.platform !== 'darwin') return
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [{ role: 'reload' }, { role: 'toggleDevTools' }, { role: 'togglefullscreen' }],
    },
    { role: 'window', submenu: [{ role: 'minimize' }, { role: 'zoom' }, { role: 'close' }] },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

// Built as CommonJS (see electron.vite.config.ts), so __dirname is available.

let mainWindow: BrowserWindow | null = null

// Distinguishes "user closed the window" (stay resident on macOS — correct dock
// behaviour) from "user chose Quit / app.quit()" (must actually exit). Set in
// before-quit; without it the window-close veto below cancels app.quit() and
// window-all-closed never re-completes it, so Cmd-Q (and Playwright's
// app.close(), which calls app.quit()) would hang the process alive forever.
let isQuitting = false

// Registered ONCE below (not per-window) so macOS re-activation can't
// accumulate handlers that close destroyed windows (C1).
const quit = createQuitController({ quitRequestChannel: IPC.quitRequest })

// Single-instance app (ADR-0003). A second launch focuses the existing window.
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) app.quit()

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#1a1b26', // kiro-dark --bg-base; avoids white flash
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      // node-pty is a native module; preload/renderer access requires
      // sandbox off (accepted trade-off for an embedded-terminal app).
      sandbox: false,
    },
  })
  mainWindow = win

  win.on('ready-to-show', () => {
    win.show()
    console.log('[clu] window ready') // launch smoke marker for e2e
  })

  // Navigation hardening (S1): with sandbox:false, never let the renderer
  // navigate away to foreign content that would inherit the cluHost bridge.
  // Links open in the OS browser; window.open is denied.
  win.webContents.on('will-navigate', (e, url) => {
    if (!shouldAllowNavigation(url, win.webContents.getURL())) {
      e.preventDefault()
      if (/^https?:/.test(url)) void shell.openExternal(url)
    }
  })
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })

  // Quit handshake: intercept close, let the renderer flush + confirm. The
  // controller (module-scoped) vetoes until confirm() or a force-quit timeout.
  win.on('close', (e) => {
    if (!quit.onClose(win)) e.preventDefault()
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  }
})

// Single quitConfirm handler for the app lifetime (not per-window).
ipcMain.on(IPC.quitConfirm, () => quit.confirm())

let disposeHost: (() => void) | null = null

app.whenReady().then(() => {
  installAppMenu()
  disposeHost = registerHostIpc(() => mainWindow)
  createWindow()
  app.on('activate', () => {
    // Never resurrect a window mid-quit (else window-all-closed can't fire and
    // the app hangs alive) — only re-open on a genuine dock re-activation.
    if (!isQuitting && BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Teardown: kill PTYs + watchers before quit (C6). before-quit covers ⌘Q and
// app.quit(); on macOS the window can close without quitting, so also tear
// down PTYs/watchers when the last window is gone and we're not quitting.
app.on('before-quit', () => {
  isQuitting = true
  disposeHost?.()
})

app.on('window-all-closed', () => {
  disposeHost?.()
  // Quit on non-macOS always; on macOS quit only when an actual quit is in
  // progress (Cmd-Q / app.quit()). A plain window close stays resident in the
  // dock. The re-issued app.quit() completes the sequence the close-veto halted.
  if (isQuitting || process.platform !== 'darwin') app.quit()
})
