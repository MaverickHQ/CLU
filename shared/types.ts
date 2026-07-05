// Shared types between main and renderer. Kept free of Electron/Node imports so
// both processes (and tests) can use them. Domain vocabulary per CONTEXT.md.

export type TabId = string

export type ThemeName = 'kiro-dark' | 'tomorrow-night-blue' | 'solarized-light'

/** File-tree visibility cycle (design doc: `.` key cycles these). */
export type HiddenMode = 'default' | 'dotfiles' | 'all'

/** Advance the hidden-file cycle: default → dotfiles → all → default. Single
 *  source of truth for both the tree model and the store (3.6h). */
export function cycleHiddenMode(mode: HiddenMode): HiddenMode {
  return mode === 'default' ? 'dotfiles' : mode === 'dotfiles' ? 'all' : 'default'
}

/** Pane split positions as percentages (persisted per Project). */
export interface SplitLayout {
  /** Width of the tree pane as % of the window. */
  treePct: number
  /** Height of the terminal pane as % of the window. */
  terminalPct: number
}

/**
 * Persisted per-Project state — lives at `<project-root>/.clu/state.json`
 * (ADR-0001). PinSet order is insertion order (ADR-0005).
 */
export interface ProjectState {
  schemaVersion: number
  /** Custom Tab name; defaults to the directory basename. */
  name: string
  pinSet: string[]
  viewerFile: string | null
  treeExpansion: string[]
  hiddenMode: HiddenMode
  splits: SplitLayout
  /** First-open gitignore prompt answered (Yes/No persist; Skip doesn't). */
  gitignoreAnswered?: boolean
}

/**
 * Persisted app-level state — window-independent preferences plus the
 * last-opened Project (restored on launch; a global multi-project index is
 * out of scope for v1).
 */
export interface AppState {
  schemaVersion: number
  theme: ThemeName
  lastProjectPath: string | null
  /** Close-confirm "don't ask again" prefs (per-action, close-confirm mockup). */
  dontAskCloseTab?: boolean
  dontAskQuit?: boolean
}

export const SCHEMA_VERSION = 1

export function defaultProjectState(name: string): ProjectState {
  return {
    schemaVersion: SCHEMA_VERSION,
    name,
    pinSet: [],
    viewerFile: null,
    treeExpansion: [],
    hiddenMode: 'default',
    splits: { treePct: 25, terminalPct: 35 },
  }
}

export function defaultAppState(): AppState {
  return { schemaVersion: SCHEMA_VERSION, theme: 'kiro-dark', lastProjectPath: null }
}
