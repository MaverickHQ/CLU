// Task 3.5 behaviours (3)-(7): env-export + staleness wiring over fake Host.
import { describe, expect, it, vi } from 'vitest'
import { createFakeHost } from '@shared/host.fake'
import { createCockpitStore } from '../store/cockpit'
import { wireEnvExport, wirePinStaleness } from './wire'

async function setup() {
  const host = createFakeHost()
  host.fake.addDir('/p')
  await host.writeFile('/p/a.ts', 'a')
  const store = createCockpitStore({ host })
  wireEnvExport(store, host)
  wirePinStaleness(store, host)
  const tabId = await store.getState().openTab('/p')
  const tab = () => store.getState().tabs.find((t) => t.id === tabId)!
  return { host, store, tabId, tab }
}

describe('env export wiring', () => {
  it('(3) each PinSet change writes env.sh exactly once with the current set', async () => {
    const { host, store, tabId } = await setup()
    const spy = vi.spyOn(host, 'writeEnvFile')

    store.getState().pin(tabId, '/p/a.ts')
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy.mock.calls[0][0]).toBe('/p')
    expect(spy.mock.calls[0][1]).toEqual({ file: null, files: ['/p/a.ts'] })

    // Identical state again → no duplicate write.
    store.getState().selectTab(tabId)
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('(4) opening a file in the viewer updates $CLU_FILE alongside', async () => {
    const { host, store, tabId } = await setup()
    store.getState().pin(tabId, '/p/a.ts')
    store.getState().setViewerFile(tabId, '/p/readme.md')

    const env = (await host.readFile('/p/.clu/env.sh')).content
    expect(env).toContain(`export CLU_FILE='/p/readme.md'`)
    expect(env).toContain(`CLU_FILES=('/p/a.ts')`)
  })
})

describe('pin staleness wiring', () => {
  it('(5) deleting a pinned file marks it stale but keeps it pinned AND exported', async () => {
    const { host, store, tabId, tab } = await setup()
    store.getState().pin(tabId, '/p/a.ts')

    host.fake.deleteFile('/p/a.ts') // fake emits unlink through watchers
    expect(tab().stalePins).toEqual(['/p/a.ts'])
    expect(tab().pinSet).toEqual(['/p/a.ts']) // ADR-0005: user intent preserved
    expect((await host.readFile('/p/.clu/env.sh')).content).toContain('/p/a.ts')
  })

  it('(6) re-creating the file clears the stale flag', async () => {
    const { host, store, tabId, tab } = await setup()
    store.getState().pin(tabId, '/p/a.ts')
    host.fake.deleteFile('/p/a.ts')
    expect(tab().stalePins).toEqual(['/p/a.ts'])

    await host.writeFile('/p/a.ts', 'back') // git checkout brought it back
    expect(tab().stalePins).toEqual([])
  })

  it('(7) explicit unpin removes both the pin and its stale flag, and re-exports', async () => {
    const { host, store, tabId, tab } = await setup()
    store.getState().pin(tabId, '/p/a.ts')
    host.fake.deleteFile('/p/a.ts')

    store.getState().unpin(tabId, '/p/a.ts')
    expect(tab().pinSet).toEqual([])
    expect(tab().stalePins).toEqual([])
    expect((await host.readFile('/p/.clu/env.sh')).content).toContain('CLU_FILES=()')
  })
})
