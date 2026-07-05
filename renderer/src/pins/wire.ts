// PinSet wiring (the product differentiator, tasks 3.2 + 3.5):
//  • wireEnvExport — every PinSet/viewer change re-renders <root>/.clu/env.sh
//    (ADR-0005 format) through Host.writeEnvFile; the shell hook picks it up
//    at the next prompt (ADR-0007). Stale pins stay exported until unpinned.
//  • wirePinStaleness — fs deletes mark pinned paths stale; re-creation clears.

import type { StoreApi } from 'zustand/vanilla'
import type { Host, Unsubscribe } from '@shared/host'
import type { CockpitState } from '../store/cockpit'

export function wireEnvExport(store: StoreApi<CockpitState>, host: Host): () => void {
  const lastWritten = new Map<string, string>()

  function sync(state: CockpitState): void {
    for (const tab of state.tabs) {
      if (tab.missing) continue
      const exp = { file: tab.viewerFile, files: tab.pinSet }
      // Dedup by the structured export; main renders env.sh (bash/zsh) and
      // types the fallback for other shells (F4).
      const key = JSON.stringify(exp)
      if (lastWritten.get(tab.projectPath) !== key) {
        lastWritten.set(tab.projectPath, key)
        void host.writeEnvFile(tab.projectPath, exp)
      }
    }
  }

  sync(store.getState())
  return store.subscribe((state, prev) => {
    if (state.tabs !== prev.tabs) sync(state)
  })
}

export function wirePinStaleness(store: StoreApi<CockpitState>, host: Host): () => void {
  const watchers = new Map<string, Unsubscribe>() // tabId → unsubscribe

  function track(state: CockpitState): void {
    const current = new Set(state.tabs.map((t) => t.id))
    for (const [tabId, off] of watchers) {
      if (!current.has(tabId)) {
        off()
        watchers.delete(tabId)
      }
    }
    for (const tab of state.tabs) {
      if (watchers.has(tab.id) || tab.missing) continue
      watchers.set(
        tab.id,
        host.watchDir(tab.projectPath, (events) => {
          const { tabs, markPinStale, clearPinStale } = store.getState()
          const live = tabs.find((t) => t.id === tab.id)
          if (!live) return
          for (const ev of events) {
            if (!live.pinSet.includes(ev.path)) continue
            if (ev.type === 'unlink') markPinStale(tab.id, ev.path)
            else clearPinStale(tab.id, ev.path)
          }
        }),
      )
    }
  }

  track(store.getState())
  const off = store.subscribe((state, prev) => {
    if (state.tabs !== prev.tabs) track(state)
  })
  return () => {
    off()
    watchers.forEach((offWatch) => offWatch())
    watchers.clear()
  }
}
