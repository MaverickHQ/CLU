// R2.2b — pure selection over the session listing (ADR-0012). The Host returns
// every *.jsonl session for a project; these functions choose the resume
// candidate and check that a captured one still exists. No I/O here.
import type { SessionFile } from '../host'

const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** The newest session by mtime, or null. When `sinceMs` is given, only sessions
 *  last touched at/after it count — used at close to pick the session that ran
 *  during this Tab's lifetime (not a stale or foreign one). Non-UUID names are
 *  ignored so stray files in the transcript dir can't be offered. */
export function pickLatestSession(files: SessionFile[], sinceMs?: number): string | null {
  let best: SessionFile | null = null
  for (const f of files) {
    if (!SESSION_ID.test(f.id)) continue
    if (sinceMs !== undefined && f.mtimeMs < sinceMs) continue
    if (!best || f.mtimeMs > best.mtimeMs) best = f
  }
  return best?.id ?? null
}

/** True when a previously captured session id is still present on disk. */
export function sessionExists(files: SessionFile[], id: string): boolean {
  return files.some((f) => f.id === id)
}
