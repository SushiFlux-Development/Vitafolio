import { formatDayParts } from './validation/dates'
import type { DateFormatId } from './validation/dates'

/** Date, time and size formatting. Dates follow the chosen date format (validation/dates.ts), not the interface language. */

/** The day of an instant in the chosen date format and the viewer's time zone. */
export function formatDate(iso: string | null | undefined, format: DateFormatId): string {
  if (!iso) return '-'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return formatDayParts(date.getFullYear(), date.getMonth() + 1, date.getDate(), format)
}

/** Day and time of an instant; the time is always 24-hour ("14:30"). */
export function formatDateTime(iso: string | null | undefined, format: DateFormatId): string {
  if (!iso) return '-'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
  return `${formatDayParts(date.getFullYear(), date.getMonth() + 1, date.getDate(), format)}, ${time}`
}

export function formatBytes(bytes: number, language: string): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  const text = new Intl.NumberFormat(language, { maximumFractionDigits: unit === 0 ? 0 : 1 }).format(value)
  return `${text} ${units[unit]}`
}

/** "Chrome · Windows" from a user-agent string; the raw text when nothing is recognised. */
export function describeUserAgent(userAgent: string | null | undefined): string {
  if (!userAgent) return '-'
  const browser = /Edg\//.test(userAgent)
    ? 'Edge'
    : /OPR\/|Opera/.test(userAgent)
      ? 'Opera'
      : /Firefox\//.test(userAgent)
        ? 'Firefox'
        : /Chrome\//.test(userAgent)
          ? 'Chrome'
          : /Safari\//.test(userAgent)
            ? 'Safari'
            : undefined
  const system = /Windows/.test(userAgent)
    ? 'Windows'
    : /Android/.test(userAgent)
      ? 'Android'
      : /iPhone|iPad/.test(userAgent)
        ? 'iOS'
        : /Mac OS X/.test(userAgent)
          ? 'macOS'
          : /Linux/.test(userAgent)
            ? 'Linux'
            : undefined
  const parts = [browser, system].filter(Boolean)
  return parts.length > 0 ? parts.join(' · ') : userAgent
}

/** The address when it is a plain http(s) link, otherwise null: text from outside (release pages) never becomes a javascript: or data: link. */
export function safeHttpUrl(value: string | null | undefined): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null
  } catch {
    return null
  }
}
