// Test/e2e escape hatch (task 3.5c, finding S3). window.__cluStore lets the
// Playwright suite drive the app without native dialogs — but it must NOT ship
// in production, where any renderer script could call openTab() to spawn a
// shell. Gated to dev + explicit e2e builds only.

import type { StoreApi } from 'zustand/vanilla'
import type { CockpitState } from './store/cockpit'

/** True only in `pnpm dev` or an e2e build (VITE_CLU_E2E=1). Never in a
 *  packaged production build. */
export function testHookEnabled(): boolean {
  return Boolean(import.meta.env.DEV) || import.meta.env.VITE_CLU_E2E === '1'
}

/** Install (or, when disabled, deliberately do nothing) the store handle. */
export function installTestHook(
  target: Record<string, unknown>,
  store: StoreApi<CockpitState>,
  enabled: boolean = testHookEnabled(),
): void {
  if (!enabled) return
  target.__cluStore = store
}
