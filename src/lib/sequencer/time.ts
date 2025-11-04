/**
 * Phase 2: Timezone-aware time utilities
 * 
 * Wraps existing date-fns-tz utilities for consistent timezone handling.
 * Avoids raw JS Date arithmetic to prevent DST edge cases.
 */

import { addDays } from 'date-fns';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';

/**
 * Get the Monday of the week following the effective date.
 * 
 * @param effectiveDate - Typically a Saturday "as of" date
 * @param tz - Timezone (e.g., "America/Chicago")
 * @returns Date object representing Monday 00:00:00 in the given timezone
 */
export function startOfNextWeekMonday(effectiveDate: Date, tz: string): Date {
  // Get ISO day of week (1=Mon, 7=Sun)
  const isoDow = Number(formatInTimeZone(effectiveDate, tz, 'i'));
  
  // Get midnight of the effective date in the timezone
  const localYMD = formatInTimeZone(effectiveDate, tz, 'yyyy-MM-dd');
  const localMidnightUtc = fromZonedTime(`${localYMD}T00:00:00`, tz);
  
  // Calculate days until next Monday
  // If we're on Saturday (6), we want +2 days to get to Monday
  // If we're on Sunday (7), we want +1 day to get to Monday
  // If we're on Monday (1), we want +7 days to get to next Monday
  const daysUntilNextMonday = isoDow === 7 ? 1 : (8 - isoDow);
  
  return addDays(localMidnightUtc, daysUntilNextMonday);
}

/**
 * Add weeks to a date in a timezone-aware manner.
 * 
 * @param date - Starting date
 * @param weeks - Number of weeks to add (can be negative)
 * @param tz - Timezone for the calculation
 * @returns New date offset by the specified weeks
 */
export function addWeeks(date: Date, weeks: number, tz: string): Date {
  // Stay aligned to local midnight when adding weeks
  const localYMD = formatInTimeZone(date, tz, 'yyyy-MM-dd');
  const localMidnightUtc = fromZonedTime(`${localYMD}T00:00:00`, tz);
  return addDays(localMidnightUtc, weeks * 7);
}

/**
 * Convert a Date to ISO date string (YYYY-MM-DD) in the given timezone.
 * 
 * @param date - Date to format
 * @param tz - Timezone for the output
 * @returns ISO date string (YYYY-MM-DD)
 */
export function toISODate(date: Date, tz: string): string {
  return formatInTimeZone(date, tz, 'yyyy-MM-dd');
}

/**
 * Calculate weeks between two ISO date strings, respecting timezone.
 * 
 * @param isoA - Earlier date (YYYY-MM-DD)
 * @param isoB - Later date (YYYY-MM-DD)
 * @param tz - Timezone for calculation
 * @returns Number of weeks between dates (rounded)
 */
export function weeksBetween(isoA: string, isoB: string, tz: string): number {
  const aUtc = fromZonedTime(`${isoA}T00:00:00`, tz);
  const bUtc = fromZonedTime(`${isoB}T00:00:00`, tz);
  const diffMs = bUtc.getTime() - aUtc.getTime();
  return Math.max(0, Math.round(diffMs / (7 * 24 * 60 * 60 * 1000)));
}
