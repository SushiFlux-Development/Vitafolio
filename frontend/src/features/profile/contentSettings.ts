import type { ContentSuggestion, CvContentSettings, CvLevel, CvSelection, Profile } from '../../api/types'

/** The three kinds of profile entry that have a level of their own (sections are one switch each, see `overrides.hiddenSections`). */
export type SettingsKind = 'experiences' | 'educations' | 'certificates'

/** Follows the suggestion everywhere: no own corrections. */
export const FOLLOW_SUGGESTION: CvContentSettings = {
  useSuggestion: true,
  overrides: { experiences: {}, educations: {}, certificates: {}, hiddenSections: [] },
}

/** Settings from the server (or none) as ones that can be edited; always a copy. A missing value means "follow the suggestion". */
export function normalizeSettings(settings: CvContentSettings | null | undefined): CvContentSettings {
  return {
    useSuggestion: settings?.useSuggestion ?? true,
    overrides: {
      experiences: { ...settings?.overrides?.experiences },
      educations: { ...settings?.overrides?.educations },
      certificates: { ...settings?.overrides?.certificates },
      hiddenSections: [...(settings?.overrides?.hiddenSections ?? [])],
    },
  }
}

/** What the server suggests for one entry; undefined when there is no suggestion (or none loaded yet). */
export function suggestedLevel(suggestion: ContentSuggestion | undefined, kind: SettingsKind, id: string): CvLevel | undefined {
  return suggestion?.[kind]?.find((entry) => entry.id === id)?.suggestion
}

/** What the suggestion means for an entry under these settings: the suggestion itself, or "in full" when the suggestion is switched off. */
function baseLevel(settings: CvContentSettings, suggestion: ContentSuggestion | undefined, kind: SettingsKind, id: string): CvLevel {
  return settings.useSuggestion ? (suggestedLevel(suggestion, kind, id) ?? 'full') : 'full'
}

/** The level an entry gets in the CV: the person's own correction, otherwise what the suggestion says. */
export function levelFor(settings: CvContentSettings, suggestion: ContentSuggestion | undefined, kind: SettingsKind, id: string): CvLevel {
  return settings.overrides[kind][id] ?? baseLevel(settings, suggestion, kind, id)
}

/** Sets the level of one entry as an own correction; a level that is what the suggestion says anyway removes the correction. */
export function withLevel(settings: CvContentSettings, suggestion: ContentSuggestion | undefined, kind: SettingsKind, id: string, level: CvLevel): CvContentSettings {
  const next: Record<string, CvLevel> = { ...settings.overrides[kind] }
  if (level === baseLevel(settings, suggestion, kind, id)) delete next[id]
  else next[id] = level
  return { ...settings, overrides: { ...settings.overrides, [kind]: next } }
}

/** Takes the own correction of one entry back: it follows the suggestion again. */
export function followSuggestionFor(settings: CvContentSettings, kind: SettingsKind, id: string): CvContentSettings {
  const next: Record<string, CvLevel> = { ...settings.overrides[kind] }
  delete next[id]
  return { ...settings, overrides: { ...settings.overrides, [kind]: next } }
}

export function withSectionHidden(settings: CvContentSettings, key: string, hidden: boolean): CvContentSettings {
  const rest = settings.overrides.hiddenSections.filter((existing) => existing !== key)
  return { ...settings, overrides: { ...settings.overrides, hiddenSections: hidden ? [...rest, key] : rest } }
}

/** "Show everything": the suggestion is off and nothing is left out by a correction either. */
export const showEverything = (): CvContentSettings => ({ ...FOLLOW_SUGGESTION, useSuggestion: false })

/** "Apply the suggestion" again: it decides, the own corrections stay as they are. */
export const applyTheSuggestion = (settings: CvContentSettings): CvContentSettings => ({ ...settings, useSuggestion: true })

/** Only the suggestion decides: every own correction is dropped. */
export const followSuggestionEverywhere = (): CvContentSettings => FOLLOW_SUGGESTION

/** The settings as the selection the content dialog edits: what each entry of the profile gets in the CV. */
export function selectionOf(profile: Profile, suggestion: ContentSuggestion | undefined, settings: CvContentSettings): CvSelection {
  const selection: CvSelection = { experiences: {}, educations: {}, certificates: {}, hiddenSections: [...settings.overrides.hiddenSections] }
  for (const entry of profile.experiences) {
    const level = levelFor(settings, suggestion, 'experiences', entry.id)
    if (level !== 'full') selection.experiences[entry.id] = level
  }
  for (const entry of profile.educations) {
    const level = levelFor(settings, suggestion, 'educations', entry.id)
    if (level !== 'full') selection.educations[entry.id] = level
  }
  for (const entry of profile.certificates) {
    if (levelFor(settings, suggestion, 'certificates', entry.id) === 'hidden') selection.certificates[entry.id] = 'hidden'
  }
  return selection
}

/** The dialog's selection back as settings: only what differs from the suggestion becomes an own correction. */
export function settingsFrom(previous: CvContentSettings, profile: Profile, suggestion: ContentSuggestion | undefined, selection: CvSelection): CvContentSettings {
  const overrides: CvContentSettings['overrides'] = { experiences: {}, educations: {}, certificates: {}, hiddenSections: [...selection.hiddenSections] }
  const decide = (kind: SettingsKind, id: string, level: CvLevel) => {
    if (level !== baseLevel(previous, suggestion, kind, id)) overrides[kind][id] = level as never
  }
  for (const entry of profile.experiences) decide('experiences', entry.id, selection.experiences[entry.id] ?? 'full')
  for (const entry of profile.educations) decide('educations', entry.id, selection.educations[entry.id] ?? 'full')
  for (const entry of profile.certificates) decide('certificates', entry.id, selection.certificates[entry.id] ?? 'full')
  return { useSuggestion: previous.useSuggestion, overrides }
}

/** One line of the list of what is left out or shortened (or shown against the suggestion). */
export interface ContentRow {
  kind: SettingsKind | 'section'
  id: string
  title: string
  where: string
  period: string
  /** What the CV does with it now. */
  level: CvLevel
  /** What the suggestion says (full for a section: the suggestion never leaves a section out). */
  suggested: CvLevel
  /** The reason code of the suggestion, if there is one. */
  reason: string | undefined
  /** The person's own correction, if there is one. */
  override: CvLevel | undefined
}

/** The rows that matter: everything that is left out or shortened, and everything shown against the suggestion. */
export const relevantRows = (rows: readonly ContentRow[]) => rows.filter((row) => row.level !== 'full' || row.override !== undefined)

export interface ContentCounts {
  hidden: number
  short: number
}

export function countRows(rows: readonly ContentRow[]): ContentCounts {
  return { hidden: rows.filter((row) => row.level === 'hidden').length, short: rows.filter((row) => row.level === 'short').length }
}
