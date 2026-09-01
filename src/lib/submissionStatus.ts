import { StaffWeekSummary } from '@/types/coachV2';
import { isCheckedIn, isCheckedOut, owedStaff } from '@/lib/coachUtils';
import { getSubmissionPolicy, getPolicyOffsetsForLocation, type PolicyOffsets } from '@/lib/submissionPolicy';

interface WeekAnchors {
  confidence_deadline?: Date;
  confidence_due?: Date;
  checkout_open: Date;
}

export interface SubmissionGates {
  isPastConfidenceDeadline: boolean;
  isPastPerformanceDeadline: boolean;
  isPerformanceOpen: boolean;
}

export function getSubmissionGates(now: Date, anchors: WeekAnchors): SubmissionGates {
  const confDeadline = anchors.confidence_deadline ?? anchors.confidence_due;
  return {
    isPastConfidenceDeadline: confDeadline ? now >= confDeadline : false,
    isPastPerformanceDeadline: false, // legacy callers don't have this — safe default
    isPerformanceOpen: now >= anchors.checkout_open,
  };
}

/**
 * Build deadline-aware submission gates for a specific location.
 */
export function getLocationSubmissionGates(
  now: Date,
  locationConfig: { timezone: string; conf_due_day: number; conf_due_time: string; perf_due_day: number; perf_due_time: string },
): SubmissionGates {
  const offsets = getPolicyOffsetsForLocation(locationConfig);
  const policy = getSubmissionPolicy(now, locationConfig.timezone, offsets);
  return {
    isPastConfidenceDeadline: policy.isConfidenceLate(now),
    isPastPerformanceDeadline: policy.isPerformanceLate(now),
    isPerformanceOpen: policy.isPerformanceOpen(now),
  };
}

/**
 * DASH-5: all location-level counting is PEOPLE-based. A person counts as
 * checked in/out only when every required move for the week has the rating
 * (see isCheckedIn/isCheckedOut in coachUtils); a person with
 * required_count 0 (no assignments published for them this week) is
 * excluded from every numerator and denominator here, so a location whose
 * whole roster owes nothing reads as "no assignments", never as 0%.
 */
export function calculateMissingCounts(
  staff: StaffWeekSummary[],
  gates: SubmissionGates
): { missingConfCount: number; missingPerfCount: number } {
  const owed = owedStaff(staff);
  // Count STAFF members missing confidence (only after deadline)
  const missingConfCount = gates.isPastConfidenceDeadline
    ? owed.filter(s => !isCheckedIn(s)).length
    : 0;

  // Count STAFF members missing performance (only after perf deadline)
  const missingPerfCount = gates.isPastPerformanceDeadline
    ? owed.filter(s => !isCheckedOut(s)).length
    : 0;

  return { missingConfCount, missingPerfCount };
}

/**
 * DASH-1a QA fix: count DISTINCT staff who are missing at least one
 * past-deadline submission, so a person missing both confidence and
 * performance is counted once, not twice. missingConfCount + missingPerfCount
 * double-counts that person and can wrongly clear the small-team guard in
 * participationTier (see src/lib/participationTier.ts).
 */
export function calculateDistinctMissedCount(
  staff: StaffWeekSummary[],
  gates: SubmissionGates
): number {
  return owedStaff(staff).filter(s => {
    const missedConf = gates.isPastConfidenceDeadline && !isCheckedIn(s);
    const missedPerf = gates.isPastPerformanceDeadline && !isCheckedOut(s);
    return missedConf || missedPerf;
  }).length;
}

export interface DueSubmissionTotals {
  confSubmitted: number;
  confExpected: number;
  perfSubmitted: number;
  perfExpected: number;
}

/**
 * DASH-1a Codex fix (P1), reworked people-based in DASH-5: counts of PEOPLE
 * done vs owing, but only for whichever metric is actually due (its deadline
 * gate is true). Pass gates with any excused metric already turned off, the
 * same way calculateDistinctMissedCount is called, so an excused-but-due
 * metric is treated as not due either.
 */
export function calculateDueSubmissionTotals(
  staff: StaffWeekSummary[],
  gates: SubmissionGates
): DueSubmissionTotals {
  const owed = owedStaff(staff);
  let confSubmitted = 0;
  let confExpected = 0;
  let perfSubmitted = 0;
  let perfExpected = 0;

  if (gates.isPastConfidenceDeadline) {
    confExpected = owed.length;
    confSubmitted = owed.filter(isCheckedIn).length;
  }

  if (gates.isPastPerformanceDeadline) {
    perfExpected = owed.length;
    perfSubmitted = owed.filter(isCheckedOut).length;
  }

  return { confSubmitted, confExpected, perfSubmitted, perfExpected };
}

