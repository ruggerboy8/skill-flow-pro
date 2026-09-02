// DASH-1b: pure comparators for the Command Center's location grid. Which
// comparator runs depends on the page's moment (see dashboardMoment.ts) -
// wrap-up wants the worst-performing locations surfaced first as a calm
// archive, mid-week wants the locations that most need a nudge surfaced
// first.

/** Minimal shape wrapupComparator needs from a location's stats. */
export interface WrapupSortEntry {
  submissionRate: number;
}

/**
 * Wrap-up ordering: worst final rate first. This is exactly the dashboard's
 * original unconditional sort, extracted and named - behavior unchanged.
 */
export function wrapupComparator(a: WrapupSortEntry, b: WrapupSortEntry): number {
  return a.submissionRate - b.submissionRate;
}

/**
 * Minimal shape midweekComparator needs per location. Deliberately just
 * these two plain values (not live Date/timezone machinery) so the
 * comparator stays pure and testable - the page computes both once from
 * its existing policy calls, the same place it already builds
 * `locDeadlineLabel`.
 */
export interface MidweekSortEntry {
  /** The location's next upcoming deadline (confidence or performance), or
   * null when neither is known / both have already passed. */
  nextDeadlineAt: Date | null;
  /** How many staff still need to submit before that next deadline. */
  pendingCount: number;
}

/**
 * Mid-week ordering: "who needs a nudge first." Soonest deadline sorts
 * first. On a tie (including a tie of null vs null), higher pending count
 * sorts first, since a location with more people still outstanding needs
 * the nudge more urgently. A null deadline (nothing known, or everything
 * already past) always sorts after any location with a real deadline.
 */
export function midweekComparator(a: MidweekSortEntry, b: MidweekSortEntry): number {
  if (a.nextDeadlineAt === null && b.nextDeadlineAt === null) {
    return b.pendingCount - a.pendingCount;
  }
  if (a.nextDeadlineAt === null) return 1;
  if (b.nextDeadlineAt === null) return -1;

  const deadlineDiff = a.nextDeadlineAt.getTime() - b.nextDeadlineAt.getTime();
  if (deadlineDiff !== 0) return deadlineDiff;
  return b.pendingCount - a.pendingCount;
}
