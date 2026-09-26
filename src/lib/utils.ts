import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Short, friendly first name for greetings. */
export function firstName(displayName: string | null | undefined) {
  if (!displayName) return 'speler'
  return displayName.trim().split(/\s+/)[0] ?? displayName
}

export function initials(name: string | null | undefined) {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return (parts[0] ?? '?').slice(0, 2).toUpperCase()
  return `${parts[0]?.[0] ?? ''}${parts[1]?.[0] ?? ''}`.toUpperCase()
}

export function formatNumber(value: number | null | undefined, decimals = 0) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  return new Intl.NumberFormat('nl-NL', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value)
}

export function formatDelta(value: number | null | undefined, decimals = 0) {
  if (value === null || value === undefined || Number.isNaN(value)) return null
  const sign = value > 0 ? '+' : ''
  return `${sign}${formatNumber(value, decimals)}`
}

/**
 * Dates are shown in Dutch time wherever they are rendered.
 *
 * Pages are rendered on the server too, which runs in UTC: a game played
 * at half past midnight showed up under the previous day, and the same
 * page could render differently on the server and in the browser.
 */
export const APP_TIME_ZONE = 'Europe/Amsterdam'

const dayPartsFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: APP_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** Calendar day in the app's time zone, as a day number for subtraction. */
function dayNumber(date: Date) {
  const parts = Object.fromEntries(
    dayPartsFormat.formatToParts(date).map((part) => [part.type, part.value]),
  )
  return Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)) / 86_400_000
}

function yearOf(date: Date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: APP_TIME_ZONE, year: 'numeric' }).format(date)
}

/** "Vandaag" / "Gisteren" / "17 september" */
export function formatPlayedAt(iso: string) {
  const date = new Date(iso)
  const today = new Date()
  const diffDays = dayNumber(today) - dayNumber(date)

  if (diffDays === 0) return 'Vandaag'
  if (diffDays === 1) return 'Gisteren'
  if (diffDays < 7 && diffDays > 0) {
    return new Intl.DateTimeFormat('nl-NL', { weekday: 'long', timeZone: APP_TIME_ZONE }).format(
      date,
    )
  }
  return new Intl.DateTimeFormat('nl-NL', {
    day: 'numeric',
    month: 'long',
    year: yearOf(date) === yearOf(today) ? undefined : 'numeric',
    timeZone: APP_TIME_ZONE,
  }).format(date)
}

export function formatTime(iso: string) {
  return new Intl.DateTimeFormat('nl-NL', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: APP_TIME_ZONE,
  }).format(new Date(iso))
}

/** `YYYY-MM-DD` in local time, for date inputs. */
export function toDateInputValue(date: Date = new Date()) {
  const offset = date.getTimezoneOffset()
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 10)
}

/**
 * Turns a `YYYY-MM-DD` input back into a timestamp. Today keeps the current
 * clock time so "played just now" sorts correctly; past dates land at midday
 * to stay on the right calendar day in every timezone.
 */
export function fromDateInputValue(value: string) {
  const todayValue = toDateInputValue()
  if (value === todayValue) return new Date().toISOString()
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) return new Date().toISOString()
  return new Date(year, month - 1, day, 12, 0, 0).toISOString()
}

/**
 * A same-site path to continue to after signing in, or null.
 *
 * `next` comes from the query string, so anything that is not a plain
 * path on this site — an absolute URL, a protocol-relative `//host`, a
 * `/\host` that browsers read the same way — is dropped rather than
 * followed.
 */
export function safeNextPath(next: string | null | undefined): string | null {
  if (!next || !next.startsWith('/')) return null
  if (next.startsWith('//') || next.startsWith('/\\')) return null
  return next
}

export function pluralize(count: number, one: string, many: string) {
  return count === 1 ? one : many
}

/** 1e, 2e, 3e … in Dutch. */
export function ordinalNl(n: number) {
  return `${n}e`
}
