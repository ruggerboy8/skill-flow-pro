/**
 * Canonical Submission Policy — Single Source of Truth
 *
 * All submission deadline logic across the app and SQL must derive from
 * the offsets defined here. In Phase 2 these become DB-driven per location.
 *
 * Semantics:
 *  - "due" and "late threshold" are the SAME timestamp.
 *  - A submission is "late"    if submitted_at > due.
 *  - A submission is "missing" if now > due AND submitted_at IS NULL.
 *  - There is no separate grace period.
 */

import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { addCalendarDays } from './calendarDate';

// ---------------------------------------------------------------------------
// Offset config — Phase 2: replace with DB-driven per-location values
// ---------------------------------------------------------------------------

export interface PolicyOffset {
  dayOffset: number; // 0 = Monday
  time: string;      // HH:mm:ss in local tz
}

export interface PolicyOffsets {
  checkin_open: PolicyOffset;
  checkin_visible: PolicyOffset;
  confidence_due: PolicyOffset;
  checkout_open: PolicyOffset;
  performance_due: PolicyOffset;
  week_end: PolicyOffset;
}

export const DEFAULT_POLICY_OFFSETS: PolicyOffsets = {
  checkin_open:    { dayOffset: 0, time: '00:01:00' },  // Mon 00:01
  checkin_visible: { dayOffset: 0, time: '06:00:00' },  // Mon 06:00
  confidence_due:  { dayOffset: 1, time: '14:00:00' },  // Tue 14:00
  checkout_open:   { dayOffset: 3, time: '00:01:00' },  // Thu 00:01
  performance_due: { dayOffset: 4, time: '17:00:00' },  // Fri 17:00
  week_end:        { dayOffset: 6, time: '23:59:59' },  // Sun 23:59:59
};

// ---------------------------------------------------------------------------
// Per-location offset builder
// ---------------------------------------------------------------------------

/**
 * Build a PolicyOffsets from location-specific deadline columns.
 * Only confidence_due and performance_due are overridable per location.
 * All other thresholds remain system defaults.
 */
export function getPolicyOffsetsForLocation(location: {
  conf_due_day?: number | null;
  conf_due_time?: string | null;
  perf_due_day?: number | null;
  perf_due_time?: string | null;
}): PolicyOffsets {
  return {
    ...DEFAULT_POLICY_OFFSETS,
    confidence_due: {
      dayOffset: location.conf_due_day ?? DEFAULT_POLICY_OFFSETS.confidence_due.dayOffset,
      time: location.conf_due_time ?? DEFAULT_POLICY_OFFSETS.confidence_due.time,
    },
    performance_due: {
      dayOffset: location.perf_due_day ?? DEFAULT_POLICY_OFFSETS.performance_due.dayOffset,
      time: location.perf_due_time ?? DEFAULT_POLICY_OFFSETS.performance_due.time,
    },
  };
}

// SQL-aligned intervals (for documentation / migration alignment)
export const SQL_CONF_DUE_INTERVAL = '1 day 14 hours';
export const SQL_PERF_DUE_INTERVAL = '4 days 17 hours';

// ---------------------------------------------------------------------------
// SubmissionPolicy interface
// ---------------------------------------------------------------------------

export interface SubmissionPolicy {
  /** Monday 00:00 local — week boundary */
  mondayZ: Date;
  /** Monday 00:00 local — week start / checkin opens */
  checkin_open: Date;
  /** Monday 09:00 local — UI visibility gate for confidence page */
  checkin_visible: Date;
  /** Tuesday 14:00 local — confidence due / late threshold */
  confidence_due: Date;
  /** Thursday 00:01 local — performance opens */
  checkout_open: Date;
  /** Friday 17:00 local — performance due / late threshold */
  performance_due: Date;
  /** Sunday 23:59:59 local — week boundary end */
  week_end: Date;

