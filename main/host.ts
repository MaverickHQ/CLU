// Main-process Host services: real fs/state/git/dialog + the node-pty manager.
// Registered as IPC handlers (registerHostIpc) so the renderer drives them
// through preload. The PTY manager is shared/pty.ts (proven in task 2.2).
//
// CLU delta vs the reference pattern: per-project state persists INSIDE the
// project at <root>/.clu/state.json (ADR-0001 — state travels with the repo);
// only app-level prefs live under userData.

import { app, BrowserWindow, dialog, ipcMain, Notification } from 'electron'
import { execFile } from 'node:child_process'
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  readdir,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'
import { IPC } from '@shared/ipc'
import { fallbackEnvCommand, renderPosixEnv, type EnvExport } from '@shared/envFile'
import { envFilePath, stateFilePath } from '@shared/paths'
import { createQuietEmitter, type QuietEmitter } from '@shared/quietEmitter'
import { READ_HARD_MAX, type GitStatus, type SessionFile } from '@shared/host'
import { projectSlug } from '@shared/session/paths'
import {
  isCleanProjectPath,
  isWithinRoots,
  PathConfinementError,
} from '@shared/pathGuard'
import { createNodePty } from '@shared/pty'
import { prepareShellInit } from '@shared/shellInit'
import { createTempDirReaper } from '@shared/tempReaper'
import { parseAppState, parseProjectState } from '@shared/stateValidate'
import { createDirWatcher } from '@shared/watcher'
import type { AppState, ProjectState } from '@shared/types'

const execFileAsync = promisify(execFile)

const appStateFile = (): string => join(app.getPath('userData'), 'app.json')

/** Atomic write: temp + rename, so a crash mid-write never corrupts the file. */
async function writeAtomic(file: string, content: string): Promise<void> {
  await mkdir(dirname(file), { recursive: true })
  const tmp = `${file}.tmp`
  await writeFile(tmp, content, 'utf8')
  await rename(tmp, file)
}

