// Task 3.1 behaviours (1)-(5): PTY-per-Tab lifecycle through the sessions
// manager + store wiring, against the fake Host. Runs in the node project.
import { describe, expect, it, vi } from 'vitest'
import { createFakeHost } from '@shared/host.fake'
import { createCockpitStore } from '../store/cockpit'
import { createTerminalSessions } from './sessions'
import { wireTerminals } from './wire'

describe('terminal sessions', () => {
  it('(1) ensure spawns exactly one PTY at the Tab projectPath with CLU env', () => {
    const host = createFakeHost()
    const sessions = createTerminalSessions({ host })

    sessions.ensure({ id: 'tab-1', projectPath: '/proj/alpha' })
    sessions.ensure({ id: 'tab-1', projectPath: '/proj/alpha' }) // idempotent

    expect(host.fake.spawns).toHaveLength(1)
    expect(host.fake.spawns[0]).toMatchObject({
      cwd: '/proj/alpha',
      env: {
        CLU_TAB_ID: 'tab-1',
        CLU_ENV_FILE: '/proj/alpha/.clu/env.sh',
        CLU_FILE: '',
        CLU_FILES: '',
      },
    })
  })

  it('(2) PTY data routes only to its own Tab', () => {
    const host = createFakeHost()
    const sessions = createTerminalSessions({ host })
    sessions.ensure({ id: 'a', projectPath: '/a' }) // → fake-pty-1
    sessions.ensure({ id: 'b', projectPath: '/b' }) // → fake-pty-2
    const dataA = vi.fn()
    const dataB = vi.fn()
    sessions.onData('a', dataA)
    sessions.onData('b', dataB)

    host.fake.emitPtyData('fake-pty-2', 'for-b')
    expect(dataB).toHaveBeenCalledWith('for-b')
    expect(dataA).not.toHaveBeenCalled()
  })

  it('(3) writes go to that Tab PTY only; (4) resize forwards dims', () => {
    const host = createFakeHost()
    const sessions = createTerminalSessions({ host })
    sessions.ensure({ id: 'a', projectPath: '/a' })
    sessions.ensure({ id: 'b', projectPath: '/b' })

    sessions.write('b', 'ls\r')
    expect(host.fake.writes).toEqual([{ id: 'fake-pty-2', data: 'ls\r' }])

    const resizeSpy = vi.spyOn(host, 'ptyResize')
    sessions.resize('a', 120, 40)
    expect(resizeSpy).toHaveBeenCalledWith('fake-pty-1', 120, 40)
  })

  it('(5) closing a Tab kills its PTY (store wiring)', async () => {
    const host = createFakeHost()
    const store = createCockpitStore({ host })
    const sessions = createTerminalSessions({ host })
    wireTerminals(store, sessions)

    const id = await store.getState().openTab('/proj/a')
    sessions.ensure({ id, projectPath: '/proj/a' })
    await store.getState().closeTab(id)

    expect(host.fake.kills).toEqual(['fake-pty-1'])
    expect(sessions.has(id)).toBe(false)
  })

  it('(3.5f-C5) a stale old-pty exit after restart does NOT clear the new pty or fire exit', () => {
    const host = createFakeHost()
    const sessions = createTerminalSessions({ host })
    sessions.ensure({ id: 'a', projectPath: '/a' }) // fake-pty-1
    const onExit = vi.fn()
    sessions.onExit('a', onExit)

    sessions.restart({ id: 'a', projectPath: '/a' }) // now maps to fake-pty-2
    expect(sessions.has('a')).toBe(true)

    // The OLD pty's exit arrives late (already in flight across IPC).
    host.fake.emitPtyExit('fake-pty-1')
    expect(sessions.has('a')).toBe(true) // new pty mapping intact
    expect(onExit).not.toHaveBeenCalled() // no false "shell exited"

    // The NEW pty's exit is honoured.
    host.fake.emitPtyExit('fake-pty-2')
    expect(onExit).toHaveBeenCalledTimes(1)
    expect(sessions.has('a')).toBe(false)
  })

  it('(6) PTY exit flips the Tab shellExited flag; restart clears the session mapping', async () => {
    const host = createFakeHost()
    const store = createCockpitStore({ host })
    const sessions = createTerminalSessions({ host })
    wireTerminals(store, sessions)

    const id = await store.getState().openTab('/proj/a')
    sessions.ensure({ id, projectPath: '/proj/a' })

    host.fake.emitPtyExit('fake-pty-1')
    expect(store.getState().tabs[0].shellExited).toBe(true)
    expect(sessions.has(id)).toBe(false)

    sessions.restart({ id, projectPath: '/proj/a' })
    expect(host.fake.spawns).toHaveLength(2)
    expect(sessions.has(id)).toBe(true)
    store.getState().clearShellExited(id)
    expect(store.getState().tabs[0].shellExited).toBe(false)
  })
})
