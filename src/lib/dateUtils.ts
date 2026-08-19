/**
 * Generic, timezone-explicit date-string helpers.
 *
 * These exist to replace the `date.toISOString().split('T')[0]` pattern,
 * which converts a local instant to UTC before taking the date portion.
 * For anyone in a negative-UTC timezone (all of Central time), that turns
 * local midnight into the PREVIOUS calendar day. Every helper here takes an
 * explicit IANA timezone and goes through date-fns-tz instead, the same
 * pattern already used in src/lib/locationState.ts and submissionPolicy.ts.
 */

import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { resolveMonday, resolveNextMonday } from './submissionPolicy';
import { addCalendarDays } from './calendarDate';

/**
 * The UTC instant for local midnight of a calendar-date string
 * ("yyyy-MM-dd") in the given IANA timezone.
 */
export function dateStringToInstant(dateStr: string, tz: string): Date {
  return fromZonedTime(`${dateStr}T00:00:00`, tz);
}

/**
 * The calendar-date string ("yyyy-MM-dd") for a moment in time, as observed
 * in the given IANA timezone.
 */
export function instantToDateString(instant: Date, tz: string): string {
  return formatInTimeZone(instant, tz, 'yyyy-MM-dd');
}

/**
 * ISO day-of-week (1=Mon..7=Sun) for a moment in time, as observed in the
 * given IANA timezone. Deliberately NOT `Date.prototype.getDay()`, which
 * always reads the JS engine's own local timezone rather than `tz`.
 */
export function isoDayOfWeekInTz(instant: Date, tz: string): number {
  return Number(formatInTimeZone(instant, tz, 'i'));
}

/**
 * Add (or subtract, with a negative count) whole calendar days to a
 * "yyyy-MM-dd" date string.
 *
 * `tz` is accepted for API consistency with the rest of this module (every
 * other helper here needs one), but a date-only string has no time-of-day,
 * so shifting it by N days is unambiguous calendar arithmetic and does not
 * actually depend on any timezone. This delegates to `addCalendarDays`
 * rather than converting to an instant and calling date-fns' `addDays` on
 * it, which mutates using the HOST runtime's own local timezone and
 * corrupts the result whenever the host's DST transitions don't line up
 * with `tz`'s. See calendarDate.ts and COR-1.
 */
export function addDaysToDateString(dateStr: string, days: number, tz: string): string {
  return addCalendarDays(dateStr, days);
}

/**
 * All Mondays ("yyyy-MM-dd") in the calendar month containing
 * `monthAnchorStr`, as observed in `tz`. Every calendar month has at least
 * one Monday, so the search for the first one is bounded at 7 days.
 */
export function mondaysInMonth(monthAnchorStr: string, tz: string): string[] {
  const targetMonth = monthAnchorStr.slice(0, 7); // yyyy-MM
  let cursor = `${targetMonth}-01`;
  for (let i = 0; i < 7 && isoDayOfWeekInTz(dateStringToInstant(cursor, tz), tz) !== 1; i++) {
    cursor = addDaysToDateString(cursor, 1, tz);
  }

  const mondays: string[] = [];
  while (cursor.slice(0, 7) === targetMonth) {
    mondays.push(cursor);
    cursor = addDaysToDateString(cursor, 7, tz);
  }
  return mondays;
}

/**
 * The first Monday on or after the 1st of the calendar month containing
 * `dateStr`, as observed in `tz`.
 */
export function firstMondayOfMonth(dateStr: string, tz: string): string {
  return mondaysInMonth(dateStr, tz)[0];
}

/**
 * Returns the date string (YYYY-MM-DD) for the upcoming Monday in the given
 * IANA timezone. If today is already Monday, returns next Monday (7 days out)
 * to ensure program start is always in the future.
 *
 * Delegates to the canonical Monday resolver in submissionPolicy.ts.
 *
 * @param ianaTimezone - e.g. 'America/New_York', 'Europe/London'
 * @param now - injectable for testing; defaults to the current moment
 */
export function nextMondayInTimezone(ianaTimezone: string, now: Date = new Date()): string {
  return instantToDateString(resolveNextMonday(now, ianaTimezone), ianaTimezone);
}

/**
 * Returns the date string (YYYY-MM-DD) for the Monday of the week
 * containing `now`, in the given IANA timezone. Delegates to the canonical
 * Monday resolver in submissionPolicy.ts.
 *
 * @param ianaTimezone - e.g. 'America/New_York', 'Europe/London'
 * @param now - injectable for testing; defaults to the current moment
 */
export function mondayInTimezone(ianaTimezone: string, now: Date = new Date()): string {
  return instantToDateString(resolveMonday(now, ianaTimezone), ianaTimezone);
}
