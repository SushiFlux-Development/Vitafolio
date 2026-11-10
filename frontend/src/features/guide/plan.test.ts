import { describe, expect, it } from 'vitest'
import type { GuideAnswers } from '../../api/types'
import { OVERVIEW_EXAMPLES, OVERVIEW_IDS } from './overview'
import { BLOCK_IDS, EXTERNAL_LINK_TARGETS, LINK_TARGETS, buildPlan, tierOf } from './plan'
import type { ItemId } from './plan'

const answers = (change: Partial<GuideAnswers> = {}): GuideAnswers => ({
  situation: 'working',
  yearsOfExperience: 3,
  plan: 'same_field',
  explain: [],
  region: 'de',
  ...change,
})

const SCHOOL = answers({ situation: 'school', yearsOfExperience: null, plan: 'first_job' })
const TRAINING = answers({ situation: 'training_or_studies', yearsOfExperience: null, plan: 'first_job' })

const itemsOf = (given: GuideAnswers): ItemId[] => buildPlan(given).blocks.flatMap((block) => block.items.map((item) => item.id))
const blocksOf = (given: GuideAnswers) => buildPlan(given).blocks.map((block) => block.id)
const kindOf = (given: GuideAnswers, id: ItemId) => buildPlan(given).blocks.flatMap((block) => block.items).find((item) => item.id === id)?.kind

describe('the step of working life', () => {
  it('is "entry" for everybody who has just finished school, training or studies', () => {
    expect(tierOf(SCHOOL)).toBe('entry')
    expect(tierOf(TRAINING)).toBe('entry')
  })

  it('is "entry" for zero years, "some" below ten and "long" from ten', () => {
    expect(tierOf(answers({ yearsOfExperience: 0 }))).toBe('entry')
    expect(tierOf(answers({ yearsOfExperience: 1 }))).toBe('some')
    expect(tierOf(answers({ yearsOfExperience: 9 }))).toBe('some')
    expect(tierOf(answers({ yearsOfExperience: 10 }))).toBe('long')
    expect(tierOf(answers({ yearsOfExperience: 40 }))).toBe('long')
  })

  it('counts an unknown number of years of somebody who has worked as the middle step', () => {
    expect(tierOf(answers({ yearsOfExperience: null }))).toBe('some')
    expect(tierOf(answers({ situation: 'returning', yearsOfExperience: null }))).toBe('some')
  })
})

describe('plan for somebody who has just left school', () => {
  const ids = itemsOf(SCHOOL)

  it('has the blocks for Germany without sensitive points and without the foreign block', () => {
    expect(blocksOf(SCHOOL)).toEqual(['contents', 'cvStructure', 'trim', 'attachments', 'coverLetter', 'findData'])
  })

  it('asks for the last school reports and for nothing that needs work experience', () => {
    expect(ids).toContain('att.school')
    for (const other of ['att.some', 'att.long', 'att.noSchool', 'att.training', 'att.schoolReports'] as const) expect(ids).not.toContain(other)
  })

  it('shortens as a beginner: internships, projects, side jobs - not the long-career rules', () => {
    expect(ids).toContain('trim.entrySchool')
    for (const other of ['trim.entryTraining', 'trim.some', 'trim.long', 'trim.longDrop', 'trim.newField', 'trim.returning'] as const) expect(ids).not.toContain(other)
  })

  it('suggests one page, calls the third page unnecessary and says the cover letter has no rule of its own', () => {
    expect(ids).toContain('cv.lengthEntry')
    expect(ids).toContain('contents.thirdPageEntry')
    expect(ids).not.toContain('contents.thirdPage')
    expect(ids).toContain('cl.entry')
    expect(ids).toContain('cv.profileEntry')
  })

  it('has no change-of-career advice', () => {
    expect(ids).not.toContain('cl.switchReason')
    expect(ids).not.toContain('cv.profileSwitch')
  })
})

