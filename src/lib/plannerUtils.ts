// Timezone utilities for Pro-Move Planner
// All planner logic uses America/Chicago timezone

import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { resolveMonday, resolveNextMonday } from './submissionPolicy';

const PLANNER_TZ = 'America/Chicago';

/**
 * Get the Monday of the week containing the given date in America/Chicago
 * timezone. Delegates to the canonical Monday resolver in
 * submissionPolicy.ts so this is no longer its own implementation.
 *
 * A string input ("yyyy-MM-dd") is treated as that calendar date in
 * America/Chicago directly, not parsed via the browser's own timezone.
 */
export function getChicagoMonday(date: Date | string = new Date()): string {
  const instant = typeof date === 'string'
    ? fromZonedTime(`${date}T12:00:00`, PLANNER_TZ)
    : date;
  return formatInTimeZone(resolveMonday(instant, PLANNER_TZ), PLANNER_TZ, 'yyyy-MM-dd');
}

/**
 * Normalize any date input to a Chicago Monday string (YYYY-MM-DD)
 * Use this as the single source of truth for all planner date operations
 */
export function normalizeToPlannerWeek(input: Date | string): string {
  return getChicagoMonday(input);
}

/**
 * Check if a date string (yyyy-MM-dd) is a Monday in America/Chicago timezone
 */
export function isMondayChicago(dateStr: string): boolean {
  const date = new Date(dateStr + 'T12:00:00');
  const chicagoDateStr = date.toLocaleString('en-US', { timeZone: PLANNER_TZ });
  const chicagoDate = new Date(chicagoDateStr);

  return chicagoDate.getDay() === 1;
}

/**
 * Get next Monday from now in America/Chicago timezone. Delegates to the
 * canonical Monday resolver in submissionPolicy.ts.
 */
export function getNextMondayChicago(now: Date = new Date()): string {
  return formatInTimeZone(resolveNextMonday(now, PLANNER_TZ), PLANNER_TZ, 'yyyy-MM-dd');
}

/**
 * Format a date string (yyyy-MM-dd) as a display string
 */
export function formatWeekOf(dateStr: string): string {
  const date = new Date(dateStr + 'T12:00:00');
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: PLANNER_TZ
  });
}

/**
 * Calculate weeks ago from a date string to now
 */
export function weeksAgo(dateStr: string): number {
  const date = new Date(dateStr + 'T12:00:00');
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffWeeks = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000));
  return diffWeeks;
}
