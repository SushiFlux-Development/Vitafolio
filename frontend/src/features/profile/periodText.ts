/**
 * How the period of a profile entry reads. An entry with a beginning is "beginning – end" (or "beginning – today" for a running one,
 * "beginning – –" when the end is open). An education may lack its beginning - for school the year of graduation is enough - and then
 * shows the end alone as one date, without a dash; a running entry without a beginning says "ongoing". Nothing is invented: with no date
 * at all the text is empty and the caller decides what to show.
 */
export function periodText(
  stored: (value: string | null | undefined) => string,
  period: { startDate: string; endDate?: string | null | undefined; isCurrent: boolean },
  words: { now: string; ongoing: string },
): string {
  const start = stored(period.startDate)
  if (start !== '') return `${start} – ${period.isCurrent ? words.now : stored(period.endDate) || '–'}`
  return period.isCurrent ? words.ongoing : stored(period.endDate)
}

/** Whether an education form names a period: a beginning, an end, or "still running" - at least one of them. */
export function hasEducationPeriod(form: { startDate: string; endDate: string; isCurrent: boolean }): boolean {
  return form.isCurrent || form.startDate.trim() !== '' || form.endDate.trim() !== ''
}
