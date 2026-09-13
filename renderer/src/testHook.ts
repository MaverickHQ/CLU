// Test/e2e escape hatch (task 3.5c, finding S3). window.__cluStore lets the
// Playwright suite drive the app without native dialogs — but it must NOT ship
// in production, where any renderer script could call openTab() to spawn a
// shell. Gated to dev + explicit e2e builds only.
//
// R2.1: also installs window.__cluForceState, a console helper for eyeballing
// agent-status dots + notifications during UAT without a live Claude turn.

import type { StoreApi } from 'zustand/vanilla'
import type { AgentState } from '@shared/agentStatus/types'
import type { CockpitState } from './store/cockpit'

/** True only in `pnpm dev` or an e2e build (VITE_CLU_E2E=1). Never in a
 *  packaged production build. */
export function testHookEnabled(): boolean {
  return Boolean(import.meta.env.DEV) || import.meta.env.VITE_CLU_E2E === '1'
}

/** Which Tab to target: undefined = active Tab, a number = Tab index, a string = Tab id. */
type Which = number | string | undefined

export interface ForceState {
  /** Force a Tab's agent state (freezes detection so it sticks). Returns the Tab id. */
  (state: AgentState, which?: Which): string | undefined
  /** Resume real detection (undo the freeze). */
  resume(): void
}

function makeForceState(store: StoreApi<CockpitState>): ForceState {
  const force = ((state: AgentState, which?: Which): string | undefined => {
    const s = store.getState()
    // Freeze the poller so it doesn't clobber the forced state ~400ms later.
    s.setAgentStatusConfig({ enabled: false })
    const tab =
      which === undefined
        ? s.tabs.find((t) => t.id === s.activeTabId)
        : typeof which === 'number'
          ? s.tabs[which]
          : s.tabs.find((t) => t.id === which)
    if (tab) s.setAgentState(tab.id, state)
    return tab?.id
  }) as ForceState
  force.resume = () => store.getState().setAgentStatusConfig({ enabled: true })
  return force
}

/** Install (or, when disabled, deliberately do nothing) the dev/e2e handles. */
export function installTestHook(
  target: Record<string, unknown>,
  store: StoreApi<CockpitState>,
  enabled: boolean = testHookEnabled(),
): void {
  if (!enabled) return
  target.__cluStore = store
  target.__cluForceState = makeForceState(store)
}
