import { useTranslation } from 'react-i18next'
import type { GuideExplain, GuidePlanKind, GuideRegion, GuideSituation } from '../../api/types'
import type { YearsChoiceId } from './model'
import type { BlockId, ExternalLinkId, ItemId, ItemKind, LinkId } from './plan'
import { contentDe } from './content.de'
import { contentEn } from './content.en'

/**
 * All wording of the guide, one typed file per language (content.de.ts, content.en.ts). The rules that decide which item shows for
 * which answers are in plan.ts and only name ids; a missing text in either language is a compile error, not a blank on screen.
 * The advice itself is taken from chapter 22 of the manual and its research notes - change it there first.
 */
export interface ItemText {
  text: string
  /** A short list under the text. */
  points?: readonly string[]
}

interface OptionText {
  label: string
  description?: string
}

interface QuestionText<T extends string> {
  title: string
  hint: string
  options: Record<T, OptionText>
}

/** A set of answers to show as an example in the overview ("all situations"). */
export type OverviewId = 'school' | 'training' | 'some' | 'long' | 'switch' | 'returning' | 'sensitive' | 'uk' | 'us'

export interface GuideContent {
  title: string
  subtitle: string
  loading: string
  loadFailed: string
  retry: string
  intro: {
    heading: string
    text: string
    points: readonly string[]
    start: string
    overview: string
  }
  wizard: {
    label: string
    cancel: string
    back: string
    next: string
    finish: string
    finishing: string
    /** "Question 2 of 5". */
    stepOf: (current: number, total: number) => string
    /** The first question, before the number of questions is known. */
    stepFirst: string
    saveFailed: string
    situation: QuestionText<GuideSituation>
    years: {
      title: Record<'working' | 'returning', string>
      hint: Record<'working' | 'returning', string>
      choices: Record<YearsChoiceId, string>
      choicesLabel: string
      fieldLabel: string
      fieldHint: string
      unit: string
      invalid: string
      range: (max: number) => string
      required: string
    }
    plan: QuestionText<Exclude<GuidePlanKind, 'first_job'>>
    explain: QuestionText<GuideExplain | 'none'>
    region: QuestionText<GuideRegion>
  }
  plan: {
    heading: string
    changeAnswers: string
    overview: string
    answersLabel: string
    /** The sentence about the figures and the legal status, shown under the plan. */
    /** Heading above the explanation of the badges ("Rule of thumb", "Recommendation" ...). */
    legendTitle: string
    disclaimerTitle: string
    disclaimer: string
    sourcesTitle: string
    sources: string
    /** "Open in the app" - the label above a block's links. */
    goTo: string
    externalHint: string
  }
  overview: {
    heading: string
    intro: string
    back: string
    tabsLabel: string
    tabs: Record<OverviewId, string>
    note: string
    /** Heading above the example answers of one tab. */
    exampleLabel: string
    examples: Record<OverviewId, string>
  }
  summary: {
    situation: Record<GuideSituation, string>
    plan: Record<GuidePlanKind, string>
    region: Record<GuideRegion, string>
    years: (years: number) => string
    explainNone: string
    explain: Record<GuideExplain, string>
  }
  kinds: Record<ItemKind, string>
  kindHelp: Record<ItemKind, string>
  blocks: Record<BlockId, { title: string; intro: string }>
  items: Record<ItemId, ItemText>
  links: Record<LinkId, string>
  externalLinks: Record<ExternalLinkId, string>
}

/** The wording for the interface language (German unless the interface is English). */
export function useGuideContent(): GuideContent {
  const { i18n } = useTranslation()
  return contentFor(i18n.resolvedLanguage ?? i18n.language)
}

export function contentFor(language: string): GuideContent {
  return language.startsWith('en') ? contentEn : contentDe
}
