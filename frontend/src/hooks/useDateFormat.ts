import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useOptionalAppState } from '../auth/AppState'
import { formatDate, formatDateTime } from '../format'
import { formatStoredDate, isDateFormatPreference, resolveDateFormat } from '../validation/dates'
import type { DateFormatId, DateFormatPreference } from '../validation/dates'

/**
 * The date format of the signed-in user (their setting, or "auto" = by the interface language) and the display functions bound
 * to it. Every date the app shows goes through this, so the setting changes all of them at once.
 */
export interface DateFormatApi {
  /** What the user chose. */
  preference: DateFormatPreference
  /** The notation in use (the choice resolved against the interface language). */
  format: DateFormatId
  /** An instant (ISO date-time from the server) as a day. */
  date: (iso: string | null | undefined) => string
  /** An instant as a day with the time. */
  dateTime: (iso: string | null | undefined) => string
  /** A stored date or month (`YYYY-MM-DD`, `YYYY-MM`, `YYYY`) as shown; text that is no ISO date stays as it is. */
  stored: (value: string | null | undefined) => string
}

export function useDateFormat(): DateFormatApi {
  const { i18n } = useTranslation()
  const saved = useOptionalAppState()?.session.user?.dateFormat
  const preference: DateFormatPreference = isDateFormatPreference(saved) ? saved : 'auto'
  const format = resolveDateFormat(preference, i18n.language)
  return useMemo(
    () => ({
      preference,
      format,
      date: (iso) => formatDate(iso, format),
      dateTime: (iso) => formatDateTime(iso, format),
      stored: (value) => formatStoredDate(value, format),
    }),
    [preference, format],
  )
}
