import { StaffWeekSummary } from '@/types/coachV2';
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

export function calculateMissingCounts(
  staff: StaffWeekSummary[], 
  gates: SubmissionGates
): { missingConfCount: number; missingPerfCount: number } {
  // Count STAFF members missing confidence (only after deadline)
  const missingConfCount = gates.isPastConfidenceDeadline 
    ? staff.filter(s => s.conf_count < s.assignment_count).length 
    : 0;
  
  // Count STAFF members missing performance (only after perf deadline)
  const missingPerfCount = gates.isPastPerformanceDeadline 
    ? staff.filter(s => s.perf_count < s.assignment_count).length 
    : 0;
  
  return { missingConfCount, missingPerfCount };
}

export function calculateLocationStats(
  staff: StaffWeekSummary[],
  gates: SubmissionGates
): {
  staffCount: number;
  submissionRate: number;
  missingConfCount: number;
  missingPerfCount: number;
  pendingConfCount: number;
  avgConfidence: number;
  avgPerformance: number;
} {
  const staffCount = staff.length;
  
  // Deadline-aware submission rate:
  // Only count a metric toward totalRequired once its deadline has passed.
  // Before any deadline → rate is 100% (nothing is due yet).
  let totalRequired = 0;
  let totalSubmitted = 0;
  
  // Confidence counts toward rate only after confidence deadline
  if (gates.isPastConfidenceDeadline) {
    staff.forEach(s => {
      totalRequired += s.assignment_count;
      totalSubmitted += s.conf_count;
    });
  }
  
  // Performance counts toward rate only after performance deadline
  if (gates.isPastPerformanceDeadline) {
    staff.forEach(s => {
      totalRequired += s.assignment_count;
      totalSubmitted += s.perf_count;
    });
  }
  
  const submissionRate = totalRequired > 0 ? (totalSubmitted / totalRequired) * 100 : 100;
  
  // "Missing" counts are for LATE submissions (past deadline)
  const { missingConfCount, missingPerfCount } = calculateMissingCounts(staff, gates);
  
  // "Pending" count is for not-yet-submitted but not yet late (before deadline)
  const pendingConfCount = !gates.isPastConfidenceDeadline 
    ? staff.filter(s => s.conf_count < s.assignment_count).length 
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
  
  // Raw submission counts (regardless of deadline state)
  let confSubmittedCount = 0;
  let confExpectedCount = 0;
  let perfSubmittedCount = 0;
  let perfExpectedCount = 0;
  staff.forEach(s => {
    confExpectedCount += s.assignment_count;
    perfExpectedCount += s.assignment_count;
    confSubmittedCount += s.conf_count;
    perfSubmittedCount += s.perf_count;
  });

  return {
    staffCount,
    submissionRate,
    missingConfCount,
    missingPerfCount,
    pendingConfCount,
    avgConfidence,
    avgPerformance,
    confSubmittedCount,
    confExpectedCount,
    perfSubmittedCount,
    perfExpectedCount,
  };
}
