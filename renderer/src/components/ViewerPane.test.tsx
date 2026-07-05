// Task 3.6 behaviours (3)(5) + placeholders: viewer rendering in jsdom.
// shiki is mocked — the lang/theme routing is the behaviour under test; the
// real highlight output is verified visually in UAT.
import { render, screen, waitFor } from '@testing-library/react'
import { vi } from 'vitest'
import { createFakeHost } from '@shared/host.fake'
import { createCockpitStore } from '../store/cockpit'
import { CockpitProvider, useCockpit } from '../store/context'
import { createTerminalSessions } from '../terminal/sessions'
import { IconSprite } from './Icons'
import { ViewerPane } from './ViewerPane'

vi.mock('shiki', () => ({
  codeToHtml: vi.fn(async (code: string, opts: { lang: string; theme: string }) => {
    return `<pre class="shiki" data-lang="${opts.lang}" data-theme="${opts.theme}"><code>${code}</code></pre>`
  }),
}))

function Harness(props: { tabId: string }): React.JSX.Element | null {
  const tab = useCockpit((s) => s.tabs.find((t) => t.id === props.tabId))
  return tab ? <ViewerPane tab={tab} /> : null
}

async function setup() {
  const host = createFakeHost()
  await host.writeFile(
    '/p/README.md',
    '# Title\n\n| col |\n| --- |\n| cell |\n\n- [ ] a task item\n',
  )
  await host.writeFile('/p/main.ts', 'export const x = 1')
  await host.writeFile('/p/blob.dat', 'binary\0here')
  const store = createCockpitStore({ host })
  const sessions = createTerminalSessions({ host })
  const tabId = await store.getState().openTab('/p')
  render(
    <CockpitProvider store={store} host={host} sessions={sessions}>
      <IconSprite />
      <Harness tabId={tabId} />
    </CockpitProvider>,
  )
  return { host, store, tabId }
}

describe('ViewerPane', () => {
  it('(5) shows the empty state when no file is open', async () => {
    await setup()
    expect(screen.getByTestId('viewer-empty')).toBeInTheDocument()
    expect(screen.getByText(/Select a file in the tree/)).toBeInTheDocument()
  })

  it('(3) renders markdown with GFM tables and task lists', async () => {
    const { store, tabId } = await setup()
    store.getState().setViewerFile(tabId, '/p/README.md')

    await waitFor(() => expect(screen.getByTestId('viewer-markdown')).toBeInTheDocument())
    expect(screen.getByRole('heading', { name: 'Title' })).toBeInTheDocument()
    expect(screen.getByRole('table')).toBeInTheDocument() // GFM table
    expect(screen.getByRole('checkbox')).toBeInTheDocument() // GFM task list
  })

  it('(4) routes code through shiki with the mapped lang + theme', async () => {
    const { store, tabId } = await setup()
    store.getState().setViewerFile(tabId, '/p/main.ts')

    await waitFor(() => expect(screen.getByTestId('viewer-code')).toBeInTheDocument())
    const pre = screen.getByTestId('viewer-code').querySelector('pre.shiki')
    expect(pre).toHaveAttribute('data-lang', 'typescript')
    expect(pre).toHaveAttribute('data-theme', 'tokyo-night') // kiro-dark mapping
  })

  it('(3.7-6) a change to the open file re-renders the new content in place', async () => {
    const { host, store, tabId } = await setup()
    store.getState().setViewerFile(tabId, '/p/README.md')
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Title' })).toBeInTheDocument())

    await host.writeFile('/p/README.md', '# Rewritten by claude\n')
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Rewritten by claude' })).toBeInTheDocument(),
    )
  })

  it('(3.5i-C3) an oversized file shows the too-large panel without reading content', async () => {
    const { host, store, tabId } = await setup()
    host.fake.setOversize('/p/huge.bin', 3_000_000_000) // 3 GB — main would OOM
    store.getState().setViewerFile(tabId, '/p/huge.bin')
    await waitFor(() => expect(screen.getByTestId('viewer-too-large')).toBeInTheDocument())
  })

  it('(2) binary files get the placeholder, not a render attempt', async () => {
    const { store, tabId } = await setup()
    store.getState().setViewerFile(tabId, '/p/blob.dat')
    await waitFor(() => expect(screen.getByTestId('viewer-binary')).toBeInTheDocument())
  })
})
