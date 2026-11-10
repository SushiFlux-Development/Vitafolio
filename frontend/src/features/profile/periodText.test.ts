import { describe, expect, it } from 'vitest'
import { hasEducationPeriod, periodText } from './periodText'

const stored = (value: string | null | undefined) => {
  if (!value) return ''
  const [year, month] = value.split('-')
  return month ? `${month}/${year}` : (year ?? '')
}
const words = { now: 'heute', ongoing: 'laufend' }

describe('periodText', () => {
  it('writes beginning and end with a dash', () => {
    expect(periodText(stored, { startDate: '2005-08', endDate: '2009-06', isCurrent: false }, words)).toBe('08/2005 – 06/2009')
  })

  it('writes today for a running entry with a beginning', () => {
    expect(periodText(stored, { startDate: '2022-01', endDate: null, isCurrent: true }, words)).toBe('01/2022 – heute')
  })

  it('keeps the open end of an entry with a beginning', () => {
    expect(periodText(stored, { startDate: '2022-01', endDate: null, isCurrent: false }, words)).toBe('01/2022 – –')
  })

  it('shows only the end, as one date without a dash, when the beginning is missing', () => {
    expect(periodText(stored, { startDate: '', endDate: '2009', isCurrent: false }, words)).toBe('2009')
    expect(periodText(stored, { startDate: '', endDate: '2009-06', isCurrent: false }, words)).toBe('06/2009')
  })

  it('says ongoing for a running entry without a beginning', () => {
    expect(periodText(stored, { startDate: '', endDate: null, isCurrent: true }, words)).toBe('laufend')
  })

  it('is empty when there is no date at all', () => {
    expect(periodText(stored, { startDate: '', endDate: '', isCurrent: false }, words)).toBe('')
  })
})

describe('hasEducationPeriod', () => {
  it('needs a beginning, an end or a running education', () => {
    expect(hasEducationPeriod({ startDate: '2005', endDate: '', isCurrent: false })).toBe(true)
    expect(hasEducationPeriod({ startDate: '', endDate: '2009', isCurrent: false })).toBe(true)
    expect(hasEducationPeriod({ startDate: '', endDate: '', isCurrent: true })).toBe(true)
    expect(hasEducationPeriod({ startDate: '  ', endDate: ' ', isCurrent: false })).toBe(false)
  })
})
