// R2.2g — the "Resume last Claude session" banner: shows only when the Tab has
// a resumable session, runs `claude --resume '<id>'` into the PTY on click, and
// clears on run/dismiss.
import { fireEvent, render, screen } from '@testing-library/react'
import { createFakeHost } from '@shared/host.fake'
import { createCockpitStore } from '../store/cockpit'
import { CockpitProvider } from '../store/context'
import { createTerminalSessions } from '../terminal/sessions'
import { IconSprite } from './Icons'
import { ResumeBanner } from './ResumeBanner'

const SID = '22222222-2222-4222-8222-222222222222'

function makeCtx() {
  const host = createFakeHost()
  host.pathExists = async () => true
  const store = createCockpitStore({ host })
  const sessions = createTerminalSessions({ host })
  return { host, store, sessions }
}

function renderBanner(ctx: ReturnType<typeof makeCtx>, tabId: string, projectPath: string) {
  return render(
    <CockpitProvider store={ctx.store} host={ctx.host} sessions={ctx.sessions}>
      <IconSprite />
      <ResumeBanner tabId={tabId} projectPath={projectPath} />
    </CockpitProvider>,
  )
}

function offerResume(ctx: ReturnType<typeof makeCtx>, tabId: string): void {
  ctx.store.setState({
    tabs: ctx.store.getState().tabs.map((t) => (t.id === tabId ? { ...t, resumeAvailable: SID } : t)),
  })
}

describe('ResumeBanner (R2.2g)', () => {
  it('does not render when the Tab has no resumable session', async () => {
    const ctx = makeCtx()
    const id = await ctx.store.getState().openTab('/proj/a')
    renderBanner(ctx, id, '/proj/a')
    expect(screen.queryByTestId('resume-banner')).toBeNull()
  })

  it('renders when a session is offered and runs `claude --resume` into the PTY', async () => {
    const ctx = makeCtx()
    const id = await ctx.store.getState().openTab('/proj/a')
    ctx.sessions.ensure({ id, projectPath: '/proj/a' }) // spawn the PTY so write lands
    offerResume(ctx, id)
    renderBanner(ctx, id, '/proj/a')

    expect(screen.getByTestId('resume-banner')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('resume-run'))

    expect(ctx.host.fake.writes).toHaveLength(1)
    expect(ctx.host.fake.writes[0].data).toBe(`claude --resume '${SID}'\r`)
    // one-shot: the offer clears, banner disappears
    expect(ctx.store.getState().tabs[0].resumeAvailable).toBeUndefined()
    expect(screen.queryByTestId('resume-banner')).toBeNull()
  })

  it('dismiss clears the offer without writing to the PTY', async () => {
    const ctx = makeCtx()
    const id = await ctx.store.getState().openTab('/proj/a')
    ctx.sessions.ensure({ id, projectPath: '/proj/a' })
    offerResume(ctx, id)
    renderBanner(ctx, id, '/proj/a')

    fireEvent.click(screen.getByTestId('resume-dismiss'))
    expect(ctx.host.fake.writes).toHaveLength(0)
    expect(ctx.store.getState().tabs[0].resumeAvailable).toBeUndefined()
    expect(screen.queryByTestId('resume-banner')).toBeNull()
  })
})
