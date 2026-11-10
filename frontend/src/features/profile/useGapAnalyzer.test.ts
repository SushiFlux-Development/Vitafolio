import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { Profile } from '../../api/types'
import { parseToMonthIndex, useGapAnalyzer } from './useGapAnalyzer'

function profile(experiences: Array<Partial<Profile['experiences'][number]>>, educations: Array<Partial<Profile['educations'][number]>> = []): Profile {
  return { experiences, educations } as unknown as Profile
}

describe('parseToMonthIndex', () => {
  it('reads the formats people type', () => {
    const march2024 = 2024 * 12 + 3
    expect(parseToMonthIndex('2024-03')).toBe(march2024)
    expect(parseToMonthIndex('03/2024')).toBe(march2024)
    expect(parseToMonthIndex('15.03.2024')).toBe(march2024)
    expect(parseToMonthIndex('2024')).toBe(2024 * 12 + 1)
    expect(parseToMonthIndex('irgendwann')).toBeNull()
    expect(parseToMonthIndex('')).toBeNull()
  })
})

describe('useGapAnalyzer', () => {
  it('gives the gap as ISO months for the entry form, and for display in the chosen date format', () => {
    const { result } = renderHook(() =>
      useGapAnalyzer(
        profile(
          [{ jobTitle: 'Entwickler', employer: 'Alt GmbH', startDate: '2018-01', endDate: '2019-01', isCurrent: false }],
          [{ degree: 'B.Sc.', institution: 'Uni', startDate: '2019-06', endDate: '2022-06', isCurrent: false }],
        ),
        'dmy',
      ),
    )
    expect(result.current.totalGapsCount).toBe(1)
    const gap = result.current.gaps[0]!
    expect(gap.startMonth).toBe('2019-02')
    expect(gap.endMonth).toBe('2019-05')
    expect(gap.startFormatted).toBe('02.2019')
    expect(gap.endFormatted).toBe('05.2019')
    expect(gap.durationMonths).toBe(4)
  })

  it.each([
    ['dmy', '02.2019', '05.2019'],
    ['ymd_slash', '2019/02', '2019/05'],
    ['iso', '2019-02', '2019-05'],
  ] as const)('shows the gap in the %s notation and still hands the forms ISO months', (format, start, end) => {
    const { result } = renderHook(() =>
      useGapAnalyzer(
        profile(
          [{ jobTitle: 'A', employer: 'X', startDate: '2018-01', endDate: '2019-01', isCurrent: false }],
          [{ degree: 'B', institution: 'U', startDate: '2019-06', endDate: '2022-06', isCurrent: false }],
        ),
        format,
      ),
    )
    const gap = result.current.gaps[0]!
    expect(gap.startFormatted).toBe(start)
    expect(gap.endFormatted).toBe(end)
    expect(gap.startMonth).toBe('2019-02')
    expect(gap.endMonth).toBe('2019-05')
  })

  it('handles December correctly (the month index wraps at 12)', () => {
    const { result } = renderHook(() =>
      useGapAnalyzer(
        profile([
          { jobTitle: 'A', employer: 'X', startDate: '2018-01', endDate: '2018-11', isCurrent: false },
          { jobTitle: 'B', employer: 'Y', startDate: '2019-03', endDate: '2019-12', isCurrent: false },
        ]),
        'dmy',
      ),
    )
    const gap = result.current.gaps[0]!
    expect(gap.startMonth).toBe('2018-12')
    expect(gap.endMonth).toBe('2019-02')
  })

  it('keeps title and organisation apart, so the card can name a missing part in words', () => {
    const { result } = renderHook(() =>
      useGapAnalyzer(
        profile([
          { jobTitle: '', employer: 'X', startDate: '2018-01', endDate: '2018-02', isCurrent: false },
          { jobTitle: 'B', employer: '', startDate: '2019-03', endDate: '2019-04', isCurrent: false },
        ]),
        'dmy',
      ),
    )
    const gap = result.current.gaps[0]!
    expect(gap.previous).toEqual({ title: '', organisation: 'X' })
    expect(gap.next).toEqual({ title: 'B', organisation: '' })
  })

  it('reports a seamless career as continuous', () => {
    const { result } = renderHook(() =>
      useGapAnalyzer(
        profile([
          { jobTitle: 'A', employer: 'X', startDate: '2018-01', endDate: '2018-12', isCurrent: false },
          { jobTitle: 'B', employer: 'Y', startDate: '2019-01', endDate: '2019-12', isCurrent: false },
        ]),
        'dmy',
      ),
    )
    expect(result.current.isContinuous).toBe(true)
    expect(result.current.hasGaps).toBe(false)
  })

  describe('an education without a beginning (school: only the year of graduation)', () => {
    const station = (startDate: string, endDate: string) => ({ jobTitle: 'A', employer: 'X', startDate, endDate, isCurrent: false })

    it('has no length to place on the time line, so it neither creates a gap nor crashes', () => {
      const { result } = renderHook(() =>
        useGapAnalyzer(
          profile([station('2012-01', '2015-12'), station('2016-01', '2019-12')], [{ degree: 'Abitur', institution: 'Gymnasium', startDate: '', endDate: '2009', isCurrent: false }]),
          'dmy',
        ),
      )
      expect(result.current.hasGaps).toBe(false)
      expect(result.current.isContinuous).toBe(true)
    })

    it('also copes with a running education that has no beginning', () => {
      const { result } = renderHook(() =>
        useGapAnalyzer(profile([station('2012-01', '2015-12')], [{ degree: 'Studium', institution: 'Uni', startDate: '', endDate: null, isCurrent: true }]), 'iso'),
      )
      expect(result.current.hasGaps).toBe(false)
      expect(result.current.totalGapsCount).toBe(0)
    })

    it('does not hide a real gap between two stations', () => {
      const { result } = renderHook(() =>
        useGapAnalyzer(
          profile([station('2012-01', '2013-12'), station('2016-01', '2019-12')], [{ degree: 'Abitur', institution: 'Gymnasium', startDate: '', endDate: '2009-06', isCurrent: false }]),
          'iso',
        ),
      )
      expect(result.current.gaps.map((gap) => [gap.startMonth, gap.endMonth])).toEqual([['2014-01', '2015-12']])
    })
  })
})
