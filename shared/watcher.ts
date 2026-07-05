// chokidar-backed directory watcher (task 3.7). Electron-free so it's
// integration-testable in plain Node; main/host.ts wires it to IPC. chokidar
// over fs.watch because fs.watch is not recursive on Linux (CLU ships there).

import chokidar from 'chokidar'
import type { FsEvent } from './host'
import { createEventBatcher, isIgnoredPath } from './watchUtil'

export function createDirWatcher(
  absPath: string,
  onEvents: (events: FsEvent[]) => void,
  opts?: { onReady?: () => void; debounceMs?: number },
): () => void {
  const batcher = createEventBatcher(onEvents, opts?.debounceMs ?? 100)
  const watcher = chokidar.watch(absPath, {
    ignoreInitial: true,
    ignored: (path: string) => isIgnoredPath(absPath, path),
  })
  watcher
    .on('add', (path) => batcher.push({ type: 'add', path }))
    .on('change', (path) => batcher.push({ type: 'change', path }))
    .on('unlink', (path) => batcher.push({ type: 'unlink', path }))
    // Directory create/remove: without these, a `mkdir foo` or `rm -rf foo`
    // (e.g. claude scaffolding a package) never refreshes the tree (3.6c).
    .on('addDir', (path) => batcher.push({ type: 'addDir', path }))
    .on('unlinkDir', (path) => batcher.push({ type: 'unlinkDir', path }))
  if (opts?.onReady) watcher.on('ready', opts.onReady)

  return () => {
    batcher.dispose()
    void watcher.close()
  }
}
