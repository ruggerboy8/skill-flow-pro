/**
 * `--refresh` week-repointing math.
 *
 * The copied history keeps whatever week_start_date / week_of values the
 * source data had, which drift into the past every week the demo org sits
 * unused. `--refresh` re-points the whole copied block by a single
 * constant day offset, so the week that was "current" at copy time lands
 * on the Monday of the week the script is actually run in, and every other
 * copied week slides by the exact same amount (a parallel shift, not a
 * rescale, so week-to-week spacing and ordering are preserved).
 *
 * Built on the app's own timezone-safe date helpers (COR-1) instead of
 * reimplementing day math: `mondayInTimezone` for "what is the Monday of
 * this week in this timezone" and `addCalendarDays` for shifting a
 * "yyyy-MM-dd" string by N days. See src/lib/submissionPolicy.ts and
 * src/lib/calendarDate.ts for why this must not be done with
 * `Date.prototype.setDate` / `toISOString().split('T')[0]`.
 */

import { mondayInTimezone } from '../../../src/lib/dateUtils';
import { addCalendarDays } from '../../../src/lib/calendarDate';

/** Whole-day difference between two "yyyy-MM-dd" strings (to - from). */
export function daysBetweenDateStrings(fromStr: string, toStr: string): number {
  const toUtcDayNumber = (dateStr: string): number => {
    const [y, m, d] = dateStr.split('-').map(Number);
    return Date.UTC(y, m - 1, d) / 86_400_000;
  };
  return toUtcDayNumber(toStr) - toUtcDayNumber(fromStr);
}

/**
 * The number of days to shift every copied week by so that
 * `originalCurrentWeekStart` (the latest week_start_date present in the
 * copied source data, i.e. what was "current" when the seed last ran)
 * lands on the Monday of `now`'s week in `tz`.
 *
 * Returns 0 (a no-op shift) when the copied "current" week is already
 * that Monday -- running `--refresh` twice in the same week must not
 * double-shift the data.
 */
export function computeWeekShiftDays(
  originalCurrentWeekStart: string,
  now: Date,
  tz: string,
): number {
  const targetMonday = mondayInTimezone(tz, now);
  return daysBetweenDateStrings(originalCurrentWeekStart, targetMonday);
}

/** Shifts one "yyyy-MM-dd" date string by `shiftDays` (may be negative or 0). */
export function shiftDateString(dateStr: string, shiftDays: number): string {
  if (shiftDays === 0) return dateStr;
  return addCalendarDays(dateStr, shiftDays);
}

export interface WeekDated {
  weekStartDate: string;
}

/**
 * Applies `computeWeekShiftDays` to a whole batch of rows that each carry a
 * "yyyy-MM-dd" week field, via the caller-supplied accessor/setter so it
 * works for both weekly_assignments.week_start_date and
 * weekly_scores.week_of without duplicating this function per shape.
 */
export function repointWeeks<T>(
  rows: readonly T[],
  shiftDays: number,
  getWeek: (row: T) => string,
  setWeek: (row: T, newWeek: string) => T,
): T[] {
  if (shiftDays === 0) return [...rows];
  return rows.map((row) => setWeek(row, shiftDateString(getWeek(row), shiftDays)));
}
