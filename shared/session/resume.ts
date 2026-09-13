// R2.2 — the shell command that reconnects a Tab to its saved Claude session
// (ADR-0012). Typed into the Tab's PTY on the resume affordance click.
import { posixQuote } from '../shellQuote'

/** `claude --resume '<id>'` — id POSIX-quoted (defensive; ids are UUIDs). */
export function resumeCommand(sessionId: string): string {
  return `claude --resume ${posixQuote(sessionId)}`
}
