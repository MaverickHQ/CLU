// Fallback $CLU_FILES delivery for shells without baked init (ADR-0007): type
// the export into the PTY, but only at a quiet moment — never while output is
// streaming or (heuristically) while the user is mid-keystroke. Latest request
// wins; superseded ones are dropped (the env state is absolute, not a delta).

export interface QuietEmitter {
  /** Call with every PTY output AND every user keystroke. */
  notifyActivity(): void
  /** Queue `command` to be typed (with \r) at the next quiet moment. */
  send(command: string): void
  dispose(): void
}

export function createQuietEmitter(deps: {
  write: (data: string) => void
  quietMs?: number
  pollMs?: number
}): QuietEmitter {
  const quietMs = deps.quietMs ?? 500
  const pollMs = deps.pollMs ?? 250
  let lastActivity = Date.now()
  let pendingCommand: string | null = null
  let timer: ReturnType<typeof setInterval> | null = null

  function tick(): void {
    if (pendingCommand === null) return
    if (Date.now() - lastActivity >= quietMs) {
      deps.write(`${pendingCommand}\r`)
      pendingCommand = null
      stop()
    }
  }

  function stop(): void {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
  }

  return {
    notifyActivity() {
      lastActivity = Date.now()
    },
    send(command: string) {
      pendingCommand = command // latest wins
      if (!timer) timer = setInterval(tick, pollMs)
    },
    dispose: stop,
  }
}
