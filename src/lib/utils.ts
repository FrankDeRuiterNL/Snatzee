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

/** "Vandaag" / "Gisteren" / "17 september" */
export function formatPlayedAt(iso: string) {
  const date = new Date(iso)
  const today = new Date()
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const diffDays = Math.round((startOf(today) - startOf(date)) / 86_400_000)

  if (diffDays === 0) return 'Vandaag'
  if (diffDays === 1) return 'Gisteren'
  if (diffDays < 7 && diffDays > 0) {
    return new Intl.DateTimeFormat('nl-NL', { weekday: 'long' }).format(date)
  }
  return new Intl.DateTimeFormat('nl-NL', {
    day: 'numeric',
    month: 'long',
    year: date.getFullYear() === today.getFullYear() ? undefined : 'numeric',
  }).format(date)
}

export function formatTime(iso: string) {
  return new Intl.DateTimeFormat('nl-NL', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
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

export function pluralize(count: number, one: string, many: string) {
  return count === 1 ? one : many
}

/** 1e, 2e, 3e … in Dutch. */
export function ordinalNl(n: number) {
  return `${n}e`
}
