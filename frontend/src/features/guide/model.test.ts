import { describe, expect, it } from 'vitest'
import type { GuideAnswers } from '../../api/types'
import { EMPTY_DRAFT, MAX_YEARS, YEARS_CHOICES, answersOf, draftOf, isStepDone, readYears, stepsFor, yearsChoiceOf } from './model'
import type { GuideDraft } from './model'

describe('the years in working life', () => {
  it('reads whole numbers, also with spaces around them', () => {
    expect(readYears('7')).toEqual({ state: 'ok', years: 7 })
    expect(readYears(' 12 ')).toEqual({ state: 'ok', years: 12 })
    expect(readYears('0')).toEqual({ state: 'ok', years: 0 })
    expect(readYears('007')).toEqual({ state: 'ok', years: 7 })
  })

  it('calls an empty field empty and anything that is not a whole number invalid, on every keystroke', () => {
    expect(readYears('')).toEqual({ state: 'empty' })
    expect(readYears('   ')).toEqual({ state: 'empty' })
    for (const text of ['x', '3,5', '3.5', '-1', '1e2', '7 Jahre', '٣']) expect(readYears(text), text).toEqual({ state: 'invalid' })
  })

  it('refuses more than the limit', () => {
    expect(readYears(String(MAX_YEARS))).toEqual({ state: 'ok', years: MAX_YEARS })
    expect(readYears(String(MAX_YEARS + 1))).toEqual({ state: 'range' })
  })

  it('puts every number from 0 to the limit into exactly one quick choice', () => {
    for (let years = 0; years <= MAX_YEARS; years++) {
      expect(YEARS_CHOICES.filter((choice) => choice.contains(years)).length, String(years)).toBe(1)
    }
  })

  it('fits the six quick choices: none, under 2, 2 to 5, 5 to 10, 10 to 15, over 15', () => {
    expect([0, 1, 2, 4, 5, 9, 10, 14, 15, 40].map(yearsChoiceOf)).toEqual(['none', 'under2', 'from2', 'from2', 'from5', 'from5', 'from10', 'from10', 'over15', 'over15'])
  })

  it('saves a number that falls into its own quick choice', () => {
    for (const choice of YEARS_CHOICES) expect(yearsChoiceOf(choice.years)).toBe(choice.id)
  })
})

describe('the questions that are asked', () => {
  it('leaves out years and plan for somebody who has just finished school or training', () => {
    expect(stepsFor('school')).toEqual(['situation', 'explain', 'region'])
    expect(stepsFor('training_or_studies')).toEqual(['situation', 'explain', 'region'])
  })

  it('asks all five for somebody who has worked', () => {
    expect(stepsFor('working')).toEqual(['situation', 'years', 'plan', 'explain', 'region'])
    expect(stepsFor('returning')).toEqual(['situation', 'years', 'plan', 'explain', 'region'])
  })

  it('knows a step is done only when it is answered', () => {
    expect(isStepDone('situation', EMPTY_DRAFT)).toBe(false)
    expect(isStepDone('years', { ...EMPTY_DRAFT, yearsText: '' })).toBe(false)
    expect(isStepDone('years', { ...EMPTY_DRAFT, yearsText: 'abc' })).toBe(false)
    expect(isStepDone('years', { ...EMPTY_DRAFT, yearsText: '4' })).toBe(true)
    expect(isStepDone('years', { ...EMPTY_DRAFT, yearsText: '61' })).toBe(false)
    expect(isStepDone('explain', { ...EMPTY_DRAFT, explain: null })).toBe(false)
    // "Nothing to explain" is an answer.
    expect(isStepDone('explain', { ...EMPTY_DRAFT, explain: [] })).toBe(true)
    expect(isStepDone('plan', { ...EMPTY_DRAFT, plan: 'first_job' })).toBe(false)
    expect(isStepDone('plan', { ...EMPTY_DRAFT, plan: 'new_field' })).toBe(true)
  })
})

describe('the answers to save', () => {
  const worked: GuideDraft = { situation: 'working', yearsText: '3', plan: 'new_field', explain: ['illness', 'gap'], region: 'uk' }

  it('are complete for somebody who has worked and in a fixed order of the points', () => {
    expect(answersOf(worked)).toEqual({ situation: 'working', yearsOfExperience: 3, plan: 'new_field', explain: ['gap', 'illness'], region: 'uk' })
  })

  it('have no years and a first job for somebody who has just finished school, whatever was typed before', () => {
    const draft: GuideDraft = { situation: 'school', yearsText: '8', plan: 'same_field', explain: [], region: 'de' }
    expect(answersOf(draft)).toEqual({ situation: 'school', yearsOfExperience: null, plan: 'first_job', explain: [], region: 'de' })
  })

  it('do not exist while a question that is asked is open', () => {
    expect(answersOf(EMPTY_DRAFT)).toBeNull()
    expect(answersOf({ ...worked, yearsText: '' })).toBeNull()
    expect(answersOf({ ...worked, yearsText: '1.5' })).toBeNull()
    expect(answersOf({ ...worked, plan: null })).toBeNull()
    expect(answersOf({ ...worked, explain: null })).toBeNull()
    expect(answersOf({ ...worked, region: null })).toBeNull()
  })

  it('are not blocked by a question that is not asked', () => {
    expect(answersOf({ situation: 'training_or_studies', yearsText: '', plan: null, explain: [], region: 'us' })).not.toBeNull()
  })

  it('go back into the wizard unchanged', () => {
    const saved: GuideAnswers = { situation: 'returning', yearsOfExperience: 12, plan: 'same_field', explain: ['parental_leave'], region: 'de' }
    expect(answersOf(draftOf(saved))).toEqual(saved)
    const school: GuideAnswers = { situation: 'school', yearsOfExperience: null, plan: 'first_job', explain: [], region: 'us' }
    expect(answersOf(draftOf(school))).toEqual(school)
  })

  it('start empty when nothing was saved', () => {
    expect(draftOf(null)).toEqual(EMPTY_DRAFT)
  })
})
