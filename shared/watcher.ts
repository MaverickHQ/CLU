// chokidar-backed directory watcher (task 3.7). Electron-free so it's
// integration-testable in plain Node; main/host.ts wires it to IPC. chokidar
// over fs.watch because fs.watch is not recursive on Linux (CLU ships there).

import chokidar from 'chokidar'
import type { FsEvent } from './host'
import { createEventBatcher, isIgnoredPath } from './watchUtil'

// Safety cap on recursion. Without it, opening a data-heavy project (e.g. an
// archive of thousands of tiny files) makes chokidar open a watch descriptor
// per file and exhaust the process fd limit (EMFILE) — which then starves
// listDir, PTY spawn, and state writes of descriptors too. Most edits a user
// cares about live within a few levels of the project root; deeper dirs still
// list on demand, they just don't live-refresh.
export const WATCH_MAX_DEPTH = 3

export function createDirWatcher(
  absPath: string,
  onEvents: (events: FsEvent[]) => void,
  opts?: { onReady?: () => void; debounceMs?: number; depth?: number },
): () => void {
  const batcher = createEventBatcher(onEvents, opts?.debounceMs ?? 100)
  const watcher = chokidar.watch(absPath, {
    ignoreInitial: true,
    ignored: (path: string) => isIgnoredPath(absPath, path),
    depth: opts?.depth ?? WATCH_MAX_DEPTH,
    ignorePermissionErrors: true,
  })

  let closed = false
  const close = (): void => {
    if (closed) return
    closed = true
    batcher.dispose()
    void watcher.close()
  }

  watcher
    .on('add', (path) => batcher.push({ type: 'add', path }))
    .on('change', (path) => batcher.push({ type: 'change', path }))
    .on('unlink', (path) => batcher.push({ type: 'unlink', path }))
    // Directory create/remove: without these, a `mkdir foo` or `rm -rf foo`
    // (e.g. claude scaffolding a package) never refreshes the tree (3.6c).
    .on('addDir', (path) => batcher.push({ type: 'addDir', path }))
    .on('unlinkDir', (path) => batcher.push({ type: 'unlinkDir', path }))
    // Degrade gracefully: a huge tree can exhaust file descriptors (EMFILE).
    // Rather than spam unhandled rejections and starve fs/PTY/state of fds,
    // give up watching this project (live-refresh off) and free the handles.
    // The tree still loads and expands on demand via listDir.
    .on('error', (err) => {
      const code = (err as NodeJS.ErrnoException)?.code
      console.warn(
        `[clu] file watch disabled for ${absPath}: ${code ?? (err as Error)?.message ?? err}`,
      )
      close()
    })
  if (opts?.onReady) watcher.on('ready', opts.onReady)

  return close
}
