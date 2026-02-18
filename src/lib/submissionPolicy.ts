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

import { addDays } from 'date-fns';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';

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
  checkin_open:    { dayOffset: 0, time: '00:00:00' },  // Mon 00:00
  checkin_visible: { dayOffset: 0, time: '09:00:00' },  // Mon 09:00
  confidence_due:  { dayOffset: 1, time: '14:00:00' },  // Tue 14:00
  checkout_open:   { dayOffset: 3, time: '00:01:00' },  // Thu 00:01
  performance_due: { dayOffset: 4, time: '17:00:00' },  // Fri 17:00
  week_end:        { dayOffset: 6, time: '23:59:59' },  // Sun 23:59:59
};

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

function resolveMonday(now: Date, tz: string): Date {
  const isoDow = Number(formatInTimeZone(now, tz, 'i')); // 1=Mon..7=Sun
  const todayMidnightUtc = fromZonedTime(
    `${formatInTimeZone(now, tz, 'yyyy-MM-dd')}T00:00:00`,
    tz,
  );
  return addDays(todayMidnightUtc, -(isoDow - 1)); // Monday 00:00 as UTC instant
}

function resolveOffset(mondayZ: Date, offset: PolicyOffset, tz: string): Date {
  const targetDay = addDays(mondayZ, offset.dayOffset);
  return fromZonedTime(
    `${formatInTimeZone(targetDay, tz, 'yyyy-MM-dd')}T${offset.time}`,
    tz,
  );
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
