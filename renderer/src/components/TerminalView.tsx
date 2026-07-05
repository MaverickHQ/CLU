// xterm.js terminal for one Tab. The PTY lives in the sessions manager (not
// here) so it survives unmounts; this component is just the view: it ensures
// the PTY exists, pipes keystrokes in and PTY data out, and fits on resize.

import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { useCockpit, useSessions } from '../store/context'
import { Icon } from './Icons'

const TERMINAL_FONT = "'JetBrains Mono', 'SF Mono', 'Menlo', 'Consolas', monospace"

export function TerminalView(props: {
  tabId: string
  projectPath: string
  visible: boolean
}): React.JSX.Element {
  const { tabId, projectPath, visible } = props
  const sessions = useSessions()
  const shellExited = useCockpit(
    (s) => s.tabs.find((t) => t.id === tabId)?.shellExited ?? false,
  )
  const clearShellExited = useCockpit((s) => s.clearShellExited)
  const closeTab = useCockpit((s) => s.closeTab)
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    sessions.ensure({ id: tabId, projectPath })

    const term = new Terminal({
      fontFamily: TERMINAL_FONT,
      fontSize: 12,
      cursorBlink: true,
      scrollback: 10_000,
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(el)

    const safeFit = (): void => {
      try {
        fit.fit()
        sessions.resize(tabId, term.cols, term.rows)
      } catch {
        // jsdom / zero-size containers can't measure — fine, resize is cosmetic
      }
    }
    safeFit()

    const offData = sessions.onData(tabId, (data) => term.write(data))
    const offKeys = term.onData((data) => sessions.write(tabId, data))
    const onWindowResize = (): void => safeFit()
    window.addEventListener('resize', onWindowResize)

    return () => {
      window.removeEventListener('resize', onWindowResize)
      offData()
      offKeys.dispose()
      term.dispose() // the PTY itself survives — sessions owns it
    }
  }, [sessions, tabId, projectPath])

  // Refit when this terminal becomes visible (hidden panes measure as 0×0).
  useEffect(() => {
    if (visible) window.dispatchEvent(new Event('resize'))
  }, [visible])

  return (
    <div className="terminal-view" style={{ display: visible ? 'block' : 'none', height: '100%' }}>
      <div ref={containerRef} data-testid={`xterm-${tabId}`} style={{ height: '100%' }} />
      {shellExited && (
        <div className="shell-exited-overlay" data-testid="shell-exited">
          <Icon name="i-terminal" className="icon" />
          <div className="title">Shell process exited</div>
          <div className="actions">
            <button className="btn-ghost" onClick={() => void closeTab(tabId)}>
              Close tab
            </button>
            <button
              className="btn-restart"
              onClick={() => {
                sessions.restart({ id: tabId, projectPath })
                clearShellExited(tabId)
              }}
            >
              Restart shell
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
