import { describe, expect, it } from 'vitest'
import type { CoverLetter } from '../../api/types'
import { acceptLetter, hasProblems, letterIssues, normalizeLetter, renderOptions, toPayload } from './model'

const letter: CoverLetter = {
  id: 'cl1',
  title: 'Bewerbung',
  senderName: 'Erika Mustermann',
  senderEmail: 'erika@example.com',
  senderStreet: null,
  recipientCompany: 'Musterfirma',
  recipientCity: 'Musterstadt',
  subject: 'Betreff',
  salutation: 'Guten Tag',
  body: 'Text',
  closing: 'Mit freundlichen Grüßen',
  hasSignature: true,
  language: 'de',
  font: 'Liberation Sans',
  accentColor: '#14213D',
  includeFoldMarks: true,
  createdAt: '2026-11-06T00:00:00Z',
  updatedAt: '2026-11-06T00:00:00Z',
}
const payload = toPayload(letter)

describe('toPayload', () => {
  it('keeps the editable fields only', () => {
    expect(payload).not.toHaveProperty('id')
    expect(payload).not.toHaveProperty('hasSignature')
    expect(payload).not.toHaveProperty('updatedAt')
    expect(payload.includeFoldMarks).toBe(true)
  })
})

describe('letterIssues and hasProblems', () => {
  it('see nothing wrong with a complete letter', () => {
    expect(letterIssues(payload)).toEqual({ missing: 0, red: false, unfinished: false })
    expect(hasProblems(payload)).toBe(false)
  })

  it('count the empty required fields', () => {
    expect(letterIssues({ ...payload, subject: '', body: '  ' }).missing).toBe(2)
    expect(hasProblems({ ...payload, salutation: '' })).toBe(true)
  })

  it('call a blank in the sender address red and half an address unfinished; both are not sent', () => {
    expect(letterIssues({ ...payload, senderEmail: 'a b' })).toMatchObject({ red: true, unfinished: false })
    expect(letterIssues({ ...payload, senderEmail: 'erika@' })).toMatchObject({ red: false, unfinished: true })
    expect(hasProblems({ ...payload, senderEmail: 'erika@' })).toBe(true)
    expect(hasProblems({ ...payload, senderEmail: '' })).toBe(false)
  })
})

describe('the local copy of a letter', () => {
  it('is read back field by field and falls back to the stored letter for what does not fit', () => {
    const accepted = acceptLetter({ ...payload, subject: 'Aus der Kopie', senderStreet: 'Hauptstr. 1', includeFoldMarks: 'ja', language: 'fr', body: 42 }, payload)
    expect(accepted).toMatchObject({ subject: 'Aus der Kopie', senderStreet: 'Hauptstr. 1', includeFoldMarks: true, language: 'de', body: 'Text' })
  })

  it('refuses what is no object', () => {
    expect(acceptLetter(null, payload)).toBeNull()
    expect(acceptLetter('x', payload)).toBeNull()
  })

  it('counts a letter that differs only by blanks as the same data', () => {
    expect(normalizeLetter({ ...payload, subject: 'Betreff ' })).toEqual(normalizeLetter(payload))
  })
})

describe('renderOptions', () => {
  it('follows the current values of the letter', () => {
    expect(renderOptions({ ...payload, includeFoldMarks: false, language: 'en' })).toEqual({ font: 'Liberation Sans', accentColor: '#14213D', language: 'en', includeFoldMarks: false })
  })
})
