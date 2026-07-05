// File-watch pure logic (task 3.7): event batching. The ignore list is the
// single canonical set in shared/ignores.ts (F2) — re-exported here for the
// watcher's existing importers.

import type { FsEvent } from './host'
import { IGNORED_DIRS, isIgnoredPath } from './ignores'

/** @deprecated use IGNORED_DIRS from ./ignores — kept for back-compat. */
export const WATCH_IGNORED = IGNORED_DIRS
export { isIgnoredPath }

export interface EventBatcher {
  push(event: FsEvent): void
  dispose(): void
}

/** Coalesce a burst of events into one emit after `delayMs` of quiet. */
export function createEventBatcher(
  emit: (events: FsEvent[]) => void,
  delayMs = 100,
): EventBatcher {
  let buf: FsEvent[] = []
  let timer: ReturnType<typeof setTimeout> | null = null

  return {
    push(event: FsEvent) {
      buf.push(event)
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        timer = null
        const batch = buf
        buf = []
        emit(batch)
      }, delayMs)
    },
    dispose() {
      if (timer) clearTimeout(timer)
      buf = []
    },
  }
}
