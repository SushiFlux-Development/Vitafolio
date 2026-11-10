import { afterEach, describe, expect, it, vi } from 'vitest'
import { decideRestore, draftKey, readDraft, removeAccountDrafts, removeDraft, removeDraftIfSame, removeDraftsExcept, writeDraft } from './draftStore'

const accept = (raw: unknown): { text: string } | null => (raw && typeof raw === 'object' && typeof (raw as { text: unknown }).text === 'string' ? (raw as { text: string }) : null)

describe('draftStore', () => {
  afterEach(() => vi.restoreAllMocks())

  it('names the key after account and form, without any product name', () => {
    expect(draftKey('u-1', 'personal')).toBe('cv.draft.u-1.personal')
    expect(draftKey('u-1', 'coverLetter.abc')).toBe('cv.draft.u-1.coverLetter.abc')
  })

  it('writes and reads a copy with value, time and the state it is based on', () => {
    writeDraft('cv.draft.u.f', { value: { text: 'Hallo' }, savedAt: 1700000000000, base: 'b1' })
    expect(readDraft('cv.draft.u.f', accept)).toEqual({ value: { text: 'Hallo' }, savedAt: 1700000000000, base: 'b1' })
  })

  it('ignores a copy that is broken, cut off or of the wrong shape', () => {
    localStorage.setItem('k1', '{not json')
    localStorage.setItem('k2', JSON.stringify({ value: { text: 'x' }, savedAt: 'yesterday', base: 'b' }))
    localStorage.setItem('k3', JSON.stringify({ value: 42, savedAt: 1, base: 'b' }))
    localStorage.setItem('k4', 'null')
    for (const key of ['k1', 'k2', 'k3', 'k4', 'missing']) expect(readDraft(key, accept)).toBeNull()
  })

  it('removes only a copy that still holds exactly the confirmed value', () => {
    writeDraft('k', { value: { text: 'neu' }, savedAt: 1, base: 'b' })
    removeDraftIfSame('k', { text: 'alt' })
    expect(readDraft('k', accept)).not.toBeNull()
    removeDraftIfSame('k', { text: 'neu' })
    expect(readDraft('k', accept)).toBeNull()
  })

  it('removes the copies of one account on sign-out and leaves everything else', () => {
    writeDraft(draftKey('u-1', 'personal'), { value: { text: 'a' }, savedAt: 1, base: 'b' })
    writeDraft(draftKey('u-1', 'coverLetter.x'), { value: { text: 'b' }, savedAt: 1, base: 'b' })
    writeDraft(draftKey('u-10', 'personal'), { value: { text: 'c' }, savedAt: 1, base: 'b' })
    writeDraft(draftKey('u-2', 'personal'), { value: { text: 'd' }, savedAt: 1, base: 'b' })
    localStorage.setItem('cv.theme', 'dark')

    removeAccountDrafts('u-1')

    expect(readDraft(draftKey('u-1', 'personal'), accept)).toBeNull()
    expect(readDraft(draftKey('u-1', 'coverLetter.x'), accept)).toBeNull()
    expect(readDraft(draftKey('u-2', 'personal'), accept)).not.toBeNull()
    // "u-10" starts like "u-1" but is another account
    expect(readDraft(draftKey('u-10', 'personal'), accept)).not.toBeNull()
    expect(localStorage.getItem('cv.theme')).toBe('dark')
  })

  it('removes the copies of letters that no longer exist', () => {
    for (const id of ['a', 'b', 'c']) writeDraft(draftKey('u-1', `coverLetter.${id}`), { value: { text: id }, savedAt: 1, base: 'b' })
    writeDraft(draftKey('u-1', 'personal'), { value: { text: 'p' }, savedAt: 1, base: 'b' })
    removeDraftsExcept('u-1', 'coverLetter', new Set(['b']))
    expect(readDraft(draftKey('u-1', 'coverLetter.a'), accept)).toBeNull()
    expect(readDraft(draftKey('u-1', 'coverLetter.b'), accept)).not.toBeNull()
    expect(readDraft(draftKey('u-1', 'coverLetter.c'), accept)).toBeNull()
    expect(readDraft(draftKey('u-1', 'personal'), accept)).not.toBeNull()
  })

  it('works without storage: nothing throws, nothing is found', () => {
    for (const method of ['setItem', 'getItem', 'removeItem', 'key'] as const) {
      vi.spyOn(Storage.prototype, method).mockImplementation(() => {
        throw new DOMException('blocked', 'SecurityError')
      })
    }
    expect(writeDraft('k', { value: { text: 'x' }, savedAt: 1, base: 'b' })).toBe(false)
    expect(readDraft('k', accept)).toBeNull()
    expect(() => {
      removeDraft('k')
      removeDraftIfSame('k', {})
      removeAccountDrafts('u')
      removeDraftsExcept('u', 'f', new Set())
    }).not.toThrow()
  })
})

describe('decideRestore', () => {
  const normalize = (value: { text: string }) => value.text.trim()
  const draft = (text: string, base: string) => ({ value: { text }, savedAt: 1700000000000, base })

  it('does nothing without a copy', () => {
    expect(decideRestore(null, { value: { text: 'a' }, base: 'b1' }, normalize)).toEqual({ kind: 'none' })
  })

  it('does nothing when the server already has the same (a blank at the end does not count)', () => {
    expect(decideRestore(draft('Max ', 'b0'), { value: { text: 'Max' }, base: 'b1' }, normalize)).toEqual({ kind: 'none' })
  })

  it('takes the input over when the server did not change since the copy was made', () => {
    const decision = decideRestore(draft('Max B', 'b1'), { value: { text: 'Max' }, base: 'b1' }, normalize)
    expect(decision.kind).toBe('apply')
  })

  it('asks when the server changed meanwhile', () => {
    const decision = decideRestore(draft('Max B', 'b0'), { value: { text: 'Maximilian' }, base: 'b1' }, normalize)
    expect(decision.kind).toBe('ask')
  })
})
