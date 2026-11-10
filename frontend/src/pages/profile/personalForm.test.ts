import { describe, expect, it } from 'vitest'
import type { PersonalDataPayload, Profile } from '../../api/types'
import { acceptPersonal, isPersonalSendable, normalizePersonal, personalFingerprint, personalFormOf, personalIssues, withPersonalFields } from './personalForm'

const profile = {
  id: 'p1',
  firstName: 'Erika',
  lastName: 'Mustermann',
  email: 'erika@example.com',
  city: 'Berlin',
  dateOfBirth: '1990-01-01',
  website: null,
  hasPhoto: false,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  experiences: [{ id: 'e1' }],
} as unknown as Profile

const form = (changes: Partial<PersonalDataPayload> = {}): PersonalDataPayload => ({ ...personalFormOf(profile), ...changes })

describe('personalIssues and isPersonalSendable', () => {
  it('see nothing wrong with a complete form', () => {
    expect(personalIssues(form(), 'dmy')).toEqual({ missing: [], red: false, unfinished: false })
    expect(isPersonalSendable(form())).toBe(true)
  })

  it('name the missing required names', () => {
    expect(personalIssues(form({ firstName: '' }), 'dmy').missing).toEqual(['firstName'])
    expect(personalIssues(form({ firstName: ' ', lastName: '' }), 'dmy').missing).toEqual(['firstName', 'lastName'])
    expect(isPersonalSendable(form({ lastName: '' }))).toBe(false)
  })

  it('call a wrong address red and half an address unfinished; neither is sent', () => {
    expect(personalIssues(form({ email: 'erika mail' }), 'dmy')).toMatchObject({ red: true, unfinished: false })
    expect(personalIssues(form({ email: 'erika@' }), 'dmy')).toMatchObject({ red: false, unfinished: true })
    expect(isPersonalSendable(form({ email: 'erika mail' }))).toBe(false)
    expect(isPersonalSendable(form({ email: 'erika@' }))).toBe(false)
    expect(isPersonalSendable(form({ email: '' }))).toBe(true)
  })

  it('judge the birth date on the text the field shows: unfinished is not red, a day that does not exist is', () => {
    expect(personalIssues(form({ dateOfBirth: '23.04' }), 'dmy')).toMatchObject({ red: false, unfinished: true })
    expect(personalIssues(form({ dateOfBirth: '31.02.1990' }), 'dmy')).toMatchObject({ red: true })
    expect(isPersonalSendable(form({ dateOfBirth: '23.04' }))).toBe(false)
    expect(isPersonalSendable(form({ dateOfBirth: '1990-02-31' }))).toBe(false)
    expect(isPersonalSendable(form({ dateOfBirth: '' }))).toBe(true)
    expect(isPersonalSendable(form({ dateOfBirth: '1990-04-23' }))).toBe(true)
  })

  it('call a link without http(s) red', () => {
    expect(personalIssues(form({ website: 'ftp://x' }), 'dmy').red).toBe(true)
    expect(isPersonalSendable(form({ website: 'https://example.com' }))).toBe(true)
  })
})

describe('what the server has', () => {
  it('is the same fingerprint for the same personal fields, whatever else in the profile changed', () => {
    const other = { ...profile, updatedAt: '2026-11-09T00:00:00Z', experiences: [] } as unknown as Profile
    expect(personalFingerprint(other)).toBe(personalFingerprint(profile))
    expect(personalFingerprint({ ...profile, city: 'Köln' } as Profile)).not.toBe(personalFingerprint(profile))
  })

  it('puts only the personal fields of an answer into the cached profile', () => {
    const answer = { ...profile, city: 'Köln', updatedAt: '2026-11-09T10:00:00Z', experiences: [] } as unknown as Profile
    const merged = withPersonalFields(profile, answer)
    expect(merged.city).toBe('Köln')
    expect(merged.experiences).toHaveLength(1) // the lists of the cache stay
    expect(merged.updatedAt).toBe('2026-11-09T10:00:00Z')
    // An older answer never makes the time go back
    expect(withPersonalFields(answer, profile).updatedAt).toBe('2026-11-09T10:00:00Z')
    expect(withPersonalFields(undefined, answer)).toBe(answer)
  })

  it('counts a form that differs only by blanks as the same data', () => {
    expect(normalizePersonal(form({ city: 'Berlin ' }))).toEqual(normalizePersonal(form()))
    expect(normalizePersonal(form({ city: 'Köln' }))).not.toEqual(normalizePersonal(form()))
  })
})

describe('acceptPersonal', () => {
  it('reads a stored form back, and fills what is missing or of the wrong kind with empty text', () => {
    expect(acceptPersonal({ firstName: 'Erika', lastName: 'M', city: 42 })).toMatchObject({ firstName: 'Erika', lastName: 'M', city: '', bio: '' })
  })

  it('refuses what is no object', () => {
    for (const raw of [null, 'text', 7, undefined]) expect(acceptPersonal(raw)).toBeNull()
  })
})
