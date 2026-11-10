import { useMemo } from 'react'
import type { Profile } from '../../api/types'
import { formatStoredDate } from '../../validation/dates'
import type { DateFormatId } from '../../validation/dates'

/** A station of the CV as it appears next to a gap: what it is called and where. Either part can be empty (the card then names it in words). */
export interface StationLabel {
  title: string
  organisation: string
}

export interface ResumeGap {
  id: string
  /** For display, in the chosen date format (e.g. 02.2019 or 2019-02). */
  startFormatted: string
  endFormatted: string
  /** For the entry forms: ISO text (YYYY-MM), which is what every month field of the profile stores; the field shows it in the chosen format. */
  startMonth: string
  endMonth: string
  durationMonths: number
  previous?: StationLabel | undefined
  next?: StationLabel | undefined
}

export interface GapAnalysisResult {
  hasGaps: boolean
  gaps: ResumeGap[]
  isContinuous: boolean
  totalGapsCount: number
}

/**
 * Parses diverse date inputs (YYYY-MM, MM/YYYY, YYYY, DD.MM.YYYY) into an absolute month index (year * 12 + month).
 */
export function parseToMonthIndex(val?: string | null): number | null {
  if (!val || !val.trim()) return null
  const s = val.trim()

  // Match YYYY-MM
  const yyyyMm = /^(\d{4})[-/.](\d{1,2})$/.exec(s)
  if (yyyyMm) {
    const y = parseInt(yyyyMm[1]!, 10)
    const m = parseInt(yyyyMm[2]!, 10)
    return y * 12 + Math.max(1, Math.min(12, m))
  }

  // Match MM/YYYY or MM.YYYY
  const mmYyyy = /^(\d{1,2})[-/.](\d{4})$/.exec(s)
  if (mmYyyy) {
    const m = parseInt(mmYyyy[1]!, 10)
    const y = parseInt(mmYyyy[2]!, 10)
    return y * 12 + Math.max(1, Math.min(12, m))
  }

  // Match DD.MM.YYYY
  const ddMmYyyy = /^(\d{1,2})[.](\d{1,2})[.](\d{4})$/.exec(s)
  if (ddMmYyyy) {
    const m = parseInt(ddMmYyyy[2]!, 10)
    const y = parseInt(ddMmYyyy[3]!, 10)
    return y * 12 + Math.max(1, Math.min(12, m))
  }

  // Match bare YYYY
  const yyyy = /^(\d{4})$/.exec(s)
  if (yyyy) {
    const y = parseInt(yyyy[1]!, 10)
    return y * 12 + 1 // Default to January
  }

  return null
}

/** Splits an absolute month index (year * 12 + month) into year and month. */
function splitMonthIndex(index: number): { year: number; month: number } {
  const month = index % 12 || 12
  return { year: month === 12 ? Math.floor(index / 12) - 1 : Math.floor(index / 12), month }
}

function isoMonth(index: number): string {
  const { year, month } = splitMonthIndex(index)
  return `${year}-${String(month).padStart(2, '0')}`
}

interface StationInterval {
  start: number
  end: number
  label: StationLabel
}

export function useGapAnalyzer(profile: Profile, format: DateFormatId): GapAnalysisResult {
  return useMemo(() => {
    const intervals: StationInterval[] = []
    const now = new Date()
    const currentMonthIndex = now.getFullYear() * 12 + (now.getMonth() + 1)

    // Collect experience intervals
    for (const exp of profile.experiences ?? []) {
      const start = parseToMonthIndex(exp.startDate)
      if (start === null) continue
      const end = exp.isCurrent ? currentMonthIndex : (parseToMonthIndex(exp.endDate) ?? start)
      intervals.push({
        start: Math.min(start, end),
        end: Math.max(start, end),
        label: { title: exp.jobTitle, organisation: exp.employer },
      })
    }

    // Collect education intervals. An education may have no beginning (school: only the year of graduation); it has no length to
    // place on the time line then, so it is left out - it can neither create a gap nor close one.
    for (const edu of profile.educations ?? []) {
      const start = parseToMonthIndex(edu.startDate)
      if (start === null) continue
      const end = edu.isCurrent ? currentMonthIndex : (parseToMonthIndex(edu.endDate) ?? start)
      intervals.push({
        start: Math.min(start, end),
        end: Math.max(start, end),
        label: { title: edu.degree, organisation: edu.institution },
      })
    }

    if (intervals.length <= 1) {
      return {
        hasGaps: false,
        gaps: [],
        isContinuous: intervals.length === 1,
        totalGapsCount: 0,
      }
    }

    // Sort intervals by start ascending
    intervals.sort((a, b) => a.start - b.start)

    // Merge overlapping intervals
    const merged: { start: number; end: number; labels: StationLabel[] }[] = []
    let current = {
      start: intervals[0]!.start,
      end: intervals[0]!.end,
      labels: [intervals[0]!.label],
    }

    for (let i = 1; i < intervals.length; i++) {
      const next = intervals[i]!
      // If overlapping or directly contiguous (gap <= 1 month difference)
      if (next.start <= current.end + 1) {
        current.end = Math.max(current.end, next.end)
        current.labels.push(next.label)
      } else {
        merged.push(current)
        current = {
          start: next.start,
          end: next.end,
          labels: [next.label],
        }
      }
    }
    merged.push(current)

    // Detect gaps between merged intervals (> 1 month difference)
    const gaps: ResumeGap[] = []
    for (let i = 0; i < merged.length - 1; i++) {
      const prev = merged[i]!
      const next = merged[i + 1]!

      const gapStart = prev.end + 1
      const gapEnd = next.start - 1

      if (gapEnd >= gapStart) {
        gaps.push({
          id: `gap-${gapStart}-${gapEnd}`,
          startFormatted: formatStoredDate(isoMonth(gapStart), format),
          endFormatted: formatStoredDate(isoMonth(gapEnd), format),
          startMonth: isoMonth(gapStart),
          endMonth: isoMonth(gapEnd),
          durationMonths: gapEnd - gapStart + 1,
          previous: prev.labels[prev.labels.length - 1],
          next: next.labels[0],
        })
      }
    }

    return {
      hasGaps: gaps.length > 0,
      gaps,
      isContinuous: gaps.length === 0 && intervals.length > 0,
      totalGapsCount: gaps.length,
    }
  }, [profile.experiences, profile.educations, format])
}
