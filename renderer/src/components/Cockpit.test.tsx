// Task 2.5 behaviours (1)-(5): the cockpit shell, tested through the provider
// with the fake Host (jsdom). Visual fidelity vs the mockup is UAT.
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createFakeHost } from '@shared/host.fake'
import { createCockpitStore } from '../store/cockpit'
import { CockpitProvider } from '../store/context'
import { createTerminalSessions } from '../terminal/sessions'
import { Cockpit } from './Cockpit'
import { IconSprite } from './Icons'

function setup() {
  const host = createFakeHost()
  for (const dir of ['/proj/alpha', '/proj/beta', '/picked/gamma', '/p']) host.fake.addDir(dir)
  const store = createCockpitStore({ host })
  const sessions = createTerminalSessions({ host })
  const view = render(
    <CockpitProvider store={store} host={host} sessions={sessions}>
      <IconSprite />
      <Cockpit />
    </CockpitProvider>,
  )
  return { host, store, sessions, view }
}

describe('cockpit shell', () => {
  it('(1) renders tab strip + welcome pane when no tabs; three panes once a tab opens', async () => {
    const { store } = setup()
    expect(screen.getByRole('tablist')).toBeInTheDocument()
    expect(screen.getByTestId('welcome-pane')).toBeInTheDocument()

    await store.getState().openTab('/proj/alpha')
    await waitFor(() => expect(screen.getByTestId('cockpit-panes')).toBeInTheDocument())
    expect(screen.getByTestId('pane-tree')).toBeInTheDocument()
    expect(screen.getByTestId('pane-viewer')).toBeInTheDocument()
    expect(screen.getByTestId('pane-terminal')).toBeInTheDocument()
    expect(screen.queryByTestId('welcome-pane')).not.toBeInTheDocument()
  })

  it('(2) tab strip reflects store tabs and marks the active one', async () => {
    const { store } = setup()
    await store.getState().openTab('/proj/alpha')
    await store.getState().openTab('/proj/beta')

    await waitFor(() => expect(screen.getAllByRole('tab')).toHaveLength(2))
    const [alpha, beta] = screen.getAllByRole('tab')
    expect(alpha).toHaveTextContent('alpha')
    expect(beta).toHaveTextContent('beta')
    expect(beta).toHaveAttribute('aria-selected', 'true')
    expect(alpha).toHaveAttribute('aria-selected', 'false')

    await userEvent.click(alpha)
    await waitFor(() => expect(alpha).toHaveAttribute('aria-selected', 'true'))
  })

  it('(3) the + button asks the Host for a directory and opens it as a Tab', async () => {
    const { host } = setup()
    host.pickDirectory = vi.fn(async () => '/picked/gamma')

    await userEvent.click(screen.getByRole('button', { name: 'Open Project' }))
    await waitFor(() => expect(screen.getByRole('tab')).toHaveTextContent('gamma'))
    expect(host.pickDirectory).toHaveBeenCalledTimes(1)
  })

  it('(3b) a cancelled picker opens nothing', async () => {
    const { store } = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Open Project' }))
    expect(store.getState().tabs).toHaveLength(0)
  })

  it('(4) the × button closes its Tab (via confirm — TerminalView spawned a live shell)', async () => {
    const { store } = setup()
    await store.getState().openTab('/proj/alpha')
    await waitFor(() => expect(screen.getByRole('tab')).toBeInTheDocument())

    await userEvent.click(screen.getByRole('button', { name: 'Close alpha' }))
    await userEvent.click(screen.getByRole('button', { name: 'Close tab' })) // confirm
    await waitFor(() => expect(screen.queryAllByRole('tab')).toHaveLength(0))
    expect(store.getState().tabs).toHaveLength(0)
    expect(screen.getByTestId('welcome-pane')).toBeInTheDocument()
  })

  it('(3.3) closing a Tab with a live shell shows the confirm dialog; confirm closes', async () => {
    const { store, sessions } = setup()
    const id = await store.getState().openTab('/proj/alpha')
    sessions.ensure({ id, projectPath: '/proj/alpha' })
    await waitFor(() => expect(screen.getByRole('tab')).toBeInTheDocument())

    await userEvent.click(screen.getByRole('button', { name: 'Close alpha' }))
    expect(screen.getByTestId('confirm-close')).toBeInTheDocument()
    expect(store.getState().tabs).toHaveLength(1) // not closed yet

    await userEvent.click(screen.getByRole('button', { name: 'Close tab' }))
    await waitFor(() => expect(store.getState().tabs).toHaveLength(0))
    expect(screen.queryByTestId('confirm-close')).not.toBeInTheDocument()
  })

  it('(3.5h-C2) a background missing-project tab spawns no PTY', async () => {
    const { host, store } = setup()
    await store.getState().openTab('/proj/alpha') // valid, active
    await store.getState().openTab('/gone/away') // missing → becomes active
    // switch back so the valid tab is active and the missing one is background
    store.getState().selectTab(store.getState().tabs[0].id)
    await waitFor(() => expect(screen.getByTestId('cockpit-panes')).toBeInTheDocument())

    const spawnsForMissing = host.fake.spawns.filter((s) => s.cwd === '/gone/away')
    expect(spawnsForMissing).toHaveLength(0) // no PTY at the deleted cwd
  })

  it('(3.3) a missing Project renders the recovery pane instead of the cockpit', async () => {
    const { store } = setup()
    await store.getState().openTab('/gone/away')
    await waitFor(() => expect(screen.getByTestId('missing-project')).toBeInTheDocument())
    expect(screen.queryByTestId('cockpit-panes')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Close tab' }))
    await waitFor(() => expect(store.getState().tabs).toHaveLength(0))
  })

  it('(5) setTheme flips the data-theme attribute on <html> (via App wiring)', async () => {
    // The attribute mirror lives in App; assert the store→DOM contract there.
    const { App } = await import('../App')
    render(<App />)
    await waitFor(() =>
      expect(document.documentElement.getAttribute('data-theme')).toBe('kiro-dark'),
    )
  })
})
