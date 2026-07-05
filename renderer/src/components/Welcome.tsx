// Welcome pane per docs/mockups/welcome-pane-v1.html: state A (first launch)
// and state B (returning user — v1.0's "recents" is the single sticky
// lastProjectPath; the multi-project index is v1.5). Drag-drop a folder or
// pick one; a vanished recent gets the missing chip + remove.

import { useEffect, useState } from 'react'
import { basename } from '@shared/paths'
import { useCockpit, useHost } from '../store/context'
import { Icon } from './Icons'

export function Welcome(): React.JSX.Element {
  const openTab = useCockpit((s) => s.openTab)
  const lastProjectPath = useCockpit((s) => s.lastProjectPath)
  const clearLastProject = useCockpit((s) => s.clearLastProject)
  const host = useHost()
  const [recentMissing, setRecentMissing] = useState(false)

  useEffect(() => {
    if (!lastProjectPath) return
    void host.pathExists(lastProjectPath).then((exists) => setRecentMissing(!exists))
  }, [lastProjectPath, host])

  async function onOpen(): Promise<void> {
    const dir = await host.pickDirectory()
    if (dir) await openTab(dir)
  }

  function onDrop(e: React.DragEvent): void {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (!file) return
    const path = host.droppedFilePath(file) // webUtils.getPathForFile (N1)
    if (path) void openTab(path)
  }

  return (
    <div className="welcome" data-testid="welcome-pane">
      <div className="welcome-card">
        <h1>CLU</h1>
        <p className="tagline">Claude Code, with the right files in front of it.</p>

        <div
          className="drop-zone"
          data-testid="drop-zone"
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDrop}
        >
          <div className="text">Drop a folder here to open a project</div>
          <div className="sub">— or —</div>
          <button className="btn-open" onClick={() => void onOpen()}>
            <Icon name="i-folder" className="icon icon-sm" />
            Open Project…
          </button>
        </div>

        <div className="recent-section">
          <div className="recent-title">Recent</div>
          {lastProjectPath ? (
            <div
              className={`recent-row${recentMissing ? ' missing-row' : ''}`}
              data-testid="recent-row"
              onClick={() => {
                if (!recentMissing) void openTab(lastProjectPath)
              }}
            >
              <Icon name="i-folder" className="icon icon-sm" />
              <span className="name">{basename(lastProjectPath)}</span>
              {recentMissing ? (
                <>
                  <span className="missing-chip" data-testid="missing-chip">
                    missing
                  </span>
                  <button
                    className="remove"
                    aria-label="Remove from recents"
                    onClick={(e) => {
                      e.stopPropagation()
                      clearLastProject()
                    }}
                  >
                    ×
                  </button>
                </>
              ) : (
                <span className="path">{lastProjectPath}</span>
              )}
            </div>
          ) : (
            <div className="recent-empty" data-testid="recent-empty">
              No recent projects yet
            </div>
          )}
        </div>

        <div className="welcome-footer">
          CLI: <code>clu /path/to/project</code>
        </div>
      </div>
    </div>
  )
}
