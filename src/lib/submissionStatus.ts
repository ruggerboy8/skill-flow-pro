import { StaffWeekSummary } from '@/types/coachV2';

interface WeekAnchors {
  confidence_deadline: Date;
  checkout_open: Date;
}

export interface SubmissionGates {
  isPastConfidenceDeadline: boolean;
  isPerformanceOpen: boolean;
}

export function getSubmissionGates(now: Date, anchors: WeekAnchors): SubmissionGates {
  return {
    isPastConfidenceDeadline: now >= anchors.confidence_deadline,
    isPerformanceOpen: now >= anchors.checkout_open,
  };
}

export function calculateMissingCounts(
  staff: StaffWeekSummary[], 
  gates: SubmissionGates
): { missingConfCount: number; missingPerfCount: number } {
  // Count STAFF members missing confidence (only after Tue deadline)
  const missingConfCount = gates.isPastConfidenceDeadline 
    ? staff.filter(s => s.conf_count < s.assignment_count).length 
    : 0;
  
  // Count STAFF members missing performance (only after Thu open)
  const missingPerfCount = gates.isPerformanceOpen 
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
  avgConfidence: number;
  avgPerformance: number;
} {
  const staffCount = staff.length;
  
  // Time-gated submission rate calculation
  // Before Thursday: only count confidence (X conf submitted / X slots)
  // After Thursday: count both (X conf + X perf submitted / 2X slots)
  let totalRequired = 0;
  let totalSubmitted = 0;
  
  staff.forEach(s => {
    // Confidence is always counted once it's past the deadline
    if (gates.isPastConfidenceDeadline) {
      totalRequired += s.assignment_count;
      totalSubmitted += s.conf_count;
    }
    // Performance only counted after Thursday
    if (gates.isPerformanceOpen) {
      totalRequired += s.assignment_count;
      totalSubmitted += s.perf_count;
    }
  });
  // If nothing is due yet, show 100% (everyone on track)
  const submissionRate = totalRequired > 0 ? (totalSubmitted / totalRequired) * 100 : 100;
  
  const { missingConfCount, missingPerfCount } = calculateMissingCounts(staff, gates);
  
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
    submissionRate,
    missingConfCount,
    missingPerfCount,
    avgConfidence,
    avgPerformance,
  };
}