export function registerHostIpc(getWindow: () => BrowserWindow | null): () => void {
  const pty = createNodePty()
  const watchers = new Map<number, () => void>()
  let watchCounter = 0
  // Reaps each PTY's shell-init temp dir on exit (C6/3.5g leak).
  const tempReaper = createTempDirReaper((dir) => rm(dir, { recursive: true, force: true }))

  // Non-integrated shells (sh/fish/nu/…) can't source env.sh, so we type the
  // $CLU_FILES export into their PTY at a quiet moment instead (F4). Keyed by
  // projectPath; a quiet emitter serializes the typing.
  interface Fallback {
    id: string
    shell: string
    emitter: QuietEmitter
  }
  const fallbacks = new Map<string, Fallback>() // projectPath → fallback

  // Project roots the renderer is allowed to touch. Populated only by the
  // directory picker (main-owned, fully trusted) and registerRoot / project
  // load (the store declaring a restored/CLI-opened project). Starts EMPTY so
  // confinement genuinely fails closed: until a project is registered, no
  // renderer-supplied fs op is permitted anywhere. App state (userData) and
  // shell-init scratch (tmpdir) are written by main via computed paths that
  // never pass through these guards, so they need not be roots — seeding them
  // only widened the guarded surface to the world-writable temp dir (3.6e, S2/S4).
  const roots = new Set<string>()
  const addRoot = (projectPath: string): void => {
    if (isCleanProjectPath(projectPath)) roots.add(projectPath.replace(/\/+$/, ''))
  }
  const assertWithinRoots = (absPath: string): void => {
    if (!isWithinRoots(roots, absPath)) throw new PathConfinementError(absPath)
  }
  const assertProjectWritable = (projectPath: string): void => {
    if (!isCleanProjectPath(projectPath) || !isWithinRoots(roots, projectPath)) {
      throw new PathConfinementError(projectPath)
    }
  }

  const send = (channel: string, ...args: unknown[]): void => {
    // A PTY can emit one last chunk after the window is destroyed (close races
    // the SIGHUP→SIGKILL). getWindow() still returns the destroyed window, so
    // guard both it and its webContents — otherwise .send() throws
    // "Object has been destroyed" as an uncaught main-process exception.
    const win = getWindow()
    if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) {
      win.webContents.send(channel, ...args)
    }
  }

  ipcMain.handle(IPC.registerRoot, async (_e, projectPath: string) => {
    addRoot(projectPath)
  })

  // --- state (per-project inside .clu/; app-level under userData) ---
  ipcMain.handle(IPC.stateSaveProject, async (_e, projectPath: string, payload: ProjectState) => {
    assertProjectWritable(projectPath)
    await writeAtomic(stateFilePath(projectPath), JSON.stringify(payload, null, 2))
  })
  ipcMain.handle(
    IPC.stateLoadProject,
    async (_e, projectPath: string): Promise<ProjectState | null> => {
      addRoot(projectPath) // loading a project registers it as a root
      const file = stateFilePath(projectPath)
      let text: string
      try {
        text = await readFile(file, 'utf8')
      } catch {
        return null // no state yet — fresh project
      }
      const state = parseProjectState(text)
      if (state === null) {
        // Corrupt or unknown-schema: preserve the evidence, fall back to
        // defaults (error-state F). Never overwrite the .broken silently.
        try {
          await rename(file, `${file}.broken`)
        } catch {
          // best-effort — the load still degrades gracefully
        }
      }
      return state
    },
  )
  ipcMain.handle(IPC.stateSaveApp, async (_e, payload: AppState) => {
    await writeAtomic(appStateFile(), JSON.stringify(payload, null, 2))
  })
  ipcMain.handle(IPC.stateLoadApp, async (): Promise<AppState | null> => {
    const file = appStateFile()
    let text: string
    try {
      text = await readFile(file, 'utf8')
    } catch {
      return null
    }
    const state = parseAppState(text)
    if (state === null) {
      try {
        await rename(file, `${file}.broken`)
      } catch {
        // best-effort
      }
    }
    return state
  })

  // --- files (all confined to open project roots; findings S2/S4) ---
  ipcMain.handle(IPC.fileRead, async (_e, absPath: string) => {
    assertWithinRoots(absPath)
    // Stat before reading so a multi-GB file can't OOM main (C3). The finer
    // 10 MB / 50 MB viewer routing stays renderer-side for files under the cap.
    const { size } = await stat(absPath)
    if (size > READ_HARD_MAX) return { content: '', sizeBytes: size, tooLarge: true }
    const content = await readFile(absPath, 'utf8')
    return { content, sizeBytes: Buffer.byteLength(content, 'utf8') }
  })
  ipcMain.handle(IPC.fileWrite, async (_e, absPath: string, content: string) => {
    assertWithinRoots(absPath)
    await writeAtomic(absPath, content)
  })
  ipcMain.handle(
    IPC.fileList,
    async (_e, absPath: string): Promise<Array<{ name: string; isDir: boolean }>> => {
      if (!isWithinRoots(roots, absPath)) return []
      try {
        const entries = await readdir(absPath, { withFileTypes: true })
        return entries.map((e) => ({ name: e.name, isDir: e.isDirectory() }))
      } catch {
        return []
      }
    },
  )
  // --- $CLU_FILES export (ADR-0007). Render env.sh (bash/zsh source it via the
  //     hook); for non-integrated shells, type the fallback into the PTY (F4).
  //     projectPath confined so a traversal can't plant a sourced env.sh
  //     outside an open project (S4). ---
  ipcMain.handle(IPC.envWrite, async (_e, projectPath: string, exp: EnvExport) => {
    assertProjectWritable(projectPath)
    await writeAtomic(envFilePath(projectPath), renderPosixEnv(exp))
    const fb = fallbacks.get(projectPath)
    if (fb) fb.emitter.send(fallbackEnvCommand(fb.shell, exp))
  })

  // --- git status (raw porcelain + repo→project prefix; parsing is pure) ---
  ipcMain.handle(IPC.gitStatus, async (_e, projectPath: string): Promise<GitStatus | null> => {
    try {
      // Porcelain paths are repo-root-relative; --show-prefix is the path from
      // the repo root down to projectPath (empty at the root, `sub/dir/` in a
      // subdirectory). The parser uses it to rebase paths onto the Project (3.6b).
      const [status, prefix] = await Promise.all([
        execFileAsync('git', ['status', '--porcelain'], {
          cwd: projectPath,
          maxBuffer: 10 * 1024 * 1024,
        }),
        execFileAsync('git', ['rev-parse', '--show-prefix'], { cwd: projectPath }),
      ])
      return { porcelain: status.stdout, prefix: prefix.stdout.trim() }
    } catch {
      return null // not a repo, or git missing — graceful degradation
    }
  })

  // R2.2 / ADR-0012: enumerate a project's saved Claude sessions. Reads only
  // the transcript-dir filenames + mtimes under ~/.claude/projects/<slug>/,
  // never contents. Not root-confined (it's under $HOME, not the project) — but
  // it's read-only listing of Claude Code's own dir, and returns [] on any error
  // (dir absent, unreadable) so resume simply degrades to unavailable.
  ipcMain.handle(IPC.listSessions, async (_e, cwd: string): Promise<SessionFile[]> => {
    try {
      const dir = join(homedir(), '.claude', 'projects', projectSlug(cwd))
      const names = await readdir(dir)
      const files = await Promise.all(
        names
          .filter((n) => n.endsWith('.jsonl'))
          .map(async (n): Promise<SessionFile | null> => {
            try {
              const s = await stat(join(dir, n))
              return { id: n.slice(0, -'.jsonl'.length), mtimeMs: s.mtimeMs }
            } catch {
              return null // vanished between readdir and stat
            }
          }),
      )
      return files.filter((f): f is SessionFile => f !== null)
    } catch {
      return [] // no transcript dir for this project — resume unavailable
    }
  })

  ipcMain.handle(IPC.pathExists, async (_e, absPath: string): Promise<boolean> => {
    // pathExists is used by the Welcome recent-project check and missing-tab
    // detection, so allow the exact registered roots themselves in addition to
    // paths inside them (a missing root is a legitimate query).
    if (!isWithinRoots(roots, absPath) && !roots.has(absPath.replace(/\/+$/, ''))) return false
    try {
      await access(absPath)
      return true
    } catch {
      return false
    }
  })

  // --- native directory picker (main-owned → the result is a trusted root) ---
  ipcMain.handle(IPC.pickDirectory, async (): Promise<string | null> => {
    const win = getWindow()
    const result = win
      ? await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'] })
      : await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] })
    const picked = result.canceled ? null : (result.filePaths[0] ?? null)
    if (picked) addRoot(picked)
    return picked
  })

  // --- watch (chokidar: recursive on all platforms, batched, static ignores) ---
  ipcMain.handle(IPC.watchStart, async (_e, absPath: string): Promise<number> => {
    const id = ++watchCounter
    const stop = createDirWatcher(absPath, (events) => send(IPC.watchEvent, id, events))
    watchers.set(id, stop)
    return id
  })
  ipcMain.handle(IPC.watchStop, async (_e, id: number) => {
    watchers.get(id)?.()
    watchers.delete(id)
  })

  // --- pty (one per Tab) ---
  ipcMain.handle(IPC.ptySpawn, async (_e, opts): Promise<string> => {
    // Run the user's login shell so PATH/claude/aliases resolve, with the
    // ADR-0007 shell-init plan baked into the spawn (temp rcfile / ZDOTDIR —
    // the user's own config is never modified).
    const shell = opts.shell || process.env.SHELL || '/bin/zsh'
    const cwd = opts.cwd === '~' || !opts.cwd ? app.getPath('home') : opts.cwd
    const tmpDir = await mkdtemp(join(tmpdir(), 'clu-shell-'))
    const plan = prepareShellInit({
      shell,
      home: app.getPath('home'),
      tmpDir,
      zdotdir: process.env.ZDOTDIR, // honor the user's real zsh config dir (F1)
    })
    for (const f of plan.files) await writeFile(f.path, f.content, 'utf8')
    const id = pty.spawn({
      ...opts,
      shell,
      cwd,
      args: plan.args,
      env: { ...opts.env, ...plan.env },
    })
    tempReaper.track(id, tmpDir)

    // Non-integrated shell → set up the quiet-moment fallback typist (F4) and
    // tell the user once that auto-export uses the fallback path.
    if (!plan.integrated) {
      const emitter = createQuietEmitter({ write: (d) => pty.write(id, d) })
      fallbacks.set(cwd, { id, shell: plan.shell, emitter })
      emitter.send(
        `echo "clu: $CLU_FILES auto-export uses fallback typing for ${plan.shell}"`,
      )
    }

    pty.onData(id, (data) => {
      send(IPC.ptyData, id, data)
      fallbacks.get(cwd)?.emitter.notifyActivity() // don't type mid-output
    })
    pty.onExit(id, () => {
      send(IPC.ptyExit, id)
      void tempReaper.reap(id) // remove the shell-init scratch dir (3.5g)
      const fb = fallbacks.get(cwd)
      if (fb?.id === id) {
        fb.emitter.dispose()
        fallbacks.delete(cwd)
      }
    })
    return id
  })
  ipcMain.on(IPC.ptyWrite, (_e, id: string, data: string) => pty.write(id, data))
  ipcMain.on(IPC.ptyResize, (_e, id: string, cols: number, rows: number) =>
    pty.resize(id, cols, rows),
  )
  ipcMain.on(IPC.ptyKill, (_e, id: string) => pty.kill(id))

  // OS notification (R2.1k): a background Tab's Claude is blocked. Clicking it
  // focuses the window and tells the renderer which Tab to select.
  ipcMain.on(IPC.notify, (_e, opts: { title: string; body: string; tabId: string }) => {
    if (!Notification.isSupported()) return
    const n = new Notification({ title: opts.title, body: opts.body })
    n.on('click', () => {
      const win = getWindow()
      if (!win || win.isDestroyed()) return
      if (win.isMinimized()) win.restore()
      win.focus()
      if (!win.webContents.isDestroyed()) win.webContents.send(IPC.focusTab, opts.tabId)
    })
    n.show()
  })

  // Teardown on app quit / window close (C6): kill every PTY and close every
  // watcher so no shell or fs watcher is orphaned. Idempotent.
  return function disposeAll(): void {
    pty.killAll()
    for (const stop of watchers.values()) stop()
    watchers.clear()
    void tempReaper.reapAll()
  }
}
