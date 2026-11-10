import type { ContentSuggestion, CvSelection, Profile } from '../../api/types'

/** How much of a station or education the CV shows: everything, without its description, or not at all. */
export type EntryLevel = 'full' | 'short' | 'hidden'

/** The kinds of entry that have the three levels. */
export type LeveledKind = 'experiences' | 'educations'

/** The parts of the profile that are one switch each (a custom section is `custom:<guid>`). */
export const FIXED_SECTIONS = ['summary', 'skills', 'languages', 'interests'] as const

export const customSectionKey = (id: string) => `custom:${id}`

/** The complete master profile: nothing is left out. */
export const EMPTY_SELECTION: CvSelection = {
  experiences: {},
  educations: {},
  certificates: {},
  hiddenSections: [],
}

/** A selection from the server (or none) as one the form can edit; always a copy, never the object of the cache. */
export function normalizeSelection(selection: CvSelection | null | undefined): CvSelection {
  return {
    experiences: { ...selection?.experiences },
    educations: { ...selection?.educations },
    certificates: { ...selection?.certificates },
    hiddenSections: [...(selection?.hiddenSections ?? [])],
  }
}

/** Whether nothing is left out. */
export function isCompleteSelection(selection: CvSelection | null | undefined): boolean {
  if (!selection) return true
  return (
    Object.keys(selection.experiences ?? {}).length === 0 &&
    Object.keys(selection.educations ?? {}).length === 0 &&
    Object.keys(selection.certificates ?? {}).length === 0 &&
    (selection.hiddenSections ?? []).length === 0
  )
}

/**
 * What the form sends. The complete profile is `{}`: the server treats a missing or null selection as "unchanged" on a change, so only
 * `{}` clears an earlier selection (and on creating it means complete, as before).
 */
export function selectionForPayload(selection: CvSelection): Partial<CvSelection> {
  return isCompleteSelection(selection) ? {} : normalizeSelection(selection)
}

export function levelOf(selection: CvSelection, kind: LeveledKind, id: string): EntryLevel {
  return selection[kind][id] ?? 'full'
}

export function withLevel(selection: CvSelection, kind: LeveledKind, id: string, level: EntryLevel): CvSelection {
  const next = { ...selection[kind] }
  if (level === 'full') delete next[id]
  else next[id] = level
  return { ...selection, [kind]: next }
}

export const certificateHidden = (selection: CvSelection, id: string) => selection.certificates[id] === 'hidden'

export function withCertificateHidden(selection: CvSelection, id: string, hidden: boolean): CvSelection {
  const next = { ...selection.certificates }
  if (hidden) next[id] = 'hidden'
  else delete next[id]
  return { ...selection, certificates: next }
}

export const sectionHidden = (selection: CvSelection, key: string) => selection.hiddenSections.includes(key)

export function withSectionHidden(selection: CvSelection, key: string, hidden: boolean): CvSelection {
  const rest = selection.hiddenSections.filter((existing) => existing !== key)
  return { ...selection, hiddenSections: hidden ? [...rest, key] : rest }
}

/**
 * The selection after "take the suggestion": stations, educations and certificates follow the server (an entry the server wants in full
 * is simply not listed). Sections have no date, so they are not part of the suggestion and stay as the user chose. Every value stays
 * editable afterwards.
 */
export function applySuggestion(selection: CvSelection, suggestion: ContentSuggestion): CvSelection {
  return withLevels(selection, suggestion, (entry) => entry.suggestion)
}

/**
 * The selection a NEW application starts with: what the master profile shows in its own CV (the suggestion together with the person's
 * own corrections, `effective` of every entry), and the sections the person left out there. An answer without `effective` falls back
 * to the suggestion.
 */
export function applyEffective(selection: CvSelection, suggestion: ContentSuggestion, hiddenSections: readonly string[] = []): CvSelection {
  return { ...withLevels(selection, suggestion, (entry) => entry.effective ?? entry.suggestion), hiddenSections: [...hiddenSections] }
}

type LevelOf = (entry: { suggestion: string; effective?: string | undefined }) => string