describe('plan for somebody who has just finished training or studies', () => {
  const ids = itemsOf(TRAINING)

  it('takes the final certificates and shows that the sources disagree about school reports', () => {
    expect(ids).toContain('att.training')
    expect(ids).toContain('att.schoolReports')
    expect(kindOf(TRAINING, 'att.schoolReports')).toBe('disputed')
    expect(ids).not.toContain('att.school')
  })

  it('keeps training and studies in detail and shortens the school', () => {
    expect(ids).toContain('trim.entryTraining')
    expect(ids).not.toContain('trim.entrySchool')
  })
})

describe('plan for two years of experience and a change of career', () => {
  const given = answers({ yearsOfExperience: 2, plan: 'new_field' })
  const ids = itemsOf(given)

  it('is the middle step with the last stations in detail', () => {
    expect(buildPlan(given).tier).toBe('some')
    expect(ids).toContain('trim.some')
    expect(ids).toContain('trim.someInternships')
  })

  it('does not yet apply the rule for five to ten years', () => {
    expect(ids).not.toContain('trim.someDegree')
    expect(itemsOf(answers({ yearsOfExperience: 4 }))).not.toContain('trim.someDegree')
    expect(itemsOf(answers({ yearsOfExperience: 5 }))).toContain('trim.someDegree')
  })

  it('makes the reason for the change the aim of the cover letter and explains the change in the profile', () => {
    expect(ids).toContain('cl.switchReason')
    expect(ids).toContain('cl.switchExample')
    expect(kindOf(given, 'cl.switchExample')).toBe('example')
    expect(ids).toContain('cv.profileSwitch')
    expect(ids).not.toContain('cv.profileOptional')
    expect(ids).not.toContain('cv.profileEntry')
  })

  it('marks the shortening for the new goal as a recommendation without a source of its own', () => {
    expect(ids).toContain('trim.newField')
    expect(kindOf(given, 'trim.newField')).toBe('recommendation')
  })

  it('asks for reference letters of the last jobs and leaves the school reports out', () => {
    expect(ids).toContain('att.some')
    expect(ids).toContain('att.noSchool')
    expect(ids).not.toContain('att.school')
    expect(ids).not.toContain('att.long')
  })

  it('shows no change-of-career advice for somebody who stays in the field', () => {
    const staying = itemsOf(answers({ yearsOfExperience: 2 }))
    expect(staying).not.toContain('cl.switchReason')
    expect(staying).not.toContain('trim.newField')
    expect(staying).toContain('cv.profileOptional')
  })
})

describe('plan for a long career', () => {
  const given = answers({ yearsOfExperience: 12 })
  const ids = itemsOf(given)

  it('compresses older stations and leaves out what the sources name', () => {
    expect(buildPlan(given).tier).toBe('long')
    expect(ids).toContain('trim.long')
    expect(ids).toContain('trim.longDrop')
    expect(ids).not.toContain('trim.some')
  })

  it('needs no school reports and asks for the highest degree plus one or two recent references', () => {
    expect(ids).toContain('att.long')
    expect(ids).toContain('att.noSchool')
    expect(ids).not.toContain('att.school')
    expect(ids).not.toContain('att.training')
  })

  it('shows the sources disagreeing about the length (two or three pages)', () => {
    expect(ids).toContain('cv.lengthLong')
    expect(kindOf(given, 'cv.lengthLong')).toBe('disputed')
    expect(ids).not.toContain('cv.lengthSome')
  })

  it('adds the rules for more than 20 and more than 30 years only from there', () => {
    expect(itemsOf(answers({ yearsOfExperience: 20 }))).not.toContain('trim.long20')
    expect(itemsOf(answers({ yearsOfExperience: 21 }))).toContain('trim.long20')
    expect(itemsOf(answers({ yearsOfExperience: 21 }))).not.toContain('trim.long30')
    expect(itemsOf(answers({ yearsOfExperience: 30 }))).not.toContain('trim.long30')
    expect(itemsOf(answers({ yearsOfExperience: 31 }))).toContain('trim.long30')
    expect(itemsOf(answers({ yearsOfExperience: 12 }))).not.toContain('trim.long20')
  })
})

