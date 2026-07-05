// Close-confirm dialogs per docs/mockups/close-confirm-v1.html: warn severity
// bar, plain-English body, "Don't ask again" pref, Cancel as the safe default,
// destructive action explicit. Single-tab (⌘W) and aggregate quit (⌘Q) forms.

import { useCockpit, useSessions } from '../store/context'
import { Icon } from './Icons'

export function ConfirmClose(): React.JSX.Element | null {
  const pending = useCockpit((s) => s.pendingClose)
  const tabs = useCockpit((s) => s.tabs)
  const confirm = useCockpit((s) => s.confirmPendingClose)
  const cancel = useCockpit((s) => s.cancelPendingClose)
  const setDontAskCloseTab = useCockpit((s) => s.setDontAskCloseTab)
  const setDontAskQuit = useCockpit((s) => s.setDontAskQuit)
  const sessions = useSessions()

  if (!pending) return null

  const isQuit = pending.kind === 'quit'
  const tab = !isQuit ? tabs.find((t) => t.id === pending.tabId) : undefined
  const liveTabs = tabs.filter((t) => sessions.has(t.id))

  return (
    <div className="modal-backdrop" data-testid="confirm-close">
      <div className="modal" role="dialog" aria-modal="true">
        <div className="severity-bar" />
        <div className="modal-inner">
          <div className="modal-title">
            <Icon name="i-terminal" className="icon icon-warn" />
            <span>{isQuit ? 'Quit CLU?' : 'Close this tab?'}</span>
          </div>
          <div className="modal-body">
            {isQuit ? (
              <>
                <strong>
                  {liveTabs.length} tab{liveTabs.length === 1 ? '' : 's'}
                </strong>{' '}
                {liveTabs.length === 1 ? 'has' : 'have'} active terminal sessions:
                <ul>
                  {liveTabs.map((t) => (
                    <li key={t.id}>
                      <strong>{t.name}</strong>
                    </li>
                  ))}
                </ul>
                Quitting kills all shells. PinSets and viewer state are saved.
              </>
            ) : (
              <>
                <strong>{tab?.name ?? 'This tab'}</strong> has an active terminal session. Closing
                the tab ends it — PinSet and viewer state are saved, the shell is not.
              </>
            )}
          </div>
          <div className="modal-actions">
            <label className="pref">
              <input
                type="checkbox"
                onChange={(e) =>
                  isQuit ? setDontAskQuit(e.target.checked) : setDontAskCloseTab(e.target.checked)
                }
              />
              Don't ask again
            </label>
            <button className="btn-cancel" onClick={cancel} autoFocus>
              Cancel
            </button>
            <button className="btn-danger" onClick={() => void confirm()}>
              {isQuit ? 'Quit anyway' : 'Close tab'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
