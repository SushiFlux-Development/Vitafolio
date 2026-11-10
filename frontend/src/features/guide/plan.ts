import type { GuideAnswers, GuideExplain } from '../../api/types'

/**
 * The rules of the guide: which building blocks of advice apply to which answers. Pure functions, no texts - a block holds ids,
 * the wording lives in the content of each language (content.de.ts / content.en.ts). Every rule rests on chapter 22 of the manual
 * and its research notes; nothing is added on top. How firm a statement is stays visible as its {@link ItemKind}.
 */

/** How the working life so far is rated, in the same three steps the application's CV-content suggestion uses. */
export type GuideTier = 'entry' | 'some' | 'long'

/**
 * How firm an item is, shown as a badge so a rule of thumb is never taken for a rule:
 * rule = the sources agree; ruleOfThumb = a figure from guides, not a regulation; recommendation = our reading, a guide's advice;
 * disputed = the sources contradict each other (both sides are said); thin = a single source; unproven = no source found;
 * app = what the app offers here.
 */
export type ItemKind = 'rule' | 'ruleOfThumb' | 'recommendation' | 'disputed' | 'thin' | 'unproven' | 'app' | 'example'

export const BLOCK_IDS = ['contents', 'region', 'cvStructure', 'trim', 'attachments', 'coverLetter', 'sensitive', 'findData'] as const
export type BlockId = (typeof BLOCK_IDS)[number]

export const ITEM_IDS = [
  'contents.order',
  'contents.coverLetter',
  'contents.coverSheet',
  'contents.thirdPageEntry',
  'contents.thirdPage',
  'contents.samples',
  'contents.digital',
  'contents.files',
  'contents.abroad',
  'region.language',
  'region.ukTerm',
  'region.ukPrivate',
  'region.ukSections',
  'region.ukApp',
  'region.ukUnknown',
  'region.usTerm',
  'region.usUnknown',
  'cv.form',
  'cv.sections',
  'cv.profileEntry',
  'cv.profileSwitch',
  'cv.profileOptional',
  'cv.lengthEntry',
  'cv.lengthSome',
  'cv.lengthLong',
  'cv.lengthUk',
  'cv.lengthUsEntry',
  'cv.lengthUsMore',
  'cv.template',
  'cv.ats',
  'cv.personalCore',
  'cv.personalOptional',
  'trim.relevance',
  'trim.entrySchool',
  'trim.entryTraining',
  'trim.some',
  'trim.someDegree',
  'trim.someInternships',
  'trim.long',
  'trim.long20',
  'trim.long30',
  'trim.longDrop',
  'trim.newField',
  'trim.returning',
  'trim.personalNever',
  'trim.interests',
  'trim.interestsUs',
  'trim.app',
  'att.school',
  'att.training',
  'att.schoolReports',
  'att.some',
  'att.long',
  'att.noSchool',
  'att.never',
  'att.count',
  'att.order',
  'att.list',
  'att.file',
  'att.email',
  'att.uk',
  'att.us',
  'cl.purpose',
  'cl.length',
  'cl.paragraphs',
  'cl.musts',
  'cl.never',
  'cl.switchReason',
  'cl.switchExample',
  'cl.entry',
  'cl.sensitive',
  'cl.language',
  'cl.abroadNote',
  'sens.honest',
  'sens.gap',
  'sens.unemployment',
  'sens.parental_leave',
  'sens.illness',
  'sens.dropped_out',
  'sens.frequent_changes',
  'sens.abroadNote',
  'find.dates',
  'find.documents',
  'find.drv',
] as const
export type ItemId = (typeof ITEM_IDS)[number]

/** Places inside the app a block can lead to. */
export const LINK_TARGETS = {
  profilePersonal: '/profile?tab=personal',
  profileExperiences: '/profile?tab=experiences',
  profileEducations: '/profile?tab=educations',
  profilePreview: '/profile?tab=preview',
  coverLetters: '/cover-letters',
  applications: '/applications',
} as const
export type LinkId = keyof typeof LINK_TARGETS

/** Pages outside the app that an item points to (opened in the browser). */
export const EXTERNAL_LINK_TARGETS = {
  drvRequest: 'https://www.deutsche-rentenversicherung.de/DRV/DE/Online-Services/informationen_anfordern',
  drvGlossary: 'https://www.deutsche-rentenversicherung.de/SharedDocs/Glossareintraege/DE/V/versicherungsverlauf',
} as const
export type ExternalLinkId = keyof typeof EXTERNAL_LINK_TARGETS