describe('plan for somebody returning after a break', () => {
  const given = answers({ situation: 'returning', yearsOfExperience: 7 })

  it('names the break and marks the source as thin', () => {
    expect(itemsOf(given)).toContain('trim.returning')
    expect(kindOf(given, 'trim.returning')).toBe('thin')
  })

  it('still follows the rules of the years worked before the break', () => {
    expect(buildPlan(given).tier).toBe('some')
    expect(itemsOf(given)).toContain('trim.some')
    expect(itemsOf(given)).toContain('att.some')
  })

  it('is not shown to anybody else', () => {
    expect(itemsOf(answers())).not.toContain('trim.returning')
  })
})

describe('plan for the United Kingdom', () => {
  const given = answers({ region: 'uk' })
  const ids = itemsOf(given)

  it('puts the block for abroad right after the contents', () => {
    expect(blocksOf(given).slice(0, 2)).toEqual(['contents', 'region'])
  })

  it('has the British points: no personal data, up to two pages, references on request', () => {
    expect(ids).toEqual(expect.arrayContaining(['region.ukTerm', 'region.ukPrivate', 'region.ukSections', 'cv.lengthUk', 'att.uk', 'region.language', 'region.ukApp']))
  })

  it('has no German points: no German CV form, no German certificates, no pension record', () => {
    for (const other of ['contents.order', 'cv.form', 'cv.sections', 'cv.personalCore', 'att.some', 'att.noSchool', 'att.never', 'find.drv', 'trim.personalNever', 'region.usTerm'] as const) {
      expect(ids).not.toContain(other)
    }
  })

  it('says the advice for the cover letter comes from German sources', () => {
    expect(ids).toContain('cl.abroadNote')
    expect(ids).toContain('cl.language')
  })
})

describe('plan for the USA', () => {
  const working = answers({ region: 'us' })

  it('names resume and CV and admits what no source covers', () => {
    expect(itemsOf(working)).toEqual(expect.arrayContaining(['region.usTerm', 'region.usUnknown', 'att.us']))
    expect(kindOf(working, 'region.usUnknown')).toBe('unproven')
    expect(kindOf(working, 'att.us')).toBe('unproven')
  })

  it('knows one page only for people starting out', () => {
    expect(itemsOf(answers({ region: 'us', situation: 'school', yearsOfExperience: null, plan: 'first_job' }))).toContain('cv.lengthUsEntry')
    expect(itemsOf(working)).toContain('cv.lengthUsMore')
    expect(itemsOf(working)).not.toContain('cv.lengthUsEntry')
    expect(kindOf(working, 'cv.lengthUsMore')).toBe('unproven')
  })

  it('has no British points', () => {
    expect(itemsOf(working)).not.toContain('region.ukTerm')
    expect(itemsOf(working)).not.toContain('att.uk')
  })
})

describe('sensitive points', () => {
  it('has no block when nothing is ticked', () => {
    expect(blocksOf(answers())).not.toContain('sensitive')
    expect(itemsOf(answers())).not.toContain('sens.honest')
    expect(itemsOf(answers())).not.toContain('cl.sensitive')
  })

  it('has exactly the ticked points, after the principle of being honest, in the order of the manual', () => {
    const ids = itemsOf(answers({ explain: ['frequent_changes', 'gap', 'illness'] })).filter((id) => id.startsWith('sens.'))
    expect(ids).toEqual(['sens.honest', 'sens.gap', 'sens.illness', 'sens.frequent_changes'])
  })

  it('carries one item for every point that can be ticked', () => {
    const all = answers({ explain: ['gap', 'parental_leave', 'illness', 'unemployment', 'dropped_out', 'frequent_changes'] })
    const ids = itemsOf(all).filter((id) => id.startsWith('sens.'))
    expect(ids).toEqual(['sens.honest', 'sens.gap', 'sens.unemployment', 'sens.parental_leave', 'sens.illness', 'sens.dropped_out', 'sens.frequent_changes'])
  })

  it('shows where the sources agree and where they do not', () => {
    const all = answers({ explain: ['gap', 'parental_leave', 'illness', 'unemployment', 'dropped_out', 'frequent_changes'] })
    expect(kindOf(all, 'sens.parental_leave')).toBe('rule')
    expect(kindOf(all, 'sens.unemployment')).toBe('rule')
    expect(kindOf(all, 'sens.gap')).toBe('disputed')
    expect(kindOf(all, 'sens.illness')).toBe('disputed')
    expect(kindOf(all, 'sens.frequent_changes')).toBe('disputed')
    expect(kindOf(all, 'sens.dropped_out')).toBe('thin')
  })

  it('adds a note to the cover letter and, abroad, the remark that the sources are German', () => {
    expect(itemsOf(answers({ explain: ['gap'] }))).toContain('cl.sensitive')
    expect(itemsOf(answers({ explain: ['gap'] }))).not.toContain('sens.abroadNote')
    expect(itemsOf(answers({ explain: ['gap'], region: 'uk' }))).toContain('sens.abroadNote')
  })
})

