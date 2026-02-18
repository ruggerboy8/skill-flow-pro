import { getSubmissionPolicy } from '@/lib/submissionPolicy';

export interface V2Anchors {
  mondayZ: Date;
  checkin_open: Date;            // Mon 00:00 local tz
  checkin_due: Date;             // Tue 14:00 local tz
  checkout_open: Date;           // Thu 00:01 local tz
  checkout_due: Date;            // Fri 17:00 local tz
  week_end: Date;                // Sun 23:59:59 local tz
}

/**
 * Delegates to the canonical submissionPolicy module.
 */
export function getWeekAnchors(now: Date, tz: string): V2Anchors {
  const policy = getSubmissionPolicy(now, tz);
  return {
    mondayZ: policy.mondayZ,
    checkin_open: policy.checkin_open,
    checkin_due: policy.confidence_due,
    checkout_open: policy.checkout_open,
    checkout_due: policy.performance_due,
    week_end: policy.week_end,
  };
}
