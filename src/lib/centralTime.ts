import { addDays } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';
import { getSubmissionPolicy, type PolicyOffsets } from '@/lib/submissionPolicy';

export const CT_TZ = 'America/Chicago';

// Always use plain Date.now() for comparisons (UTC instant)
export function nowUtc(): Date {
  return new Date();
}

/**
 * Enhanced anchors with all time windows for current week.
 * Delegates to the canonical submissionPolicy module.
 * Optional offsets parameter for per-location deadline overrides.
 */
export function getWeekAnchors(now: Date = nowUtc(), tz: string = CT_TZ, offsets?: PolicyOffsets) {
  const policy = getSubmissionPolicy(now, tz, offsets);

  return {
    // Canonical policy values
    checkin_open: policy.checkin_open,
    confidence_deadline: policy.confidence_due,
    checkout_open: policy.checkout_open,
    performance_deadline: policy.performance_due,
    week_end: policy.week_end,

    // Legacy aliases — keep for backward compat
    mondayZ: policy.mondayZ,
    monCheckInZ: policy.checkin_visible,          // Mon 09:00 (UI gate)
    tueDueZ: policy.confidence_due,               // Tue 14:00
    thuStartZ: policy.checkout_open,              // Thu 00:01
    friStartZ: policy.performance_due,            // Fri 17:00 (repurposed from old Fri 00:00)
    sunEndZ: policy.week_end,                     // Sun 23:59:59
  };
}

/**
 * Legacy anchors — delegates to getWeekAnchors.
 * Accepts an optional timezone string; defaults to CT_TZ for backward compat.
 * Prefer passing the user's location timezone via useLocationTimezone().
 */
export function getAnchors(now: Date = nowUtc(), tz: string = CT_TZ) {
  return getWeekAnchors(now, tz);
}

// For friendly dates like "Mon, Aug 25"
// Pass the user's location timezone via useLocationTimezone() to get correct results.
export function nextMondayStr(now: Date = nowUtc(), tz: string = CT_TZ) {
  const { monCheckInZ } = getAnchors(now, tz);
  const nextMon = addDays(monCheckInZ, 7);
  return formatInTimeZone(nextMon, tz, 'EEE, MMM d');
}
