import { describe, expect, it } from 'vitest'
import type { ContentSuggestion, Profile } from '../../api/types'
import { applyTheSuggestion, FOLLOW_SUGGESTION, followSuggestionFor, levelFor, normalizeSettings, selectionOf, settingsFrom, showEverything, withLevel, withSectionHidden } from './contentSettings'

// Invented data only.
const profile = {
  experiences: [{ id: 'e1' }, { id: 'e2' }],
  educations: [{ id: 'd1' }],
  certificates: [{ id: 'c1' }],
} as unknown as Profile

const suggestion: ContentSuggestion = {
  yearsOfExperience: 14,
  stage: 'long',
  experiences: [
    { id: 'e1', suggestion: 'full', reason: 'recent' },
    { id: 'e2', suggestion: 'short', reason: 'older_than_10_years' },
  ],
  educations: [{ id: 'd1', suggestion: 'hidden', reason: 'below_highest_degree' }],
  certificates: [{ id: 'c1', suggestion: 'hidden', reason: 'older_than_10_years' }],
  attachments: [],
  checklist: [],
}

describe('content settings of the master profile', () => {
  it('reads a missing value as "follow the suggestion" and hands out copies only', () => {
    expect(normalizeSettings(null)).toEqual(FOLLOW_SUGGESTION)
    const given = { useSuggestion: false, overrides: { experiences: { e1: 'hidden' as const } } } as never
    const own = normalizeSettings(given)
    expect(own).toEqual({ useSuggestion: false, overrides: { experiences: { e1: 'hidden' }, educations: {}, certificates: {}, hiddenSections: [] } })
    expect(own.overrides.experiences).not.toBe((given as { overrides: { experiences: object } }).overrides.experiences)
  })

  it('gives an entry its own correction, otherwise the suggestion, and everything in full when the suggestion is off', () => {
    expect(levelFor(FOLLOW_SUGGESTION, suggestion, 'educations', 'd1')).toBe('hidden')
    expect(levelFor(FOLLOW_SUGGESTION, suggestion, 'educations', 'unknown')).toBe('full')
    const shown = withLevel(FOLLOW_SUGGESTION, suggestion, 'educations', 'd1', 'full')
    expect(levelFor(shown, suggestion, 'educations', 'd1')).toBe('full')
    expect(levelFor(showEverything(), suggestion, 'educations', 'd1')).toBe('full')
  })

  it('removes a correction that says what the suggestion says anyway, and can take one back', () => {
    const shown = withLevel(FOLLOW_SUGGESTION, suggestion, 'educations', 'd1', 'full')
    expect(shown.overrides.educations).toEqual({ d1: 'full' })
    expect(withLevel(shown, suggestion, 'educations', 'd1', 'hidden').overrides.educations).toEqual({})
    expect(followSuggestionFor(shown, 'educations', 'd1').overrides.educations).toEqual({})
    // the original is not changed
    expect(FOLLOW_SUGGESTION.overrides.educations).toEqual({})
  })

  it('shows the settings as the selection of the dialog, and turns the dialog\'s selection back into corrections only where it differs', () => {
    const selection = selectionOf(profile, suggestion, FOLLOW_SUGGESTION)
    expect(selection).toEqual({ experiences: { e2: 'short' }, educations: { d1: 'hidden' }, certificates: { c1: 'hidden' }, hiddenSections: [] })
    // nothing changed: no corrections
    expect(settingsFrom(FOLLOW_SUGGESTION, profile, suggestion, selection)).toEqual(FOLLOW_SUGGESTION)
    // the school certificate shown, the old job left out, a section left out
    const edited = { ...selection, experiences: { e2: 'hidden' as const }, educations: {}, hiddenSections: ['skills'] }
    expect(settingsFrom(FOLLOW_SUGGESTION, profile, suggestion, edited)).toEqual({
      useSuggestion: true,
      overrides: { experiences: { e2: 'hidden' }, educations: { d1: 'full' }, certificates: {}, hiddenSections: ['skills'] },
    })
  })

  it('shows everything, applies the suggestion again, and switches sections', () => {
    expect(showEverything()).toEqual({ useSuggestion: false, overrides: FOLLOW_SUGGESTION.overrides })
    const own = withSectionHidden(showEverything(), 'summary', true)
    expect(applyTheSuggestion(own)).toEqual({ useSuggestion: true, overrides: { ...FOLLOW_SUGGESTION.overrides, hiddenSections: ['summary'] } })
    expect(withSectionHidden(own, 'summary', false).overrides.hiddenSections).toEqual([])
  })
})
