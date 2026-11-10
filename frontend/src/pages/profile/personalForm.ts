import type { PersonalDataPayload, Profile } from '../../api/types'
import { displayOfStored } from '../../validation/dates'
import type { DateFormatId } from '../../validation/dates'
import { dateCheck, DAY_OPTIONAL, emailCheck, isStoredDateValid, isValid, requiredField, urlCheck } from '../../validation/rules'

/** The form values of a profile as the server has them (empty text for what is not filled in). */
export function personalFormOf(profile: Profile): PersonalDataPayload {
  return {
    firstName: profile.firstName ?? '',
    lastName: profile.lastName ?? '',
    academicTitle: profile.academicTitle ?? '',
    professionalTitle: profile.professionalTitle ?? '',
    email: profile.email ?? '',
    phone: profile.phone ?? '',
    street: profile.street ?? '',
    postalCode: profile.postalCode ?? '',
    city: profile.city ?? '',
    country: profile.country ?? '',
    dateOfBirth: profile.dateOfBirth ?? '',
    placeOfBirth: profile.placeOfBirth ?? '',
    nationality: profile.nationality ?? '',
    maritalStatus: profile.maritalStatus ?? '',
    website: profile.website ?? '',
    linkedIn: profile.linkedIn ?? '',
    gitHub: profile.gitHub ?? '',
    xing: profile.xing ?? '',
    bio: profile.bio ?? '',
  }
}

/** The personal fields as the server stores them: marks the state a local copy is based on. */
export function personalFingerprint(profile: Profile): string {
  return JSON.stringify(personalFormOf(profile))
}

/** Puts the personal fields of a server answer into the cached profile; everything else in the cache (entries, photo flag) stays. */
export function withPersonalFields(cached: Profile | undefined, answer: Profile): Profile {
  if (!cached) return answer
  const newer = Date.parse(answer.updatedAt) > Date.parse(cached.updatedAt)
  return { ...cached, ...personalFormOf(answer), updatedAt: newer ? answer.updatedAt : cached.updatedAt }
}

/** What the server would store of a form (it trims every text): two forms that normalise equal are the same data. */
export function normalizePersonal(form: PersonalDataPayload): unknown {
  return Object.fromEntries(Object.entries(form).map(([key, value]) => [key, typeof value === 'string' ? value.trim() : value]))
}

/** Reads a stored copy back; anything that is not an object of texts is refused, missing fields count as empty. */
export function acceptPersonal(raw: unknown): PersonalDataPayload | null {
  if (raw === null || typeof raw !== 'object') return null
  const source = raw as Record<string, unknown>
  const empty = personalFormOf({ id: '', hasPhoto: false, createdAt: '', updatedAt: '' } as Profile)
  const result: Record<string, string> = {}
  for (const key of Object.keys(empty)) {
    const value = source[key]
    result[key] = typeof value === 'string' ? value : ''
  }
  return result as unknown as PersonalDataPayload
}

/** The optional fields with a rule (the birth date has its own, see below). */
const RULED: ReadonlyArray<readonly [keyof PersonalDataPayload, typeof emailCheck]> = [
  ['email', emailCheck],
  ['website', urlCheck],
  ['linkedIn', urlCheck],
  ['gitHub', urlCheck],
  ['xing', urlCheck],
]

/** Why a form cannot be sent (yet). Empty everywhere = it can. */
export interface PersonalIssues {
  /** Required fields that are empty. They stay calm until touched, but nothing is sent without them. */
  missing: Array<'firstName' | 'lastName'>
  /** A field shows a problem right now (a wrong e-mail address, a day that does not exist). */
  red: boolean
  /** A value is still being typed (half an address, half a date): not red yet, not sendable either. */
  unfinished: boolean
}

/**
 * Tells why a form is not sendable, in the terms the fields use: a field that shows its problem now is "red", a value that is
 * only unfinished is not. The birth date is judged on the text the field shows in the user's notation (`format`).
 */
export function personalIssues(form: PersonalDataPayload, format: DateFormatId): PersonalIssues {
  const missing: PersonalIssues['missing'] = []
  if (!isValid(requiredField, form.firstName)) missing.push('firstName')
  if (!isValid(requiredField, form.lastName)) missing.push('lastName')
  let red = false
  let unfinished = false
  const judge = (check: typeof emailCheck, value: string) => {
    if (check(value, { settled: false })) red = true
    else if (check(value, { settled: true })) unfinished = true
  }
  for (const [field, check] of RULED) judge(check, form[field] ?? '')
  judge(dateCheck(DAY_OPTIONAL, format), displayOfStored(form.dateOfBirth ?? '', format, 'day'))
  return { missing, red, unfinished }
}

/**
 * The one check whether a form may be sent: required names are there, and nothing the fields mark is wrong or unfinished. An
 * unfinished date is no ISO text, so it never goes out.
 */
export function isPersonalSendable(form: PersonalDataPayload): boolean {
  return (
    isValid(requiredField, form.firstName) &&
    isValid(requiredField, form.lastName) &&
    RULED.every(([field, check]) => isValid(check, form[field] ?? '')) &&
    isStoredDateValid(DAY_OPTIONAL, form.dateOfBirth ?? '')
  )
}
