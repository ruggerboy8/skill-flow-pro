// DASH-5: one severity comparator for the Command Center's location grid,
// replacing the DASH-1b moment-switched pair (wrapupComparator /
// midweekComparator). The grid always leads with whoever is in the worst
// shape given the current point in the weekly timeline:
//
//   1. red        - past a deadline with a real shortfall, worst rate first
//   2. watch      - past a deadline, 60-84%, worst rate first
//   3. at risk    - nothing due yet but people still pending: soonest
//                   deadline first, then most people pending
//   4. on track   - done or healthy, worst rate first (a post-deadline 86%
//                   sits above a clean 100%)
//   5. no work    - nothing published this week (owedStaffCount 0), last
//
// Pure data in, number out - the page computes tier/deadline/pending once
// (the same values the cards already render) so sort and display can never
// disagree.

import type { ParticipationTier } from '@/lib/participationTier';

export interface GridSortEntry {
  /** The same tier the location's card renders (excuse-adjusted). */
  tier: ParticipationTier;
  /** People who owe submissions this week; 0 = nothing published. */
  owedStaffCount: number;
  /** The card's excuse-adjusted submission rate, 0-100. */
  submissionRate: number;
  /** Next upcoming deadline, or null when none is pending. */
  nextDeadlineAt: Date | null;
  /** People still outstanding before that next deadline. */
  pendingCount: number;
}

type SeverityBand = 0 | 1 | 2 | 3 | 4;

export function severityBand(e: GridSortEntry): SeverityBand {
  if (e.owedStaffCount === 0) return 4;
  if (e.tier === 'red') return 0;
  if (e.tier === 'watch') return 1;
  if (e.nextDeadlineAt !== null && e.pendingCount > 0) return 2;
  return 3;
}

export function severityComparator(a: GridSortEntry, b: GridSortEntry): number {
  const bandA = severityBand(a);
  const bandB = severityBand(b);
  if (bandA !== bandB) return bandA - bandB;

  if (bandA === 2) {
    // At risk: soonest deadline first, then most people pending.
    const timeA = a.nextDeadlineAt!.getTime();
    const timeB = b.nextDeadlineAt!.getTime();
    if (timeA !== timeB) return timeA - timeB;
    return b.pendingCount - a.pendingCount;
  }

  // Everywhere else: worst rate first, most pending as the tiebreak.
  if (a.submissionRate !== b.submissionRate) return a.submissionRate - b.submissionRate;
  return b.pendingCount - a.pendingCount;
}
