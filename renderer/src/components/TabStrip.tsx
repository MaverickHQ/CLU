// Tab strip per docs/mockups/cockpit-v1.html: one Tab per Project, + opens the
// native directory picker, × closes (confirm-on-active-session lands in 3.3).

import { useCockpit, useHost, useSessions } from '../store/context'
import { Icon } from './Icons'

export function TabStrip(): React.JSX.Element {
  const tabs = useCockpit((s) => s.tabs)
  const activeTabId = useCockpit((s) => s.activeTabId)
  const selectTab = useCockpit((s) => s.selectTab)
  const requestCloseTab = useCockpit((s) => s.requestCloseTab)
  const openTab = useCockpit((s) => s.openTab)
  const host = useHost()
  const sessions = useSessions()

  async function onNewTab(): Promise<void> {
    const dir = await host.pickDirectory()
    if (dir) await openTab(dir)
  }

  return (
    <div className="tab-strip" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          role="tab"
          aria-selected={tab.id === activeTabId}
          className={tab.id === activeTabId ? 'tab active' : 'tab'}
          onClick={() => selectTab(tab.id)}
        >
          <Icon name="i-folder" className="icon icon-sm" />
          <span>{tab.name}</span>
          <span
            className="close"
            role="button"
            aria-label={`Close ${tab.name}`}
            onClick={(e) => {
              e.stopPropagation()
              requestCloseTab(tab.id, { hasLiveSession: sessions.has(tab.id) })
            }}
          >
            <Icon name="i-x" className="icon icon-xs" />
          </span>
        </button>
      ))}
      <button className="tab-new" aria-label="Open Project" onClick={() => void onNewTab()}>
        <Icon name="i-plus" className="icon icon-sm" />
      </button>
    </div>
  )
}
