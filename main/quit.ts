// Quit coordinator (task 3.5d, finding C1). The bug: ipcMain.on(quitConfirm)
// was registered INSIDE createWindow, so macOS re-activation accumulated
// handlers that closed destroyed windows. Here the handler is registered once
// and delegates to this controller, which also adds the design's force-quit
// timeout so a hung/crashed renderer can't wedge the app forever.
//
// Electron-free (typed against a minimal WindowLike) so it's unit-testable in
// the node project without launching the app.

export interface WindowLike {
  isDestroyed(): boolean
  destroy(): void
  webContents: { send(channel: string): void }
}

export interface QuitController {
  /** Handle a window 'close' event. Returns true to allow the close, false to
   *  veto it (a confirm request has been sent + the force-quit timer armed). */
  onClose(win: WindowLike): boolean
  /** The renderer confirmed: allow the pending close to proceed. */
  confirm(): void
}

export function createQuitController(opts: {
  quitRequestChannel: string
  forceQuitMs?: number
  setTimer?: (fn: () => void, ms: number) => unknown
  clearTimer?: (h: unknown) => void
}): QuitController {
  const forceQuitMs = opts.forceQuitMs ?? 3000
  const setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms))
  const clearTimer = opts.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>))

  let confirmed = false
  let pendingWin: WindowLike | null = null
  let timer: unknown = null

  const forceClose = (): void => {
    confirmed = true
    if (pendingWin && !pendingWin.isDestroyed()) pendingWin.destroy()
  }

  return {
    onClose(win: WindowLike): boolean {
      if (confirmed) return true // second pass: let it close
      pendingWin = win
      if (!win.isDestroyed()) win.webContents.send(opts.quitRequestChannel)
      if (timer) clearTimer(timer)
      timer = setTimer(forceClose, forceQuitMs)
      return false // veto until the renderer confirms (or the timer fires)
    },
    confirm(): void {
      confirmed = true
      if (timer) clearTimer(timer)
      timer = null
      // Guard: never close/destroy a window that's already gone (the C1 crash).
      if (pendingWin && !pendingWin.isDestroyed()) pendingWin.destroy()
    },
  }
}