describe('where to find the dates', () => {
  it('has the school-year rule and the documents for everybody', () => {
    for (const given of [SCHOOL, answers(), answers({ region: 'us' })]) {
      expect(itemsOf(given)).toContain('find.dates')
      expect(itemsOf(given)).toContain('find.documents')
    }
  })

  it('has the pension insurance history only for Germany, with its two links', () => {
    const plan = buildPlan(answers())
    const drv = plan.blocks.flatMap((block) => block.items).find((item) => item.id === 'find.drv')
    expect(drv?.external).toEqual(['drvRequest', 'drvGlossary'])
    expect(EXTERNAL_LINK_TARGETS.drvRequest).toBe('https://www.deutsche-rentenversicherung.de/DRV/DE/Online-Services/informationen_anfordern')
    expect(EXTERNAL_LINK_TARGETS.drvGlossary).toBe('https://www.deutsche-rentenversicherung.de/SharedDocs/Glossareintraege/DE/V/versicherungsverlauf')
    expect(itemsOf(answers({ region: 'uk' }))).not.toContain('find.drv')
    expect(itemsOf(answers({ region: 'us' }))).not.toContain('find.drv')
  })

  it('has no external link on any other item', () => {
    const others = buildPlan(answers()).blocks.flatMap((block) => block.items).filter((item) => item.id !== 'find.drv')
    expect(others.filter((item) => item.external)).toEqual([])
  })
})

describe('every plan', () => {
  const examples = [SCHOOL, TRAINING, answers(), answers({ yearsOfExperience: 12, plan: 'new_field', region: 'uk', explain: ['gap'] }), ...OVERVIEW_IDS.map((id) => OVERVIEW_EXAMPLES[id].answers)]

  it('leads every block to a place in the app', () => {
    for (const given of examples) {
      for (const block of buildPlan(given).blocks) {
        expect(block.links.length, block.id).toBeGreaterThan(0)
        for (const link of block.links) expect(LINK_TARGETS[link]).toMatch(/^\//)
      }
    }
  })

  it('keeps the blocks in reading order and mentions no item twice', () => {
    const order = new Map(BLOCK_IDS.map((id, index) => [id, index]))
    for (const given of examples) {
      const blocks = buildPlan(given).blocks.map((block) => block.id)
      expect(blocks.map((id) => order.get(id)!)).toEqual([...blocks.map((id) => order.get(id)!)].sort((a, b) => a - b))
      const ids = itemsOf(given)
      expect(new Set(ids).size).toBe(ids.length)
    }
  })

  it('has no block without an item', () => {
    for (const given of examples) for (const block of buildPlan(given).blocks) expect(block.items.length, block.id).toBeGreaterThan(0)
  })

  it('is the same for the same answers', () => {
    expect(buildPlan(answers({ explain: ['gap'] }))).toEqual(buildPlan(answers({ explain: ['gap'] })))
  })
})