function withLevels(selection: CvSelection, suggestion: ContentSuggestion, pick: LevelOf): CvSelection {
  const experiences: CvSelection['experiences'] = {}
  for (const entry of suggestion.experiences) {
    const level = pick(entry)
    if (level === 'short' || level === 'hidden') experiences[entry.id] = level
  }
  const educations: CvSelection['educations'] = {}
  for (const entry of suggestion.educations) {
    const level = pick(entry)
    if (level === 'short' || level === 'hidden') educations[entry.id] = level
  }
  const certificates: CvSelection['certificates'] = {}
  for (const entry of suggestion.certificates ?? []) {
    if (pick(entry) === 'hidden') certificates[entry.id] = 'hidden'
  }
  return { ...selection, experiences, educations, certificates }
}

/** Whether the server wants this certificate left out; undefined when it has no suggestion for it. */
export function suggestedCertificateHidden(suggestion: ContentSuggestion | undefined, id: string): boolean | undefined {
  const entry = suggestion?.certificates?.find((each) => each.id === id)
  return entry ? entry.suggestion === 'hidden' : undefined
}

/** The level the server suggests for an entry; undefined when it has no suggestion for it. */
export function suggestedLevel(suggestion: ContentSuggestion | undefined, kind: LeveledKind, id: string): EntryLevel | undefined {
  return suggestion?.[kind].find((entry) => entry.id === id)?.suggestion
}

/** The counts the short summary of a selection is made of. */
export interface SelectionCounts {
  experiencesShort: number
  experiencesHidden: number
  educationsShort: number
  educationsHidden: number
  certificatesHidden: number
  sectionsHidden: number
}

/** The ids the master profile has today, so a selection counts only what still exists (a deleted entry leaves nothing out). */
export interface KnownIds {
  experiences: ReadonlySet<string>
  educations: ReadonlySet<string>
  certificates: ReadonlySet<string>
  sections: ReadonlySet<string>
}

export function knownIdsOf(profile: Profile): KnownIds {
  const sections = new Set<string>()
  if (profile.bio?.trim()) sections.add('summary')
  if (profile.skills.length > 0) sections.add('skills')
  if (profile.languages.length > 0) sections.add('languages')
  if (profile.interests.length > 0) sections.add('interests')
  for (const section of profile.customSections) sections.add(customSectionKey(section.id))
  return {
    experiences: new Set(profile.experiences.map((entry) => entry.id)),
    educations: new Set(profile.educations.map((entry) => entry.id)),
    certificates: new Set(profile.certificates.map((entry) => entry.id)),
    sections,
  }
}

const countOf = (record: Record<string, string>, level: string, known?: ReadonlySet<string>) =>
  Object.entries(record).filter(([id, value]) => value === level && (known === undefined || known.has(id))).length

/** The counts of a selection; with `known` only entries that still exist in the profile are counted. */
export function selectionCounts(selection: CvSelection | null | undefined, known?: KnownIds): SelectionCounts {
  const own = normalizeSelection(selection)
  return {
    experiencesShort: countOf(own.experiences, 'short', known?.experiences),
    experiencesHidden: countOf(own.experiences, 'hidden', known?.experiences),
    educationsShort: countOf(own.educations, 'short', known?.educations),
    educationsHidden: countOf(own.educations, 'hidden', known?.educations),
    certificatesHidden: countOf(own.certificates, 'hidden', known?.certificates),
    sectionsHidden: known ? own.hiddenSections.filter((key) => known.sections.has(key)).length : own.hiddenSections.length,
  }
}

/** Whether the selection leaves anything out that the profile still has. */
export const isAdjusted = (selection: CvSelection | null | undefined, known?: KnownIds) =>
  Object.values(selectionCounts(selection, known)).some((count) => count > 0)

/**
 * The attachments after "take the suggestion": the recommended ones are in, the ones the server advises against are out. An
 * attachment the suggestion does not mention keeps whatever the user chose.
 */
export function applyAttachmentSuggestion(selectedIds: readonly string[], suggestion: ContentSuggestion): string[] {
  const include = new Set(suggestion.attachments.filter((entry) => entry.suggestion === 'include').map((entry) => entry.id))
  const omit = new Set(suggestion.attachments.filter((entry) => entry.suggestion === 'omit').map((entry) => entry.id))
  return [...new Set([...selectedIds.filter((id) => !omit.has(id)), ...include])]
}
