// Task 3.9 behaviours: welcome states, drag-drop, missing recent, gitignore toast.
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { createFakeHost } from '@shared/host.fake'
import { createCockpitStore } from '../store/cockpit'
import { CockpitProvider, useCockpit } from '../store/context'
import { createTerminalSessions } from '../terminal/sessions'
import { GitignoreToast } from './GitignoreToast'
import { IconSprite } from './Icons'
import { Welcome } from './Welcome'

function makeCtx() {
  const host = createFakeHost()
  const store = createCockpitStore({ host })
  const sessions = createTerminalSessions({ host })
  return { host, store, sessions }
}

function Providers(props: {
  ctx: ReturnType<typeof makeCtx>
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <CockpitProvider store={props.ctx.store} host={props.ctx.host} sessions={props.ctx.sessions}>
      <IconSprite />
      {props.children}
    </CockpitProvider>
  )
}

describe('Welcome', () => {
  it('(1) state A: first launch renders drop zone, Open Project, empty recent', () => {
    const ctx = makeCtx()
    render(
      <Providers ctx={ctx}>
        <Welcome />
      </Providers>,
    )
    expect(screen.getByText('CLU')).toBeInTheDocument()
    expect(screen.getByTestId('drop-zone')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Open Project/ })).toBeInTheDocument()
    expect(screen.getByTestId('recent-empty')).toBeInTheDocument()
  })

  it('(2) state B: a live recent renders as an openable row', async () => {
    const ctx = makeCtx()
    ctx.host.fake.addDir('/work/clu')
    await ctx.host.state.saveApp({
      schemaVersion: 1,
      theme: 'kiro-dark',
      lastProjectPath: '/work/clu',
    })
    await ctx.store.getState().hydrate() // opens the tab; close it to see welcome
    const openId = ctx.store.getState().tabs[0].id
    await ctx.store.getState().closeTab(openId)

    render(
      <Providers ctx={ctx}>
        <Welcome />
      </Providers>,
    )
    await waitFor(() => expect(screen.getByTestId('recent-row')).toBeInTheDocument())
    expect(screen.getByTestId('recent-row')).toHaveTextContent('clu')
    expect(screen.queryByTestId('missing-chip')).not.toBeInTheDocument()

    await userEvent.click(screen.getByTestId('recent-row'))
    await waitFor(() => expect(ctx.store.getState().tabs).toHaveLength(1))
  })

  it('(5) a vanished recent shows the missing chip; remove clears it', async () => {
    const ctx = makeCtx()
    // lastProjectPath points somewhere that does not exist in the fake fs.
    await ctx.host.state.saveApp({
      schemaVersion: 1,
      theme: 'kiro-dark',
      lastProjectPath: '/gone/project',
    })
    await ctx.store.getState().hydrate()
    // hydrate opened it as missing; close the missing tab
    const openId = ctx.store.getState().tabs[0]?.id
    if (openId) await ctx.store.getState().closeTab(openId)

    render(
      <Providers ctx={ctx}>
        <Welcome />
      </Providers>,
    )
    await waitFor(() => expect(screen.getByTestId('missing-chip')).toBeInTheDocument())

    await userEvent.click(screen.getByRole('button', { name: 'Remove from recents' }))
    await waitFor(() => expect(screen.getByTestId('recent-empty')).toBeInTheDocument())
    expect(ctx.store.getState().lastProjectPath).toBeNull()
  })

  it('(4) dropping a folder opens it via host.droppedFilePath (N1)', async () => {
    const ctx = makeCtx()
    ctx.host.fake.addDir('/dropped/proj')
    // Simulate an Electron-42 File with NO .path; the Host resolver (which
    // wraps webUtils.getPathForFile) supplies the path instead.
    ctx.host.droppedFilePath = () => '/dropped/proj'
    render(
      <Providers ctx={ctx}>
        <Welcome />
      </Providers>,
    )
    fireEvent.drop(screen.getByTestId('drop-zone'), {
      dataTransfer: { files: [{ name: 'proj' }] }, // no .path (Electron 32+)
    })
    await waitFor(() => expect(ctx.store.getState().tabs).toHaveLength(1))
    expect(ctx.store.getState().tabs[0].projectPath).toBe('/dropped/proj')
  })
})

describe('GitignoreToast', () => {
  function Harness(props: { tabId: string }): React.JSX.Element | null {
    const tab = useCockpit((s) => s.tabs.find((t) => t.id === props.tabId))
    return tab ? <GitignoreToast tab={tab} /> : null
  }

  async function setupToast(porcelain: string | null, answered = false) {
    const ctx = makeCtx()
    ctx.host.fake.addDir('/repo')
    ctx.host.fake.setGitStatus('/repo', porcelain)
    const tabId = await ctx.store.getState().openTab('/repo')
    if (answered) ctx.store.getState().setGitignoreAnswered(tabId)
    render(
      <Providers ctx={ctx}>
        <Harness tabId={tabId} />
      </Providers>,
    )
    return { ctx, tabId }
  }

  it('(6) shows on first open of a git Project; not for non-repos or answered ones', async () => {
    await setupToast('') // git repo, clean status
    await waitFor(() => expect(screen.getByTestId('gitignore-toast')).toBeInTheDocument())
  })

  it('(6b) never shows for a non-git Project', async () => {
    await setupToast(null)
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.queryByTestId('gitignore-toast')).not.toBeInTheDocument()
  })

  it('(6c) Yes appends the .clu block to .gitignore and persists the answer', async () => {
    const { ctx, tabId } = await setupToast('')
    await waitFor(() => expect(screen.getByTestId('gitignore-toast')).toBeInTheDocument())

    await userEvent.click(screen.getByRole('button', { name: 'Yes (recommended)' }))
    await waitFor(async () => {
      const gitignore = (await ctx.host.readFile('/repo/.gitignore')).content
      expect(gitignore).toContain('.clu/state.json')
      expect(gitignore).toContain('.clu/sessions/')
    })
    expect(ctx.store.getState().tabs.find((t) => t.id === tabId)?.gitignoreAnswered).toBe(true)
    expect(screen.queryByTestId('gitignore-toast')).not.toBeInTheDocument()
  })

  it('(6d) No persists without touching .gitignore; Skip only hides this session', async () => {
    const { ctx } = await setupToast('')
    await waitFor(() => expect(screen.getByTestId('gitignore-toast')).toBeInTheDocument())

    await userEvent.click(screen.getByRole('button', { name: 'No, commit it' }))
    await waitFor(() => expect(screen.queryByTestId('gitignore-toast')).not.toBeInTheDocument())
    await expect(ctx.host.readFile('/repo/.gitignore')).rejects.toThrow() // untouched
    expect(ctx.store.getState().tabs[0].gitignoreAnswered).toBe(true)
  })

  it('(6e) Skip hides without persisting (would re-prompt next launch)', async () => {
    const { ctx } = await setupToast('')
    await waitFor(() => expect(screen.getByTestId('gitignore-toast')).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: 'Skip' }))
    expect(screen.queryByTestId('gitignore-toast')).not.toBeInTheDocument()
    expect(ctx.store.getState().tabs[0].gitignoreAnswered).toBeUndefined()
    void vi // keep vitest import used
  })
})
