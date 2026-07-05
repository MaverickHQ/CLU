// First-open gitignore prompt per docs/mockups/gitignore-prompt-v1.html.
// Non-blocking toast, bottom-right. Yes appends the .clu entries; No persists
// the answer; Skip dismisses for this session only (re-prompts next launch).

import { useEffect, useState } from 'react'
import { useCockpit, useHost } from '../store/context'
import type { TabRuntime } from '../store/cockpit'

const GITIGNORE_BLOCK = '\n# CLU per-project state (see ADR-0001)\n.clu/state.json\n.clu/sessions/\n'

export function GitignoreToast(props: { tab: TabRuntime }): React.JSX.Element | null {
  const { tab } = props
  const host = useHost()
  const setGitignoreAnswered = useCockpit((s) => s.setGitignoreAnswered)
  const [isGitRepo, setIsGitRepo] = useState(false)
  const [skipped, setSkipped] = useState(false)

  useEffect(() => {
    setSkipped(false)
    if (tab.missing || tab.gitignoreAnswered) return
    void host.gitStatus(tab.projectPath).then((raw) => setIsGitRepo(raw !== null))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab.projectPath])

  if (tab.missing || tab.gitignoreAnswered || skipped || !isGitRepo) return null

  async function onYes(): Promise<void> {
    const gitignorePath = `${tab.projectPath.replace(/\/+$/, '')}/.gitignore`
    let existing = ''
    try {
      existing = (await host.readFile(gitignorePath)).content
    } catch {
      // no .gitignore yet — create it
    }
    if (!existing.includes('.clu/state.json')) {
      await host.writeFile(gitignorePath, existing + GITIGNORE_BLOCK)
    }
    setGitignoreAnswered(tab.id)
  }

  return (
    <div className="gitignore-toast" data-testid="gitignore-toast">
      <div className="toast-title">Add CLU's files to .gitignore?</div>
      <div className="toast-body">
        CLU stores project state in <code>.clu/</code>. Most users keep it out of version control.
      </div>
      <div className="toast-actions">
        <button className="btn-ghost" onClick={() => setSkipped(true)}>
          Skip
        </button>
        <button className="btn-plain" onClick={() => setGitignoreAnswered(tab.id)}>
          No, commit it
        </button>
        <button className="btn-primary" onClick={() => void onYes()}>
          Yes (recommended)
        </button>
      </div>
    </div>
  )
}
