import { getISOWeek, getISOWeekYear } from 'date-fns';
import { getWeekAnchors, CT_TZ } from './centralTime';

export type StatusColor = "grey" | "yellow" | "green" | "red";
export type WeekState = 'no_assignments' | 'missed_checkin' | 'can_checkin' | 'wait_for_thu' | 'can_checkout' | 'missed_checkout' | 'done';

export interface WeekKey {
  cycle: number;
  week_in_cycle: number;
  iso_year: number;
  iso_week: number;
}

export interface StaffWeekStatus {
  color: StatusColor;
  reason: string;
  state: WeekState;
  subtext?: string;
  tooltip?: string;
  blocked: boolean;
  confCount: number;
  perfCount: number;
  target?: WeekKey;
}

// Helper to clamp counts to expected max of 3
const clamp3 = (n: number) => Math.max(0, Math.min(3, n));

export function computeStaffStatus(
  weeklyScores: Array<{
    confidence_score: number | null;
    performance_score: number | null;
    updated_at: string | null;
    weekly_focus: {
      id: string;
      cycle: number;
      week_in_cycle: number;
      iso_year: number;
      iso_week: number;
    };
  }>,
  roleId: number,
  currentWeek: WeekKey | undefined,
  now: Date = new Date()
): StaffWeekStatus {
  // Get consistent time anchors
  const anchors = getWeekAnchors(now, CT_TZ);
  const nowIsoWeek = getISOWeek(now);
  const nowIsoYear = getISOWeekYear(now);

  // Helper to count scores for a specific week
  const countFor = (wk?: { cycle: number; week_in_cycle: number }) => {
    if (!wk) return { conf: 0, perf: 0 };
    const subset = weeklyScores.filter(
      (s) =>
        s.weekly_focus.cycle === wk.cycle &&
        s.weekly_focus.week_in_cycle === wk.week_in_cycle
    );
    const conf = clamp3(subset.filter((s) => s.confidence_score !== null).length);
    const perf = clamp3(subset.filter((s) => s.performance_score !== null).length);
    return { conf, perf };
  };

  // Priority order evaluation (return first match)
  
  // 1. no_assignments - Check if current week has no configured pro-moves
  if (!currentWeek || countFor(currentWeek).conf === 0) {
    return {
      color: "grey",
      reason: "No assignments",
      state: "no_assignments",
      subtext: "Not configured",
      blocked: false,
      confCount: 0,
      perfCount: 0,
      target: currentWeek,
    };
  }

  const currentCounts = countFor(currentWeek);
  const hasConfidence = currentCounts.conf >= 3;
  const hasPerformance = currentCounts.perf >= 3;

  // 2. missed_checkin - After Tue 12:00 with no confidence
  if (now > anchors.confidence_deadline && !hasConfidence) {
    return {
      color: "red",
      reason: "Missed check-in",
      state: "missed_checkin",
      tooltip: "Confidence was due by Tuesday 12:00 PM",
      blocked: false,
      confCount: currentCounts.conf,
      perfCount: currentCounts.perf,
      target: currentWeek,
    };
  }

  // 3. can_checkin - Before Tue 12:00 with no confidence
  if (now <= anchors.confidence_deadline && !hasConfidence) {
    return {
      color: "yellow",
      reason: "Can check in",
      state: "can_checkin",
      tooltip: "Confidence due by Tuesday 12:00 PM",
      blocked: false,
      confCount: currentCounts.conf,
      perfCount: currentCounts.perf,
      target: currentWeek,
    };
  }

  // 4. wait_for_thu - Confidence is in, before Thu 12:01
  if (hasConfidence && now < anchors.checkout_open) {
    return {
      color: "green",
      reason: "Waiting for Thursday",
      state: "wait_for_thu",
      tooltip: "Performance opens Thursday 12:01 PM",
      blocked: false,
      confCount: currentCounts.conf,
      perfCount: currentCounts.perf,
      target: currentWeek,
    };
  }

  // 5. can_checkout - Thu 12:01 → Fri 17:00, confidence in, performance not
  if (hasConfidence && !hasPerformance && now >= anchors.checkout_open && now <= anchors.performance_deadline) {
    return {
      color: "yellow",
      reason: "Can check out",
      state: "can_checkout",
      tooltip: "Performance due by Friday 5:00 PM",
      blocked: false,
      confCount: currentCounts.conf,
      perfCount: currentCounts.perf,
      target: currentWeek,
    };
  }

  // 6. missed_checkout - After Fri 17:00, confidence in, performance not
  if (hasConfidence && !hasPerformance && now > anchors.performance_deadline) {
    return {
      color: "red",
      reason: "Missed check-out",
      state: "missed_checkout",
      tooltip: "Performance was due by Friday 5:00 PM",
      blocked: true,
      confCount: currentCounts.conf,
      perfCount: currentCounts.perf,
      target: currentWeek,
    };
  }

  // 7. done - Both confidence and performance are in
  if (hasConfidence && hasPerformance) {
    return {
      color: "green",
      reason: "Complete",
      state: "done",
      tooltip: "Week completed successfully",
      blocked: false,
      confCount: currentCounts.conf,
      perfCount: currentCounts.perf,
      target: currentWeek,
    };
  }

  // Fallback (shouldn't reach here)
  return {
    color: "grey",
    reason: "Unknown state",
    state: "no_assignments",
    blocked: false,
    confCount: currentCounts.conf,
    perfCount: currentCounts.perf,
    target: currentWeek,
  };
}

export function getSortRank(status: StaffWeekStatus): number {
  // Priority: Red (0) -> Yellow (1) -> Green (2) -> Neutral/others (3)
  if (status.color === 'red') return 0;
  if (status.color === 'yellow') return 1;
  if (status.color === 'green') return 2;
  return 3;
}