export interface PlanItem {
  id: ItemId
  kind: ItemKind
  external?: readonly ExternalLinkId[]
}

export interface PlanBlock {
  id: BlockId
  items: readonly PlanItem[]
  links: readonly LinkId[]
}

export interface GuidePlan {
  tier: GuideTier
  blocks: readonly PlanBlock[]
}

/**
 * Entry = no working years (just finished school, training or studies, or zero years); some = under 10 years; long = 10 and more.
 * The bounds are the manual's rules of thumb ("bis etwa 10", "10 bis 20 Jahre und mehr"). An unknown number of years for somebody
 * who has worked counts as "some", the middle step.
 */
export function tierOf(answers: GuideAnswers): GuideTier {
  if (answers.situation === 'school' || answers.situation === 'training_or_studies') return 'entry'
  const years = answers.yearsOfExperience
  if (years === null) return 'some'
  if (years === 0) return 'entry'
  return years >= 10 ? 'long' : 'some'
}

const item = (id: ItemId, kind: ItemKind, external?: readonly ExternalLinkId[]): PlanItem => (external ? { id, kind, external } : { id, kind })

/** The sensitive-point items in the order the manual lists them. */
const SENSITIVE_KINDS: Record<GuideExplain, ItemKind> = {
  gap: 'disputed',
  unemployment: 'rule',
  parental_leave: 'rule',
  illness: 'disputed',
  dropped_out: 'thin',
  frequent_changes: 'disputed',
}
const SENSITIVE_ORDER: readonly GuideExplain[] = ['gap', 'unemployment', 'parental_leave', 'illness', 'dropped_out', 'frequent_changes']

