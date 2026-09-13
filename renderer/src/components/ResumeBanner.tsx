// R2.2 / ADR-0012 — "Resume last Claude session" affordance. Shown at the top of
// a Tab's terminal pane when the store has a resumable session for it. Running it
// types `claude --resume '<id>'` into the Tab's shell (via the sessions manager,
// keeping the store decoupled from PTYs); the id came from the session's own
// filename, never from user input. Nothing runs until the user clicks.

import { resumeCommand } from '@shared/session/resume'
import { useCockpit, useSessions } from '../store/context'
import { Icon } from './Icons'

export function ResumeBanner(props: { tabId: string; projectPath: string }): React.JSX.Element | null {
  const { tabId } = props
  const sessions = useSessions()
  const sessionId = useCockpit((s) => s.tabs.find((t) => t.id === tabId)?.resumeAvailable)
  const clearResumeAvailable = useCockpit((s) => s.clearResumeAvailable)
  if (!sessionId) return null

  const run = (): void => {
    sessions.write(tabId, resumeCommand(sessionId) + '\r')
    clearResumeAvailable(tabId)
  }

  return (
    <div className="resume-banner" data-testid="resume-banner">
      <Icon name="i-terminal" className="icon icon-sm" />
      <span className="resume-text">Resume last Claude session?</span>
      <button className="btn-primary" data-testid="resume-run" onClick={run}>
        Resume
      </button>
      <button
        className="resume-dismiss"
        data-testid="resume-dismiss"
        aria-label="Dismiss resume"
        onClick={() => clearResumeAvailable(tabId)}
      >
        ×
      </button>
    </div>
  )
}
