// Persisted-state validation (task 3.8) — pure, shared by main's loaders.
// Anything that doesn't validate is treated as corrupt: the caller backs the
// file up as *.broken and falls back to defaults (no data loss, no crash).
// Unknown/newer schemaVersion is corrupt-safe too (migrations are v1.5).

import type { AppState, ProjectState } from './types'
import { SCHEMA_VERSION } from './types'

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string')
}

export function validateProjectState(raw: unknown): ProjectState | null {
  if (!isRecord(raw)) return null
  if (raw.schemaVersion !== SCHEMA_VERSION) return null
  if (typeof raw.name !== 'string') return null
  if (!isStringArray(raw.pinSet)) return null
  if (raw.viewerFile !== null && typeof raw.viewerFile !== 'string') return null
  if (!isStringArray(raw.treeExpansion)) return null
  if (raw.hiddenMode !== 'default' && raw.hiddenMode !== 'dotfiles' && raw.hiddenMode !== 'all')
    return null
  if (!isRecord(raw.splits)) return null
  if (typeof raw.splits.treePct !== 'number' || typeof raw.splits.terminalPct !== 'number')
    return null
  if (raw.gitignoreAnswered !== undefined && typeof raw.gitignoreAnswered !== 'boolean') return null
  return raw as unknown as ProjectState
}

export function validateAppState(raw: unknown): AppState | null {
  if (!isRecord(raw)) return null
  if (raw.schemaVersion !== SCHEMA_VERSION) return null
  if (
    raw.theme !== 'kiro-dark' &&
    raw.theme !== 'tomorrow-night-blue' &&
    raw.theme !== 'solarized-light'
  )
    return null
  if (raw.lastProjectPath !== null && typeof raw.lastProjectPath !== 'string') return null
  return raw as unknown as AppState
}

/** Parse text → validated state; null means "treat as corrupt". */
export function parseProjectState(text: string): ProjectState | null {
  try {
    return validateProjectState(JSON.parse(text))
  } catch {
    return null
  }
}

export function parseAppState(text: string): AppState | null {
  try {
    return validateAppState(JSON.parse(text))
  } catch {
    return null
  }
}