/** The plan for a set of answers: only blocks and items that apply to this person, in reading order. */
export function buildPlan(answers: GuideAnswers): GuidePlan {
  const tier = tierOf(answers)
  const { situation, region } = answers
  const de = region === 'de'
  const uk = region === 'uk'
  const us = region === 'us'
  const entry = tier === 'entry'
  const years = answers.yearsOfExperience ?? 0
  const switching = answers.plan === 'new_field'
  const hasSensitive = answers.explain.length > 0

  const contents: PlanItem[] = []
  if (de) contents.push(item('contents.order', 'rule'))
  contents.push(item('contents.coverLetter', 'rule'))
  if (de) {
    contents.push(item('contents.coverSheet', 'disputed'))
    contents.push(entry ? item('contents.thirdPageEntry', 'rule') : item('contents.thirdPage', 'disputed'))
    contents.push(item('contents.samples', 'rule'))
  }
  contents.push(item('contents.digital', 'rule'), item('contents.files', 'disputed'))
  if (!de) contents.push(item('contents.abroad', 'thin'))

  const abroad: PlanItem[] = []
  if (uk) {
    abroad.push(item('region.ukTerm', 'rule'), item('region.ukPrivate', 'rule'), item('region.ukSections', 'rule'), item('region.ukUnknown', 'thin'))
    abroad.push(item('region.language', 'app'), item('region.ukApp', 'app'))
  }
  if (us) {
    abroad.push(item('region.usTerm', 'rule'), item('region.usUnknown', 'unproven'), item('region.language', 'app'))
  }

  const structure: PlanItem[] = []
  if (de) structure.push(item('cv.form', 'rule'), item('cv.sections', 'rule'))
  if (switching) structure.push(item('cv.profileSwitch', 'thin'))
  else if (entry) structure.push(item('cv.profileEntry', 'thin'))
  else structure.push(item('cv.profileOptional', 'thin'))
  if (de) structure.push(entry ? item('cv.lengthEntry', 'ruleOfThumb') : tier === 'some' ? item('cv.lengthSome', 'recommendation') : item('cv.lengthLong', 'disputed'))
  if (uk) structure.push(item('cv.lengthUk', 'rule'))
  if (us) structure.push(entry ? item('cv.lengthUsEntry', 'rule') : item('cv.lengthUsMore', 'unproven'))
  structure.push(item('cv.template', 'recommendation'), item('cv.ats', 'recommendation'))
  if (de) structure.push(item('cv.personalCore', 'rule'), item('cv.personalOptional', 'disputed'))

  const trim: PlanItem[] = [item('trim.relevance', 'rule')]
  if (entry) trim.push(situation === 'school' ? item('trim.entrySchool', 'ruleOfThumb') : item('trim.entryTraining', 'ruleOfThumb'))
  if (tier === 'some') {
    trim.push(item('trim.some', 'ruleOfThumb'))
    if (years >= 5) trim.push(item('trim.someDegree', 'ruleOfThumb'))
    trim.push(item('trim.someInternships', 'ruleOfThumb'))
  }
  if (tier === 'long') {
    trim.push(item('trim.long', 'ruleOfThumb'))
    if (years > 20) trim.push(item('trim.long20', 'ruleOfThumb'))
    if (years > 30) trim.push(item('trim.long30', 'ruleOfThumb'))
    trim.push(item('trim.longDrop', 'ruleOfThumb'))
  }
  if (switching) trim.push(item('trim.newField', 'recommendation'))
  if (situation === 'returning') trim.push(item('trim.returning', 'thin'))
  if (de) trim.push(item('trim.personalNever', 'rule'), item('trim.interests', 'rule'))
  if (us) trim.push(item('trim.interestsUs', 'thin'))
  trim.push(item('trim.app', 'app'))

  const attachments: PlanItem[] = []
  if (de) {
    if (situation === 'school') attachments.push(item('att.school', 'ruleOfThumb'))
    else if (entry) attachments.push(item('att.training', 'ruleOfThumb'), item('att.schoolReports', 'disputed'))
    else if (tier === 'some') attachments.push(item('att.some', 'ruleOfThumb'), item('att.noSchool', 'recommendation'))
    else attachments.push(item('att.long', 'ruleOfThumb'), item('att.noSchool', 'recommendation'))
    attachments.push(item('att.count', 'thin'), item('att.never', 'rule'), item('att.order', 'recommendation'), item('att.list', 'disputed'))
  }
  if (uk) attachments.push(item('att.uk', 'thin'))
  if (us) attachments.push(item('att.us', 'unproven'))
  attachments.push(item('att.file', 'ruleOfThumb'), item('att.email', 'thin'))

  const coverLetter: PlanItem[] = [item('cl.purpose', 'rule'), item('cl.length', 'recommendation'), item('cl.paragraphs', 'recommendation'), item('cl.musts', 'rule'), item('cl.never', 'rule')]
  if (switching) coverLetter.push(item('cl.switchReason', 'rule'), item('cl.switchExample', 'example'))
  if (entry && !switching) coverLetter.push(item('cl.entry', 'thin'))
  if (hasSensitive) coverLetter.push(item('cl.sensitive', 'rule'))
  if (!de) coverLetter.push(item('cl.language', 'app'), item('cl.abroadNote', 'thin'))

  const sensitive: PlanItem[] = []
  if (hasSensitive) {
    sensitive.push(item('sens.honest', 'rule'))
    for (const key of SENSITIVE_ORDER) if (answers.explain.includes(key)) sensitive.push(item(`sens.${key}`, SENSITIVE_KINDS[key]))
    if (!de) sensitive.push(item('sens.abroadNote', 'thin'))
  }

  const findData: PlanItem[] = [item('find.dates', 'ruleOfThumb'), item('find.documents', 'rule')]
  if (de) findData.push(item('find.drv', 'rule', ['drvRequest', 'drvGlossary']))

  const blocks: PlanBlock[] = [
    { id: 'contents', items: contents, links: ['applications'] },
    ...(abroad.length > 0 ? [{ id: 'region' as const, items: abroad, links: ['profilePreview', 'coverLetters'] as const }] : []),
    { id: 'cvStructure', items: structure, links: ['profilePersonal', 'profilePreview'] },
    { id: 'trim', items: trim, links: ['profileExperiences', 'applications'] },
    { id: 'attachments', items: attachments, links: ['applications'] },
    { id: 'coverLetter', items: coverLetter, links: ['coverLetters'] },
    ...(sensitive.length > 0 ? [{ id: 'sensitive' as const, items: sensitive, links: ['profileExperiences'] as const }] : []),
    { id: 'findData', items: findData, links: ['profileExperiences', 'profileEducations'] },
  ]
  return { tier, blocks }
}
