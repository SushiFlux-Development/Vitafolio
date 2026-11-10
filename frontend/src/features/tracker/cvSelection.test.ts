import { describe, expect, it } from 'vitest'
import type { ContentSuggestion } from '../../api/types'
import {
  applyAttachmentSuggestion,
  applyEffective,
  applySuggestion,
  EMPTY_SELECTION,
  isAdjusted,
  isCompleteSelection,
  levelOf,
  normalizeSelection,
  selectionCounts,
  selectionForPayload,
  suggestedLevel,
  withCertificateHidden,
  withLevel,
  withSectionHidden,
} from './cvSelection'

const suggestion: ContentSuggestion = {
  yearsOfExperience: 14,
  stage: 'long',
  experiences: [
    { id: 'e1', suggestion: 'full', reason: 'recent' },
    { id: 'e2', suggestion: 'short', reason: 'older_than_10_years' },
    { id: 'e3', suggestion: 'hidden', reason: 'old_internship' },
  ],
  educations: [
    { id: 'd1', suggestion: 'full', reason: 'highest' },
    { id: 'd2', suggestion: 'short', reason: 'school' },
    { id: 'd3', suggestion: 'hidden', reason: 'below_highest_degree' },
  ],
  certificates: [
    { id: 'c1', suggestion: 'hidden', reason: 'older_than_10_years' },
    { id: 'c2', suggestion: 'full', reason: 'recent' },
  ],
  attachments: [
    { id: 'a1', suggestion: 'include', reason: 'recent_reference' },
    { id: 'a2', suggestion: 'omit', reason: 'school_report' },
  ],
  checklist: [],
}

describe('cv selection', () => {
  it('treats no selection and an empty one as the complete profile, and sends {} for it (the only value that clears a stored selection)', () => {
    expect(isCompleteSelection(null)).toBe(true)
    expect(isCompleteSelection(undefined)).toBe(true)
    expect(isCompleteSelection(EMPTY_SELECTION)).toBe(true)
    expect(selectionForPayload(EMPTY_SELECTION)).toEqual({})
    expect(selectionForPayload(withLevel(EMPTY_SELECTION, 'experiences', 'e1', 'short'))).toEqual({
      experiences: { e1: 'short' },
      educations: {},
      certificates: {},
      hiddenSections: [],
    })
  })

  it('reads a partial answer of the server without failing, and never hands out the object it was given', () => {
    const given = { experiences: { e1: 'hidden' as const } } as never
    const own = normalizeSelection(given)
    expect(own).toEqual({ experiences: { e1: 'hidden' }, educations: {}, certificates: {}, hiddenSections: [] })
    expect(own.experiences).not.toBe((given as { experiences: object }).experiences)
  })

  it('sets and clears levels; "full" is the absence of an entry', () => {
    const short = withLevel(EMPTY_SELECTION, 'educations', 'd1', 'short')
    expect(levelOf(short, 'educations', 'd1')).toBe('short')
    expect(levelOf(short, 'educations', 'other')).toBe('full')
    expect(isCompleteSelection(withLevel(short, 'educations', 'd1', 'full'))).toBe(true)
    // the original is not changed
    expect(EMPTY_SELECTION.educations).toEqual({})
  })

  it('switches certificates and sections off and on again', () => {
    const off = withSectionHidden(withCertificateHidden(EMPTY_SELECTION, 'c1', true), 'custom:g1', true)
    expect(off.certificates).toEqual({ c1: 'hidden' })
    expect(off.hiddenSections).toEqual(['custom:g1'])
    expect(isCompleteSelection(withSectionHidden(withCertificateHidden(off, 'c1', false), 'custom:g1', false))).toBe(true)
  })

  it('takes the suggestion for stations, educations and certificates and leaves the sections as they were', () => {
    const before = withSectionHidden(withCertificateHidden(withLevel(EMPTY_SELECTION, 'experiences', 'e1', 'hidden'), 'c2', true), 'interests', true)
    const after = applySuggestion(before, suggestion)
    expect(after.experiences).toEqual({ e2: 'short', e3: 'hidden' })
    expect(after.educations).toEqual({ d2: 'short', d3: 'hidden' })
    expect(after.certificates).toEqual({ c1: 'hidden' })
    expect(after.hiddenSections).toEqual(['interests'])
  })

  it('starts a new application from what the profile shows in its own CV (effective), and the sections it left out', () => {
    const withOwn: ContentSuggestion = {
      ...suggestion,
      educations: [
        { id: 'd1', suggestion: 'full', reason: 'highest' },
        { id: 'd3', suggestion: 'hidden', reason: 'below_highest_degree', effective: 'full', override: 'full' },
      ],
      experiences: [{ id: 'e2', suggestion: 'short', reason: 'older_than_10_years', effective: 'hidden', override: 'hidden' }],
      certificates: [{ id: 'c1', suggestion: 'full', reason: 'recent', effective: 'hidden' }],
    }
    expect(applyEffective(EMPTY_SELECTION, withOwn, ['skills'])).toEqual({
      experiences: { e2: 'hidden' },
      educations: {},
      certificates: { c1: 'hidden' },
      hiddenSections: ['skills'],
    })
    // an answer without `effective` falls back to the suggestion
    expect(applyEffective(EMPTY_SELECTION, suggestion).experiences).toEqual({ e2: 'short', e3: 'hidden' })
  })

  it('finds what the server suggests for one entry', () => {
    expect(suggestedLevel(suggestion, 'experiences', 'e3')).toBe('hidden')
    expect(suggestedLevel(suggestion, 'educations', 'd2')).toBe('short')
    expect(suggestedLevel(suggestion, 'educations', 'unknown')).toBeUndefined()
    expect(suggestedLevel(undefined, 'experiences', 'e1')).toBeUndefined()
  })

  it('counts only what the profile still has: a deleted entry leaves nothing out', () => {
    const selection = withCertificateHidden(withLevel(withLevel(EMPTY_SELECTION, 'experiences', 'e1', 'short'), 'experiences', 'gone', 'hidden'), 'gone', true)
    const known = { experiences: new Set(['e1']), educations: new Set<string>(), certificates: new Set<string>(), sections: new Set<string>() }
    expect(selectionCounts(selection, known)).toMatchObject({ experiencesShort: 1, experiencesHidden: 0, certificatesHidden: 0 })
    expect(isAdjusted(selection, known)).toBe(true)
    expect(isAdjusted(withLevel(EMPTY_SELECTION, 'experiences', 'gone', 'hidden'), known)).toBe(false)
  })

  it('counts what is left out', () => {
    const selection = withSectionHidden(
      withCertificateHidden(withLevel(withLevel(withLevel(EMPTY_SELECTION, 'experiences', 'e1', 'short'), 'experiences', 'e2', 'short'), 'experiences', 'e3', 'hidden'), 'c1', true),
      'skills',
      true,
    )
    expect(selectionCounts(selection)).toEqual({
      experiencesShort: 2,
      experiencesHidden: 1,
      educationsShort: 0,
      educationsHidden: 0,
      certificatesHidden: 1,
      sectionsHidden: 1,
    })
  })

  it('takes the attachment suggestion: recommended ones in, advised-against ones out, unmentioned ones keep their choice', () => {
    expect(applyAttachmentSuggestion(['a2', 'x'], suggestion).sort()).toEqual(['a1', 'x'])
    expect(applyAttachmentSuggestion([], suggestion)).toEqual(['a1'])
  })
})
