// R2.2b — pure selection over the session-file listing the Host returns.
import { describe, expect, it } from 'vitest'
import type { SessionFile } from '../host'
import { pickLatestSession, sessionExists } from './pick'

const ID_A = '11111111-1111-4111-8111-111111111111'
const ID_B = '22222222-2222-4222-8222-222222222222'
const ID_C = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'

describe('pickLatestSession', () => {
  it('returns the newest session by mtime', () => {
    const files: SessionFile[] = [
      { id: ID_A, mtimeMs: 100 },
      { id: ID_B, mtimeMs: 300 },
      { id: ID_C, mtimeMs: 200 },
    ]
    expect(pickLatestSession(files)).toBe(ID_B)
  })

  it('returns null for an empty listing', () => {
    expect(pickLatestSession([])).toBeNull()
  })

  it('with sinceMs, ignores sessions last touched before the cutoff', () => {
    const files: SessionFile[] = [
      { id: ID_A, mtimeMs: 100 }, // before the Tab opened → not ours
      { id: ID_B, mtimeMs: 500 }, // during the Tab's lifetime → candidate
    ]
    expect(pickLatestSession(files, 400)).toBe(ID_B)
  })

  it('with sinceMs, returns null when nothing is recent enough', () => {
    expect(pickLatestSession([{ id: ID_A, mtimeMs: 100 }], 400)).toBeNull()
  })

  it('ignores files whose name is not a session id (stray files)', () => {
    const files: SessionFile[] = [
      { id: 'not-a-uuid', mtimeMs: 999 },
      { id: ID_A, mtimeMs: 100 },
    ]
    expect(pickLatestSession(files)).toBe(ID_A)
  })
})

describe('sessionExists', () => {
  it('is true only when the id is present in the listing', () => {
    const files: SessionFile[] = [{ id: ID_A, mtimeMs: 1 }]
    expect(sessionExists(files, ID_A)).toBe(true)
    expect(sessionExists(files, ID_B)).toBe(false)
  })
})
