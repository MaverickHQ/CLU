// Task 2.2 behaviours (1)-(3) + CLU-specific Host surface. These tests document
// the Host contract that both the fake and the Electron implementation honour.
import { describe, expect, it, vi } from 'vitest'
import { createFakeHost } from './host.fake'
import { defaultProjectState, defaultAppState } from './types'

describe('fake Host: file I/O', () => {
  it('round-trips writeFile → readFile', async () => {
    const host = createFakeHost()
    await host.writeFile('/p/README.md', '# hello')
    const { content, sizeBytes } = await host.readFile('/p/README.md')
    expect(content).toBe('# hello')
    expect(sizeBytes).toBe(7)
  })

  it('readFile of a missing path rejects', async () => {
    const host = createFakeHost()
    await expect(host.readFile('/nope')).rejects.toThrow(/no such file/)
  })

  it('listDir returns immediate children with dir typing', async () => {
    const host = createFakeHost()
    await host.writeFile('/p/a.ts', '')
    await host.writeFile('/p/sub/b.ts', '')
    await host.writeFile('/q/other.ts', '')
    const entries = (await host.listDir('/p')).sort((a, b) => a.name.localeCompare(b.name))
    expect(entries).toEqual([
      { name: 'a.ts', isDir: false },
      { name: 'sub', isDir: true },
    ])
  })
})

describe('fake Host: state persistence', () => {
  it('saves and loads project state keyed by projectPath', async () => {
    const host = createFakeHost()
    const state = { ...defaultProjectState('clu'), pinSet: ['/p/a.ts'] }
    await host.state.saveProject('/p', state)
    expect(await host.state.loadProject('/p')).toEqual(state)
    expect(await host.state.loadProject('/other')).toBeNull()
  })

  it('returns copies — callers cannot mutate persisted state', async () => {
    const host = createFakeHost()
    await host.state.saveProject('/p', defaultProjectState('clu'))
    const loaded = await host.state.loadProject('/p')
    loaded!.pinSet.push('/p/mutated.ts')
    expect((await host.state.loadProject('/p'))!.pinSet).toEqual([])
  })

  it('saves and loads app-level state', async () => {
    const host = createFakeHost()
    expect(await host.state.loadApp()).toBeNull()
    await host.state.saveApp({ ...defaultAppState(), lastProjectPath: '/p' })
    expect((await host.state.loadApp())!.lastProjectPath).toBe('/p')
  })
})

describe('fake Host: watch', () => {
  it('fans out events to watchers of enclosing dirs and honours unsubscribe', async () => {
    const host = createFakeHost()
    const onP = vi.fn()
    const onQ = vi.fn()
    const unsub = host.watchDir('/p', onP)
    host.watchDir('/q', onQ)

    await host.writeFile('/p/x.ts', '1')
    expect(onP).toHaveBeenCalledWith([{ type: 'add', path: '/p/x.ts' }])
    expect(onQ).not.toHaveBeenCalled()

    unsub()
    await host.writeFile('/p/y.ts', '2')
    expect(onP).toHaveBeenCalledTimes(1)
  })

  it('(3.6g) does not deliver events under ignored subtrees (matches real chokidar)', async () => {
    const host = createFakeHost()
    const onP = vi.fn()
    host.watchDir('/p', onP)

    host.fake.emitFsEvent('/p/node_modules/pkg/index.js', 'add')
    host.fake.emitFsEvent('/p/.git/HEAD', 'change')
    host.fake.emitFsEvent('/p/.clu/env.sh', 'add')
    expect(onP).not.toHaveBeenCalled() // all under never-watched dirs

    host.fake.emitFsEvent('/p/src/real.ts', 'add')
    expect(onP).toHaveBeenCalledWith([{ type: 'add', path: '/p/src/real.ts' }])
  })
})

describe('fake Host: CLU-specific surface', () => {
  it('writeEnvFile renders the export to <root>/.clu/env.sh', async () => {
    const host = createFakeHost()
    await host.writeEnvFile('/p', { file: '/p/a.ts', files: ['/p/a.ts'] })
    const env = (await host.readFile('/p/.clu/env.sh')).content
    expect(env).toContain(`export CLU_FILE='/p/a.ts'`)
    expect(env).toContain(`CLU_FILES=('/p/a.ts')`)
  })

  it('gitStatus returns canned porcelain + prefix, null for non-repos', async () => {
    const host = createFakeHost()
    expect(await host.gitStatus('/p')).toBeNull()
    host.fake.setGitStatus('/p', ' M src/a.ts\n?? new.ts\n')
    expect(await host.gitStatus('/p')).toEqual({ porcelain: ' M src/a.ts\n?? new.ts\n', prefix: '' })
    host.fake.setGitStatus('/sub', ' M packages/app/a.ts\n', 'packages/app/')
    expect((await host.gitStatus('/sub'))?.prefix).toBe('packages/app/')
  })

  it('(R2.2) listSessions returns [] by default and seeded sessions per cwd', async () => {
    const host = createFakeHost()
    expect(await host.listSessions!('/p')).toEqual([])
    host.fake.setSessions('/p', [{ id: 'a', mtimeMs: 1 }])
    expect(await host.listSessions!('/p')).toEqual([{ id: 'a', mtimeMs: 1 }])
    expect(await host.listSessions!('/other')).toEqual([])
  })

  it('records PTY spawns/writes/kills and routes emitted data per id', () => {
    const host = createFakeHost()
    const a = host.spawnPty({ cwd: '/p', cols: 80, rows: 24 })
    const b = host.spawnPty({ cwd: '/q', cols: 80, rows: 24 })
    const onA = vi.fn()
    const onB = vi.fn()
    host.onPtyData(a, onA)
    host.onPtyData(b, onB)

    host.fake.emitPtyData(a, 'hello-a')
    expect(onA).toHaveBeenCalledWith('hello-a')
    expect(onB).not.toHaveBeenCalled()

    host.ptyWrite(a, 'ls\r')
    host.ptyKill(b)
    expect(host.fake.writes).toEqual([{ id: a, data: 'ls\r' }])
    expect(host.fake.kills).toEqual([b])
  })
})
