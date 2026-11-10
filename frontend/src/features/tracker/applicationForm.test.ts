import { describe, expect, it } from 'vitest'
import type { Application } from '../../api/types'
import { dayOf, EMPTY_APPLICATION_FORM, formFromApplication, toCreatePayload, toUpdatePayload } from './applicationForm'

const application: Application = {
  id: 'a1',
  jobTitle: 'Engineer',
  company: 'Acme',
  location: null,
  contactPerson: null,
  contactEmail: null,
  contactPhone: null,
  jobPostingUrl: null,
  jobDescription: 'Long text of the posting',
  salaryExpectation: null,
  status: 'applied',
  appliedAt: '2026-10-01T00:00:00Z',
  followUpAt: null,
  isFollowUpDue: false,
  coverLetterId: null,
  coverLetterTitle: null,
  cvDesign: 'plain',
  cvAccentColor: '#14213D',
  cvFont: 'Roboto',
  cvLanguage: 'en',
  cvShowPhoto: false,
  cvPhotoShape: 'round',
  includeCoverSheet: true,
  attachmentIds: ['x', 'y'],
  hasArchivedPdf: false,
  notes: null,
  createdAt: '2026-10-01T00:00:00Z',
  updatedAt: '2026-10-01T00:00:00Z',
  events: [],
}

describe('application form model', () => {
  it('reads the day of a stored date as the server keeps it (UTC)', () => {
    expect(dayOf('2026-11-20T00:00:00Z')).toBe('2026-11-20')
    expect(dayOf('2026-11-20T23:59:59Z')).toBe('2026-11-20')
    expect(dayOf(null)).toBe('')
    expect(dayOf('not a date')).toBe('')
  })

  it('fills the form from an application, with empty text for what is missing', () => {
    const form = formFromApplication(application)
    expect(form).toMatchObject({ jobTitle: 'Engineer', location: '', followUpAt: '', coverLetterId: '', cvDesign: 'plain', cvLanguage: 'en', attachmentIds: ['x', 'y'] })
    // A copy: changing the checkboxes must never change the application itself.
    expect(form.attachmentIds).not.toBe(application.attachmentIds)
  })

  it('creates with the status and the follow-up day, and no job description', () => {
    const payload = toCreatePayload({ ...EMPTY_APPLICATION_FORM, jobTitle: ' Dev ', company: 'Tech', status: 'applied', followUpAt: '2026-12-24' })
    expect(payload).toMatchObject({ jobTitle: 'Dev', status: 'applied', followUpAt: '2026-12-24T00:00:00Z', location: null, notes: null })
    expect(payload).not.toHaveProperty('jobDescription')
  })

  it('changes without sending the status or the sent day, and carries the job description along', () => {
    const payload = toUpdatePayload(formFromApplication(application), application)
    expect(payload).not.toHaveProperty('status')
    expect(payload).not.toHaveProperty('appliedAt')
    expect(payload.jobDescription).toBe('Long text of the posting')
    expect(payload.followUpAt).toBeNull()
  })

  it('sends {} for the complete profile (null would mean "unchanged" on a change), also when a selection was cleared, and the selection otherwise', () => {
    const complete = formFromApplication(application)
    expect(complete.cvSelection).toEqual({ experiences: {}, educations: {}, certificates: {}, hiddenSections: [] })
    expect(toCreatePayload({ ...EMPTY_APPLICATION_FORM, jobTitle: 'Dev', company: 'Tech' }).cvSelection).toEqual({})
    expect(toUpdatePayload(complete, application).cvSelection).toEqual({})

    const adjusted = { ...application, cvSelection: { experiences: { e1: 'short' as const }, educations: {}, certificates: {}, hiddenSections: ['skills'] } }
    const form = formFromApplication(adjusted)
    expect(toUpdatePayload(form, adjusted).cvSelection).toEqual(adjusted.cvSelection)
    // The form's copy is its own: editing it never changes the application.
    expect(form.cvSelection.experiences).not.toBe(adjusted.cvSelection.experiences)
    expect(toUpdatePayload({ ...form, cvSelection: complete.cvSelection }, adjusted).cvSelection).toEqual({})
  })

  it('keeps an untouched follow-up exactly as stored, and turns an edited one into the start of that day', () => {
    const withFollowUp = { ...application, followUpAt: '2026-11-20T14:30:00Z' }
    const form = formFromApplication(withFollowUp)
    expect(toUpdatePayload(form, withFollowUp).followUpAt).toBe('2026-11-20T14:30:00Z')
    expect(toUpdatePayload({ ...form, followUpAt: '2026-11-21' }, withFollowUp).followUpAt).toBe('2026-11-21T00:00:00Z')
    expect(toUpdatePayload({ ...form, followUpAt: '' }, withFollowUp).followUpAt).toBeNull()
  })
})