export function calculateLocationStats(
  staff: StaffWeekSummary[],
  gates: SubmissionGates
): {
  staffCount: number;
  owedStaffCount: number;
  submissionRate: number;
  missingConfCount: number;
  missingPerfCount: number;
  distinctMissedCount: number;
  pendingConfCount: number;
  avgConfidence: number;
  avgPerformance: number;
  confSubmittedCount: number;
  confExpectedCount: number;
  perfSubmittedCount: number;
  perfExpectedCount: number;
} {
  const staffCount = staff.length;
  const owed = owedStaff(staff);
  const owedStaffCount = owed.length;
  const checkedInCount = owed.filter(isCheckedIn).length;
  const checkedOutCount = owed.filter(isCheckedOut).length;

  // Deadline-aware submission rate, people-based (DASH-5):
  // Only count a metric toward totalRequired once its deadline has passed.
  // Before any deadline → rate is 100% (nothing is due yet).
  let totalRequired = 0;
  let totalSubmitted = 0;

  // Confidence counts toward rate only after confidence deadline
  if (gates.isPastConfidenceDeadline) {
    totalRequired += owedStaffCount;
    totalSubmitted += checkedInCount;
  }

  // Performance counts toward rate only after performance deadline
  if (gates.isPastPerformanceDeadline) {
    totalRequired += owedStaffCount;
    totalSubmitted += checkedOutCount;
  }

  const submissionRate = totalRequired > 0 ? (totalSubmitted / totalRequired) * 100 : 100;

  // "Missing" counts are for LATE submissions (past deadline)
  const { missingConfCount, missingPerfCount } = calculateMissingCounts(staff, gates);
  const distinctMissedCount = calculateDistinctMissedCount(staff, gates);

  // "Pending" count is for not-yet-submitted but not yet late (before deadline)
  const pendingConfCount = !gates.isPastConfidenceDeadline
    ? owed.filter(s => !isCheckedIn(s)).length
    : 0;

  // Calculate averages from scores
  let totalConf = 0;
  let confCount = 0;
  let totalPerf = 0;
  let perfCount = 0;

  staff.forEach(s => {
    s.scores.forEach(score => {
      if (score.confidence_score !== null) {
        totalConf += score.confidence_score;
        confCount++;
      }
      if (score.performance_score !== null) {
        totalPerf += score.performance_score;
        perfCount++;
      }
    });
  });

  const avgConfidence = confCount > 0 ? totalConf / confCount : 0;
  const avgPerformance = perfCount > 0 ? totalPerf / perfCount : 0;

  return {
    staffCount,
    owedStaffCount,
    submissionRate,
    missingConfCount,
    missingPerfCount,
    distinctMissedCount,
    pendingConfCount,
    avgConfidence,
    avgPerformance,
    // People done vs people owing, regardless of deadline state - the
    // card's neutral pre-deadline progress display ("5/8 checked in").
    confSubmittedCount: checkedInCount,
    confExpectedCount: owedStaffCount,
    perfSubmittedCount: checkedOutCount,
    perfExpectedCount: owedStaffCount,
  };
}

/**
 * DASH-4: excuse-aware view of calculateLocationStats, shared by the
 * Regional Command Center and Location Detail so an excused location can
 * never show different numbers on the two pages. An excused metric is
 * treated as not due: its missing/pending counts drop to zero, a fully
 * excused location reads 100%, and the effective gates (with excused
 * metrics turned off) drive the distinct-missed count and the due-only
 * submission totals.
 */
export function calculateExcuseAdjustedLocationStats(
  staff: StaffWeekSummary[],
  gates: SubmissionGates,
  excuseStatus: { isConfExcused: boolean; isPerfExcused: boolean },
): ReturnType<typeof calculateLocationStats> & {
  effectiveGates: SubmissionGates;
  dueTotals: DueSubmissionTotals;
} {
  const locStats = calculateLocationStats(staff, gates);

  let missingConfCount = locStats.missingConfCount;
  let missingPerfCount = locStats.missingPerfCount;
  let pendingConfCount = locStats.pendingConfCount;
  let submissionRate = locStats.submissionRate;

  if (excuseStatus.isConfExcused) {
    missingConfCount = 0;
    pendingConfCount = 0;
  }
  if (excuseStatus.isPerfExcused) {
    missingPerfCount = 0;
  }
  if (excuseStatus.isConfExcused && excuseStatus.isPerfExcused) {
    submissionRate = 100;
  }

  const effectiveGates: SubmissionGates = {
    ...gates,
    isPastConfidenceDeadline: gates.isPastConfidenceDeadline && !excuseStatus.isConfExcused,
    isPastPerformanceDeadline: gates.isPastPerformanceDeadline && !excuseStatus.isPerfExcused,
  };

  return {
    ...locStats,
    submissionRate,
    missingConfCount,
    missingPerfCount,
    pendingConfCount,
    distinctMissedCount: calculateDistinctMissedCount(staff, effectiveGates),
    effectiveGates,
    dueTotals: calculateDueSubmissionTotals(staff, effectiveGates),
  };
}
