import {
  format,
  formatDistanceToNow,
  differenceInDays,
  differenceInCalendarDays,
  parseISO,
  isValid,
  isBefore,
  isAfter,
  isToday,
  isTomorrow,
  isYesterday,
  startOfDay,
} from 'date-fns'
import { es } from 'date-fns/locale'

// ---------------------------------------------------------------------------
// Parsing helpers
// ---------------------------------------------------------------------------

function toDate(value: string | Date): Date {
  if (value instanceof Date) return value
  return parseISO(value)
}

function safeParse(value: string | Date | null | undefined): Date | null {
  if (value == null) return null
  const d = toDate(value)
  return isValid(d) ? d : null
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/**
 * Format a date as "dd/MM/yyyy" (Argentine convention).
 * @example formatDate('2024-03-15')  // "15/03/2024"
 */
export function formatDate(value: string | Date | null | undefined): string {
  const d = safeParse(value)
  if (!d) return '-'
  return format(d, 'dd/MM/yyyy')
}

/**
 * Format a date as "dd/MM/yyyy HH:mm".
 * @example formatDateTime('2024-03-15T14:30:00Z')  // "15/03/2024 14:30"
 */
export function formatDateTime(
  value: string | Date | null | undefined
): string {
  const d = safeParse(value)
  if (!d) return '-'
  return format(d, 'dd/MM/yyyy HH:mm')
}

/**
 * Format a date as a short label: "15 mar 2024".
 */
export function formatDateShort(
  value: string | Date | null | undefined
): string {
  const d = safeParse(value)
  if (!d) return '-'
  return format(d, 'd MMM yyyy', { locale: es })
}

/**
 * Format a date as a long label: "15 de marzo de 2024".
 */
export function formatDateLong(
  value: string | Date | null | undefined
): string {
  const d = safeParse(value)
  if (!d) return '-'
  return format(d, "d 'de' MMMM 'de' yyyy", { locale: es })
}

/**
 * Format a date as compact day + month: "15 mar".
 * @example formatDateCompact('2024-03-15')  // "15 mar"
 */
export function formatDateCompact(
  value: string | Date | null | undefined
): string {
  const d = safeParse(value)
  if (!d) return '-'
  return format(d, 'd MMM', { locale: es })
}

/**
 * Format a date with weekday: "sáb, 15 mar".
 * @example formatDateWithWeekday('2024-03-16')  // "sáb, 15 mar"
 */
export function formatDateWithWeekday(
  value: string | Date | null | undefined
): string {
  const d = safeParse(value)
  if (!d) return '-'
  return format(d, "eee, d MMM", { locale: es })
}

/**
 * Format only the time portion: "14:30".
 */
export function formatTime(value: string | Date | null | undefined): string {
  const d = safeParse(value)
  if (!d) return '-'
  return format(d, 'HH:mm')
}

// ---------------------------------------------------------------------------
// Relative dates
// ---------------------------------------------------------------------------

/**
 * Human-readable relative time: "hace 3 dias", "en 2 horas".
 */
export function timeAgo(value: string | Date | null | undefined): string {
  const d = safeParse(value)
  if (!d) return '-'
  return formatDistanceToNow(d, { addSuffix: true, locale: es })
}

/**
 * Number of whole days between the given date and today.
 * Negative = in the past, positive = in the future.
 */
export function daysFromNow(
  value: string | Date | null | undefined
): number | null {
  const d = safeParse(value)
  if (!d) return null
  return differenceInCalendarDays(d, startOfDay(new Date()))
}

/**
 * Number of days elapsed since the given date (always >= 0).
 */
export function daysAgo(
  value: string | Date | null | undefined
): number | null {
  const d = safeParse(value)
  if (!d) return null
  const diff = differenceInDays(new Date(), d)
  return Math.max(0, diff)
}

/**
 * Number of calendar days until the given date (always >= 0).
 * Returns 0 if the date is today or in the past.
 */
export function daysUntil(
  value: string | Date | null | undefined
): number | null {
  const d = safeParse(value)
  if (!d) return null
  const diff = differenceInCalendarDays(d, startOfDay(new Date()))
  return Math.max(0, diff)
}

// ---------------------------------------------------------------------------
// Smart date label
// ---------------------------------------------------------------------------

/**
 * Returns a contextual label:
 *   - "Hoy" / "Manana" / "Ayer" for nearby dates
 *   - "15 mar 2024" for other dates
 */
export function smartDateLabel(
  value: string | Date | null | undefined
): string {
  const d = safeParse(value)
  if (!d) return '-'
  if (isToday(d)) return 'Hoy'
  if (isTomorrow(d)) return 'Manana'
  if (isYesterday(d)) return 'Ayer'
  return format(d, 'd MMM yyyy', { locale: es })
}

// ---------------------------------------------------------------------------
// Comparison helpers
// ---------------------------------------------------------------------------

/**
 * True if the date is in the past (before start of today).
 */
export function isOverdue(value: string | Date | null | undefined): boolean {
  const d = safeParse(value)
  if (!d) return false
  return isBefore(d, startOfDay(new Date()))
}

/**
 * True if the date is in the future (after end of today).
 */
export function isFuture(value: string | Date | null | undefined): boolean {
  const d = safeParse(value)
  if (!d) return false
  return isAfter(d, new Date())
}

/**
 * True if the date is within the next N days (inclusive of today).
 */
export function isWithinDays(
  value: string | Date | null | undefined,
  days: number
): boolean {
  const remaining = daysUntil(value)
  if (remaining === null) return false
  return remaining <= days
}
