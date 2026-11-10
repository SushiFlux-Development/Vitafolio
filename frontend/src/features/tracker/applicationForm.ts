import { DEFAULT_DESIGN } from '../documents/useDocumentDesigns'
import type { Application, ApplicationPayload, ApplicationStatus, CvSelection } from '../../api/types'
import { EMPTY_SELECTION, normalizeSelection, selectionForPayload } from './cvSelection'

/** Without a follow-up date of its own, a sent application is due this many days after it was sent (the server's rule). */
export const DEFAULT_FOLLOW_UP_DAYS = 14

/** Everything the application form shows, as the text the fields hold. The same form creates and changes an application. */
export interface ApplicationForm {
  jobTitle: string
  company: string
  location: string
  salaryExpectation: string
  contactPerson: string
  contactEmail: string
  contactPhone: string
  jobPostingUrl: string
  status: ApplicationStatus
  /** The follow-up day as YYYY-MM-DD, or empty (then the 14-day rule applies). */
  followUpAt: string
  coverLetterId: string
  includeCoverSheet: boolean
  attachmentIds: string[]
  /** What the CV leaves out; empty = the complete master profile. */
  cvSelection: CvSelection
  cvDesign: string
  cvLanguage: 'de' | 'en'
  notes: string
}

export const EMPTY_APPLICATION_FORM: ApplicationForm = {
  jobTitle: '',
  company: '',
  location: '',
  salaryExpectation: '',
  contactPerson: '',
  contactEmail: '',
  contactPhone: '',
  jobPostingUrl: '',
  status: 'draft',
  followUpAt: '',
  coverLetterId: '',
  includeCoverSheet: true,
  attachmentIds: [],
  cvSelection: EMPTY_SELECTION,
  cvDesign: DEFAULT_DESIGN,
  cvLanguage: 'de',
  notes: '',
}

/** The calendar day (UTC, as the server stores it) of a date from the server, as YYYY-MM-DD; empty when there is none. */
export function dayOf(iso: string | null | undefined): string {
  if (!iso) return ''
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10)
}

/** The form filled with what an existing application holds. */
export function formFromApplication(application: Application): ApplicationForm {
  return {
    jobTitle: application.jobTitle,
    company: application.company,
    location: application.location ?? '',
    salaryExpectation: application.salaryExpectation ?? '',
    contactPerson: application.contactPerson ?? '',
    contactEmail: application.contactEmail ?? '',
    contactPhone: application.contactPhone ?? '',
    jobPostingUrl: application.jobPostingUrl ?? '',
    status: application.status,
    followUpAt: dayOf(application.followUpAt),
    coverLetterId: application.coverLetterId ?? '',
    includeCoverSheet: application.includeCoverSheet,
    attachmentIds: [...application.attachmentIds],
    cvSelection: normalizeSelection(application.cvSelection),
    cvDesign: application.cvDesign,
    cvLanguage: application.cvLanguage,
    notes: application.notes ?? '',
  }
}

const blank = (value: string) => value.trim() || null

/** The fields a new and a changed application have in common. */
function commonFields(form: ApplicationForm): ApplicationPayload {
  return {
    jobTitle: form.jobTitle.trim(),
    company: form.company.trim(),
    location: blank(form.location),
    contactPerson: blank(form.contactPerson),
    contactEmail: blank(form.contactEmail),
    contactPhone: blank(form.contactPhone),
    jobPostingUrl: blank(form.jobPostingUrl),
    salaryExpectation: blank(form.salaryExpectation),
    coverLetterId: form.coverLetterId || null,
    includeCoverSheet: form.includeCoverSheet,
    attachmentIds: form.attachmentIds,
    // Always sent: a form that is back at "complete" must clear an earlier selection (null), not leave it standing.
    cvSelection: selectionForPayload(form.cvSelection),
    cvDesign: form.cvDesign,
    cvLanguage: form.cvLanguage,
    notes: blank(form.notes),
  }
}

/** A follow-up day as the server wants it: the start of that day (UTC); empty = null. */
const followUpValue = (day: string) => (day.trim() === '' ? null : `${day.trim()}T00:00:00Z`)

export function toCreatePayload(form: ApplicationForm): ApplicationPayload {
  return { ...commonFields(form), status: form.status, followUpAt: followUpValue(form.followUpAt) }
}

/**
 * The body of a change (PUT replaces the editable fields as a whole). What the form does not show is carried over, because the server
 * clears an optional text left out: the job description. The status is not sent - it changes in the details, where the timeline notes it.
 * The day sent when the user did not touch the follow-up field is the stored value itself (it may carry a time of day the form cannot show);
 * the sent day (`appliedAt`) and the CV look options stay as they are because they are left out.
 */
export function toUpdatePayload(form: ApplicationForm, application: Application): ApplicationPayload {
  const untouched = form.followUpAt.trim() === dayOf(application.followUpAt)
  return {
    ...commonFields(form),
    jobDescription: application.jobDescription ?? null,
    followUpAt: untouched ? (application.followUpAt ?? null) : followUpValue(form.followUpAt),
  }
}
