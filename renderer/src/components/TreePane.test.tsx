// Task 3.4 behaviours (6)-(8): the tree component over the fake Host.
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createFakeHost } from '@shared/host.fake'
import { createCockpitStore } from '../store/cockpit'
import { CockpitProvider, useCockpit } from '../store/context'
import { createTerminalSessions } from '../terminal/sessions'
import { IconSprite } from './Icons'
import { TreePane } from './TreePane'

/** Subscribes like the real Cockpit does, so store changes re-render the pane. */
function Harness(props: { tabId: string }): React.JSX.Element | null {
  const tab = useCockpit((s) => s.tabs.find((t) => t.id === props.tabId))
  return tab ? <TreePane tab={tab} /> : null
}

async function setup() {
  const host = createFakeHost()
  await host.writeFile('/proj/alpha/README.md', '# readme')
  await host.writeFile('/proj/alpha/src/main.ts', 'export {}')
  await host.writeFile('/proj/alpha/src/util.ts', 'export {}')
  host.fake.setGitStatus('/proj/alpha', ' M src/main.ts\n?? README.md\n')

  const store = createCockpitStore({ host })
  const sessions = createTerminalSessions({ host })
  const tabId = await store.getState().openTab('/proj/alpha')
  const tab = () => store.getState().tabs.find((t) => t.id === tabId)!

  render(
    <CockpitProvider store={store} host={host} sessions={sessions}>
      <IconSprite />
      <Harness tabId={tabId} />
    </CockpitProvider>,
  )
  return { host, store, tabId, tab }
}

describe('TreePane', () => {
  it('(6) renders entries with git decorations (file own status, dir aggregated)', async () => {
    await setup()
    await waitFor(() => expect(screen.getByTestId('tree-row-README.md')).toBeInTheDocument())
    expect(screen.getByTestId('tree-row-README.md')).toHaveTextContent('?')
    // src dir aggregates its modified child
    expect(screen.getByTestId('tree-row-src')).toHaveTextContent('M')
  })

  it('(7) clicking a file opens it in the viewer (setViewerFile)', async () => {
    const { tab } = await setup()
    await waitFor(() => expect(screen.getByTestId('tree-row-README.md')).toBeInTheDocument())
    await userEvent.click(screen.getByTestId('tree-row-README.md'))
    expect(tab().viewerFile).toBe('/proj/alpha/README.md')
  })

  it('(3.7-5) an fs add event refreshes the tree with the new file', async () => {
    const { host } = await setup()
    await waitFor(() => expect(screen.getByTestId('tree-row-README.md')).toBeInTheDocument())

    await host.writeFile('/proj/alpha/NEW-FILE.md', 'fresh') // emits through watchers
    await waitFor(() => expect(screen.getByTestId('tree-row-NEW-FILE.md')).toBeInTheDocument())
  })

  it('(3.5-1/2) Space pins the selected file (glyph + Pinned section); Space again unpins', async () => {
    const { tab } = await setup()
    await waitFor(() => expect(screen.getByTestId('tree-row-README.md')).toBeInTheDocument())

    await userEvent.click(screen.getByTestId('tree-row-README.md')) // select
    await userEvent.keyboard(' ')
    expect(tab().pinSet).toEqual(['/proj/alpha/README.md'])
    expect(screen.getByTestId('pinned-section')).toBeInTheDocument()
    expect(screen.getByTestId('pinned-README.md')).toBeInTheDocument()

    await userEvent.keyboard(' ') // toggle off
    expect(tab().pinSet).toEqual([])
    expect(screen.queryByTestId('pinned-section')).not.toBeInTheDocument()
  })

  it('(3.5-5) a stale pin renders struck-through with the warning mark', async () => {
    const { host, store, tabId } = await setup()
    store.getState().pin(tabId, '/proj/alpha/README.md')
    store.getState().markPinStale(tabId, '/proj/alpha/README.md')
    void host // silence unused in this scenario

    await waitFor(() => expect(screen.getByTestId('pinned-README.md')).toHaveClass('stale'))
    expect(screen.getByTestId('pinned-README.md')).toHaveTextContent('⚠')
  })

  it('(8) clicking a dir expands it (children load + treeExpansion persists)', async () => {
    const { tab } = await setup()
    await waitFor(() => expect(screen.getByTestId('tree-row-src')).toBeInTheDocument())
    await userEvent.click(screen.getByTestId('tree-row-src'))

    await waitFor(() => expect(screen.getByTestId('tree-row-main.ts')).toBeInTheDocument())
    expect(tab().treeExpansion).toContain('/proj/alpha/src')

    await userEvent.click(screen.getByTestId('tree-row-src')) // collapse
    expect(tab().treeExpansion).not.toContain('/proj/alpha/src')
  })
})
