// R2.1j — Tab status dot reflects the detected Claude state.
import { render, screen } from '@testing-library/react'
import { createFakeHost } from '@shared/host.fake'
import { createCockpitStore } from '../store/cockpit'
import { CockpitProvider } from '../store/context'
import { createTerminalSessions } from '../terminal/sessions'
import { IconSprite } from './Icons'
import { TabStrip } from './TabStrip'

function makeCtx() {
  const host = createFakeHost()
  host.pathExists = async () => true
  const store = createCockpitStore({ host })
  const sessions = createTerminalSessions({ host })
  return { host, store, sessions }
}

function renderStrip(ctx: ReturnType<typeof makeCtx>) {
  return render(
    <CockpitProvider store={ctx.store} host={ctx.host} sessions={ctx.sessions}>
      <IconSprite />
      <TabStrip />
    </CockpitProvider>,
  )
}

describe('TabStrip status dot (R2.1j)', () => {
  it('renders a dot with the state class + aria-label', async () => {
    const ctx = makeCtx()
    const id = await ctx.store.getState().openTab('/proj/a')
    ctx.store.getState().setAgentState(id, 'blocked')
    renderStrip(ctx)
    const dot = screen.getByTestId(`tab-status-${id}`)
    expect(dot).toHaveClass('tab-status-blocked')
    expect(dot).toHaveAttribute('aria-label', 'Claude blocked')
  })

  it('shows no dot for unset / unknown state', async () => {
    const ctx = makeCtx()
    const id = await ctx.store.getState().openTab('/proj/a')
    renderStrip(ctx)
    expect(screen.queryByTestId(`tab-status-${id}`)).toBeNull()
    ctx.store.getState().setAgentState(id, 'unknown')
    expect(screen.queryByTestId(`tab-status-${id}`)).toBeNull()
  })
})
