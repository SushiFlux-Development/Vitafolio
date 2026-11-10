import type { CoverLetter, CoverLetterPayload, CoverLetterRenderOptions } from '../../api/types'
import { emailCheck, isValid, requiredField } from '../../validation/rules'
import { DEFAULT_DOCUMENT_COLOR } from '../documents/palette'

/** What the server stores of a letter: the editable fields only (no id, no timestamps, no signature flag). */
export function toPayload(letter: CoverLetter): CoverLetterPayload {
  return {
    title: letter.title,
    senderName: letter.senderName,
    senderStreet: letter.senderStreet,
    senderPostalCode: letter.senderPostalCode,
    senderCity: letter.senderCity,
    senderPhone: letter.senderPhone,
    senderEmail: letter.senderEmail,
    recipientCompany: letter.recipientCompany,
    recipientDepartment: letter.recipientDepartment,
    recipientContactPerson: letter.recipientContactPerson,
    recipientStreet: letter.recipientStreet,
    recipientPostalCode: letter.recipientPostalCode,
    recipientCity: letter.recipientCity,
    recipientCountry: letter.recipientCountry,
    place: letter.place,
    date: letter.date,
    subject: letter.subject,
    salutation: letter.salutation,
    body: letter.body,
    closing: letter.closing,
    signatureName: letter.signatureName,
    attachmentsNote: letter.attachmentsNote,
    language: letter.language,
    font: letter.font,
    accentColor: letter.accentColor,
    // Part of the letter: saved with it, so it counts as an unsaved change and always travels with a save.
    includeFoldMarks: letter.includeFoldMarks,
  }
}

/** The render options of a letter as the preview and the exports need them; the fold marks follow the letter's current choice. */
export function renderOptions(letter: CoverLetterPayload): CoverLetterRenderOptions {
  return {
    font: letter.font ?? 'Liberation Sans',
    accentColor: letter.accentColor ?? DEFAULT_DOCUMENT_COLOR,
    language: letter.language,
    includeFoldMarks: letter.includeFoldMarks,
  }
}

/** The fields without which a letter cannot be saved (the server demands them too). */
export const REQUIRED_FIELDS = ['title', 'recipientCompany', 'recipientCity', 'subject', 'salutation', 'body'] as const

/** Why a letter cannot be sent (yet). Nothing set = it can. */
export interface LetterIssues {
  /** How many required fields are empty. */
  missing: number
  /** The sender's e-mail address shows a problem right now (a blank in it, a second "@"). */
  red: boolean
  /** The address is still being typed (no "@" yet): not red, but not sendable either. */
  unfinished: boolean
}

export function letterIssues(letter: CoverLetterPayload): LetterIssues {
  const email = letter.senderEmail ?? ''
  return {
    missing: REQUIRED_FIELDS.filter((field) => !isValid(requiredField, letter[field] ?? '')).length,
    red: emailCheck(email, { settled: false }) !== undefined,
    unfinished: emailCheck(email, { settled: false }) === undefined && emailCheck(email, { settled: true }) !== undefined,
  }
}

/** True when a field of the letter shows a problem (a required field is empty, the sender's address is no address): such a letter is not sent. */
export function hasProblems(letter: CoverLetterPayload): boolean {
  const issues = letterIssues(letter)
  return issues.missing > 0 || issues.red || issues.unfinished
}

/** What the server would store of a letter (it trims every text): a copy that only differs in that is the same data. */
export function normalizeLetter(letter: CoverLetterPayload): unknown {
  return Object.fromEntries(Object.entries(letter).map(([key, value]) => [key, typeof value === 'string' ? value.trim() : value]))
}

/**
 * Reads a stored copy back: every field keeps the kind of value it has in `defaults` (the letter as the server has it), what is
 * missing or of another kind falls back to it. Anything that is not an object is refused.
 */
export function acceptLetter(raw: unknown, defaults: CoverLetterPayload): CoverLetterPayload | null {
  if (raw === null || typeof raw !== 'object') return null
  const source = raw as Record<string, unknown>
  const result: Record<string, unknown> = {}
  for (const [key, fallback] of Object.entries(defaults)) {
    const value = source[key]
    // A field that is empty on the server can hold text or nothing; the others keep their kind (text, switch).
    const fits = fallback === null || fallback === undefined ? typeof value === 'string' || value === null : typeof value === typeof fallback
    result[key] = fits ? value : fallback
  }
  if (result.language !== 'de' && result.language !== 'en') result.language = defaults.language
  return result as unknown as CoverLetterPayload
}
