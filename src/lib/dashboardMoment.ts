// DASH-1b: moment detection for the Command Center's moment-aware layout.
// The page has exactly two moments: mid-week (nudge toward a deadline) and
// wrap-up (review what was missed). This module is the single source of
// truth for which one is active, so section ordering, banner titles, and
// grid sorting all agree with each other.

import type { SubmissionGates } from '@/lib/submissionStatus';

export type DashboardMoment = 'midweek' | 'wrapup';

/**
 * Decide the page's moment from the per-location submission gates.
 *
 * Per the spec ("mid-week (any window still open) vs wrap-up (all locations
 * past their performance deadline)"), the performance deadline is the
 * authoritative wrap-up gate: a location that is past its confidence
 * deadline but not yet its performance deadline still has a window open
 * (performance), so the page stays in 'midweek'.
 *
 * 'wrapup' only when every known location is past its performance deadline.
 * With no locations at all there is nothing to wrap up or nudge toward, so
 * this defaults to 'midweek' rather than showing wrap-up framing ("missed
 * this week") over an empty page.
 */
export function getDashboardMoment(
  locationGates: Map<string, SubmissionGates> | SubmissionGates[],
): DashboardMoment {
  const gatesList = Array.isArray(locationGates)
    ? locationGates
    : Array.from(locationGates.values());

  if (gatesList.length === 0) return 'midweek';

  const allPastPerformanceDeadline = gatesList.every(g => g.isPastPerformanceDeadline);
  return allPastPerformanceDeadline ? 'wrapup' : 'midweek';
}
