// Layer-1 Host adapter interface (ADR-0002).
//
// The renderer ALWAYS calls host.xxx() — it never imports Electron APIs
// directly. The Electron implementation wires this to IPC; the fake in-memory
// implementation backs fast unit/integration tests. This interface is the
// project's primary testable seam.

import type { EnvExport } from './envFile'
import type { AppState, ProjectState, TabId } from './types'

/** Hard ceiling on a single readFile (task 3.5i / C3). Matches the viewer's
 *  largest limit (50 MB for .log); anything bigger is never loaded into memory. */
export const READ_HARD_MAX = 50 * 1024 * 1024

export interface FsEvent {
  // add/change/unlink are file events; addDir/unlinkDir are directory events
  // (3.6c) — the tree must re-list a parent when a subdirectory appears or is
  // removed, not just when files change.
  type: 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir'
  path: string
}

export interface DirEntry {
  name: string
  isDir: boolean
}

/** Result of `git status` for a Project. `porcelain` is raw repo-root-relative
 *  output; `prefix` is the repo→project path (`git rev-parse --show-prefix`,
 *  e.g. `sub/dir/`, or `''` at the repo root) used to rebase paths onto the
 *  Project root when the Project is a subdirectory of the repo (3.6b). */
export interface GitStatus {
  porcelain: string
  prefix: string
}

export type Unsubscribe = () => void

export interface SpawnPtyOptions {
  shell?: string
  cwd: string
  cols: number
  rows: number
  env?: Record<string, string>
}

export interface Host {
  // --- file I/O
  // `tooLarge` is set (and content empty) when the file exceeds the hard read
  // ceiling — main refuses to load it into memory (task 3.5i / finding C3).
  readFile(absPath: string): Promise<{ content: string; sizeBytes: number; tooLarge?: boolean }>
  writeFile(absPath: string, content: string): Promise<void>
  /** Immediate children of a directory (typed), or [] if none/unreadable. */
  listDir(absPath: string): Promise<DirEntry[]>
  // NB: no delete method — CLU is a read-only viewer; deletion happens in the
  // terminal or via claude. A remove() IPC would be unused attack surface (3.6d).
  watchDir(absPath: string, onEvents: (events: FsEvent[]) => void): Unsubscribe

  /** True when the absolute path exists on disk (missing-project detection). */
  pathExists(absPath: string): Promise<boolean>

  /** Declare a project root the renderer may operate within (confinement, S2). */
  registerRoot(projectPath: string): Promise<void>

  /** Resolve a folder dropped from the OS to an absolute path, or null. */
  droppedFilePath(file: unknown): string | null

  // --- native dialogs
  /** Directory picker; null when the user cancels. */
  pickDirectory(): Promise<string | null>

  // --- app quit handshake (Electron-only; browser/fake may omit)
  /** Main asks the renderer before quitting (window close intercepted). */
  onQuitRequest?(cb: () => void): Unsubscribe
  /** Renderer approves the quit after flushing state. */
  confirmQuit?(): void

  // --- git
  /** Raw `git status --porcelain` output plus the repo→project path prefix, or
   *  null when the directory is not a git repo. Porcelain paths are
   *  repo-root-relative; the prefix rebases them onto the Project root when the
   *  Project is a subdirectory of the repo (3.6b). Parsing is a pure fn. */
  gitStatus(projectPath: string): Promise<GitStatus | null>

  // --- $CLU_FILES export (ADR-0007). Main renders env.sh for bash/zsh AND,
  //     for non-integrated shells, types the fallback into the PTY (F4).
  writeEnvFile(projectPath: string, exp: EnvExport): Promise<void>

  // --- persistence (atomic; ADR-0001)
  state: {
    saveProject(projectPath: string, payload: ProjectState): Promise<void>
    loadProject(projectPath: string): Promise<ProjectState | null>
    saveApp(payload: AppState): Promise<void>
    loadApp(): Promise<AppState | null>
  }

  // --- PTY (one per Tab; design doc Tab lifecycle)
  spawnPty(opts: SpawnPtyOptions): TabId
  ptyWrite(id: TabId, data: string): void
  ptyResize(id: TabId, cols: number, rows: number): void
  ptyKill(id: TabId): void
  onPtyData(id: TabId, onData: (data: string) => void): Unsubscribe
  onPtyExit(id: TabId, onExit: () => void): Unsubscribe
}
