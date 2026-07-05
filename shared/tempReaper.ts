// Temp-dir reaper for shell-init scratch dirs (task 3.5g). Each PTY spawn
// creates a mkdtemp('clu-shell-') dir with an rc script; without this they
// leaked one per tab-open / Restart-shell. Reaped on PTY exit + on teardown.
// Injectable rm so it's unit-testable with a real temp dir and a fake exit.

export interface TempDirReaper {
  track(id: string, dir: string): void
  /** Remove the dir for this id (best-effort) and forget it. */
  reap(id: string): Promise<void>
  /** Remove every tracked dir (disposeAll / app quit). */
  reapAll(): Promise<void>
  size(): number
}

export function createTempDirReaper(
  rmDir: (dir: string) => Promise<void>,
): TempDirReaper {
  const dirs = new Map<string, string>()

  async function remove(dir: string): Promise<void> {
    try {
      await rmDir(dir)
    } catch {
      // best-effort — a reaped-elsewhere dir is fine
    }
  }

  return {
    track(id, dir) {
      dirs.set(id, dir)
    },
    async reap(id) {
      const dir = dirs.get(id)
      if (dir === undefined) return
      dirs.delete(id)
      await remove(dir)
    },
    async reapAll() {
      const all = [...dirs.values()]
      dirs.clear()
      await Promise.all(all.map(remove))
    },
    size: () => dirs.size,
  }
}
