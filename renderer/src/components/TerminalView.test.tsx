// Task 3.1 component behaviours: the terminal view mounts xterm, ensures its
// Tab's PTY exactly once, and shows the shell-exited overlay (error-state E).
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createFakeHost } from '@shared/host.fake'
import { createCockpitStore } from '../store/cockpit'
import { CockpitProvider } from '../store/context'
import { createTerminalSessions } from '../terminal/sessions'
import { wireTerminals } from '../terminal/wire'
import { IconSprite } from './Icons'
import { TerminalView } from './TerminalView'

function setup(tabId = 'tab-1', projectPath = '/proj/alpha') {
  const host = createFakeHost()
  const store = createCockpitStore({ host })
  const sessions = createTerminalSessions({ host })
  wireTerminals(store, sessions)
  const view = render(
    <CockpitProvider store={store} host={host} sessions={sessions}>
      <IconSprite />
      <TerminalView tabId={tabId} projectPath={projectPath} visible={true} />
    </CockpitProvider>,
  )
  return { host, store, sessions, view }
}

describe('TerminalView', () => {
  it('mounts xterm and ensures the Tab PTY exactly once', () => {
    const { host } = setup()
    expect(screen.getByTestId('xterm-tab-1').querySelector('.xterm')).toBeTruthy()
    expect(host.fake.spawns).toHaveLength(1)
    expect(host.fake.spawns[0].cwd).toBe('/proj/alpha')
  })

  it('shows the shell-exited overlay when the Tab shellExited flag is set, and restart respawns', async () => {
    const host = createFakeHost()
    const store = createCockpitStore({ host })
    const sessions = createTerminalSessions({ host })
    wireTerminals(store, sessions)
    const tabId = await store.getState().openTab('/proj/alpha')

    render(
      <CockpitProvider store={store} host={host} sessions={sessions}>
        <IconSprite />
        <TerminalView tabId={tabId} projectPath="/proj/alpha" visible={true} />
      </CockpitProvider>,
    )
    expect(screen.queryByTestId('shell-exited')).not.toBeInTheDocument()

    host.fake.emitPtyExit(host.fake.spawns.length === 1 ? 'fake-pty-1' : 'fake-pty-2')
    await waitFor(() => expect(screen.getByTestId('shell-exited')).toBeInTheDocument())

    await userEvent.click(screen.getByRole('button', { name: 'Restart shell' }))
    await waitFor(() => expect(screen.queryByTestId('shell-exited')).not.toBeInTheDocument())
    expect(host.fake.spawns.length).toBeGreaterThanOrEqual(2)
  })
})
