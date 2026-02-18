import { StaffWeekSummary } from '@/types/coachV2';

interface WeekAnchors {
  confidence_deadline?: Date;
  confidence_due?: Date;
  checkout_open: Date;
}

export interface SubmissionGates {
  isPastConfidenceDeadline: boolean;
  isPerformanceOpen: boolean;
}

export function getSubmissionGates(now: Date, anchors: WeekAnchors): SubmissionGates {
  const confDeadline = anchors.confidence_deadline ?? anchors.confidence_due;
  return {
    isPastConfidenceDeadline: confDeadline ? now >= confDeadline : false,
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
  pendingConfCount: number;
  avgConfidence: number;
  avgPerformance: number;
} {
  const staffCount = staff.length;
  
  // Calculate submission rate based on what's currently expected
  // Before Tuesday deadline: show confidence completion progress (not gated)
  // After Thursday: include both confidence and performance
  let totalRequired = 0;
  let totalSubmitted = 0;
  
  // Always track confidence progress (this is the current week's main task)
  staff.forEach(s => {
    totalRequired += s.assignment_count;
    totalSubmitted += s.conf_count;
  });
  
  // After Thursday, also track performance
  if (gates.isPerformanceOpen) {
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
  
  return {
    staffCount,
    submissionRate,
    missingConfCount,
    missingPerfCount,
    pendingConfCount,
    avgConfidence,
    avgPerformance,
  };
}