  // Pure comparator helpers (all compare against resolved UTC timestamps)
  isConfidenceVisible(now: Date): boolean;
  isConfidenceOpen(now: Date): boolean;
  isConfidenceLate(now: Date): boolean;
  isPerformanceOpen(now: Date): boolean;
  isPerformanceLate(now: Date): boolean;
  isWeekClosed(now: Date): boolean;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Canonical "what is the Monday of this week" resolver. Pure, with an
 * injectable `now`/`tz`, so every other Monday calculation in the app
 * should delegate to this one instead of reimplementing it.
 *
 * Returns the UTC instant for local midnight on the Monday of the week
 * containing `now`, as observed in `tz`.
 *
 * Does day arithmetic on the calendar-date string (via `addCalendarDays`),
 * not on the `Date` instant: date-fns' `addDays` mutates an instant using
 * the HOST runtime's own local timezone, which silently corrupts the
 * result whenever the host's DST transitions don't line up with `tz`'s.
 * See calendarDate.ts and COR-1.
 */
export function resolveMonday(now: Date, tz: string): Date {
  const isoDow = Number(formatInTimeZone(now, tz, 'i')); // 1=Mon..7=Sun
  const todayStr = formatInTimeZone(now, tz, 'yyyy-MM-dd');
  const mondayStr = addCalendarDays(todayStr, -(isoDow - 1));
  return fromZonedTime(`${mondayStr}T00:00:00`, tz); // Monday 00:00 as UTC instant
}

/**
 * The upcoming Monday, strictly after `now`'s week: if `now` falls on a
 * Monday, this is next week's Monday, not today. Built on `resolveMonday`.
 */
export function resolveNextMonday(now: Date, tz: string): Date {
  const mondayStr = formatInTimeZone(resolveMonday(now, tz), tz, 'yyyy-MM-dd');
  const nextMondayStr = addCalendarDays(mondayStr, 7);
  return fromZonedTime(`${nextMondayStr}T00:00:00`, tz);
}

/**
 * ASG-1 Fix 2: the ONE function both the assignment write side (planner
 * save, auto-assign, GlobalAssignmentBuilder) and the assignment read side
 * (locationState.assembleWeek) must call to compute the
 * `weekly_assignments.week_start_date` lookup key.
 *
 * weekly_assignments rows are org-level (location_id is null), so the week
 * key they are written and read under must be ONE canonical org timezone,
 * not each location's own timezone: otherwise a multi-timezone org (Alcan
 * spans Chicago, Denver, and New York) can write under one Monday and read
 * under a different one in the Sunday-night-to-Monday-morning rollover
 * window. See docs/specs/asg-1-weekly-assignment-visibility.md, Fix 2.
 *
 * Per-location timezone is untouched by this function and keeps driving
 * due-date/deadline display via getWeekAnchors(now, location.timezone, ...).
 * This function is ONLY for the assignment-lookup week key.
 *
 * Pure: same (now, orgTimezone) always produces the same 'yyyy-MM-dd' string.
 */
export function getAssignmentWeekMondayStr(now: Date, orgTimezone: string): string {
  return formatInTimeZone(resolveMonday(now, orgTimezone), orgTimezone, 'yyyy-MM-dd');
}

function resolveOffset(mondayZ: Date, offset: PolicyOffset, tz: string): Date {
  const mondayStr = formatInTimeZone(mondayZ, tz, 'yyyy-MM-dd');
  const targetStr = addCalendarDays(mondayStr, offset.dayOffset);
  return fromZonedTime(`${targetStr}T${offset.time}`, tz);
}

// ---------------------------------------------------------------------------
// Main factory
// ---------------------------------------------------------------------------

export function getSubmissionPolicy(
  now: Date,
  tz: string,
  offsets: PolicyOffsets = DEFAULT_POLICY_OFFSETS,
): SubmissionPolicy {
  const mondayZ = resolveMonday(now, tz);

  const checkin_open    = resolveOffset(mondayZ, offsets.checkin_open, tz);
  const checkin_visible = resolveOffset(mondayZ, offsets.checkin_visible, tz);
  const confidence_due  = resolveOffset(mondayZ, offsets.confidence_due, tz);
  const checkout_open   = resolveOffset(mondayZ, offsets.checkout_open, tz);
  const performance_due = resolveOffset(mondayZ, offsets.performance_due, tz);
  const week_end        = resolveOffset(mondayZ, offsets.week_end, tz);

  return {
    mondayZ,
    checkin_open,
    checkin_visible,
    confidence_due,
    checkout_open,
    performance_due,
    week_end,

    isConfidenceVisible: (n: Date) => n >= checkin_visible,
    isConfidenceOpen:    (n: Date) => n >= checkin_open,
    isConfidenceLate:    (n: Date) => n >= confidence_due,
    isPerformanceOpen:   (n: Date) => n >= checkout_open,
    isPerformanceLate:   (n: Date) => n >= performance_due,
    isWeekClosed:        (n: Date) => n >= week_end,
  };
}
