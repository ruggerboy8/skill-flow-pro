import { supabase } from '@/integrations/supabase/client';
import { computeWeekState as computeLocationWeekState, StaffStatus } from '@/lib/locationState';

export type StatusColor = "grey" | "yellow" | "green" | "red";
export type WeekState = 'onboarding' | 'no_assignments' | 'missed_checkin' | 'can_checkin' | 'can_checkout' | 'missed_checkout' | 'done';

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
  nextAction?: string;
  deadlineAt?: Date;
  backlogCount: number;
  selectionPending: boolean;
  lastActivity?: { kind: 'confidence' | 'performance'; at: Date };
  onboardingWeeksLeft?: number;
}

/**
 * Compute staff status using new unified site-centric model
 */
export async function computeStaffStatusNew(
  userId: string,
  staffData: {
    id: string;
    role_id: number;
    hire_date?: string | null;
    onboarding_weeks: number;
    primary_location_id?: string | null;
  },
  now?: Date
): Promise<StaffWeekStatus> {
  try {
    if (!staffData.primary_location_id) {
      return {
        color: 'grey' as StatusColor,
        reason: 'No location assigned',
        state: 'no_assignments',
        blocked: false,
        confCount: 0,
        perfCount: 0,
        backlogCount: 0,
        selectionPending: false
      };
    }

    // Use the location-based computeWeekState
    const status = await computeLocationWeekState({
      userId,
      locationId: staffData.primary_location_id,
      roleId: staffData.role_id,
      now
    });

    // Map to old format for compatibility
    const color: StatusColor = 
      status.state === 'onboarding' ? 'grey' :
      status.state === 'no_assignments' ? 'grey' :
      status.state === 'missed_checkin' || status.state === 'missed_checkout' ? 'red' :
      status.state === 'can_checkin' || status.state === 'can_checkout' ? 'yellow' :
      status.state === 'done' ? 'green' : 'grey';

    const reason = 
      status.state === 'onboarding' ? `Onboarding (${status.onboardingWeeksLeft || 0} wks left)` :
      status.state === 'no_assignments' ? 'No assignments' :
      status.state === 'missed_checkin' ? 'Missed check-in' :
      status.state === 'can_checkin' ? 'Can check in' :
      status.state === 'can_checkout' ? 'Can check out' :
      status.state === 'missed_checkout' ? 'Missed check-out' :
      status.state === 'done' ? 'Complete' : 'Unknown';

    return {
      color,
      reason,
      state: status.state,
      subtext: status.state === 'onboarding' ? 'Not participating yet' : undefined,
      tooltip: getTooltipForState(status.state, status.deadlineAt),
      blocked: status.state === 'missed_checkout',
      confCount: 0,
      perfCount: 0,
      nextAction: status.nextAction,
      deadlineAt: status.deadlineAt,
      backlogCount: status.backlogCount,
      selectionPending: status.selectionPending,
      lastActivity: status.lastActivity,
      onboardingWeeksLeft: status.onboardingWeeksLeft
    };
  } catch (error) {
    console.error('Error computing staff status:', error);
    return {
      color: 'grey',
      reason: 'Error',
      state: 'no_assignments',
      blocked: false,
      confCount: 0,
      perfCount: 0,
      backlogCount: 0,
      selectionPending: false
    };
  }
}

function getTooltipForState(state: WeekState, deadlineAt?: Date): string | undefined {
  switch (state) {
    case 'can_checkin':
      return `Confidence due by Tuesday 12:00 PM`;
    case 'missed_checkin':
      return `Confidence was due by Tuesday 12:00 PM`;
    case 'can_checkout':
      return `Performance due by Friday 5:00 PM`;
    case 'missed_checkout':
      return `Performance was due by Friday 5:00 PM`;
    case 'done':
      return `Week completed successfully`;
    default:
      return undefined;
  }
}

// Legacy function for backward compatibility
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
  currentWeek: any,
  now: Date = new Date()
): StaffWeekStatus {
  // Legacy implementation - simplified
  return {
    color: "grey",
    reason: "Use new computeStaffStatusNew function",
    state: "no_assignments",
    blocked: false,
    confCount: 0,
    perfCount: 0,
    backlogCount: 0,
    selectionPending: false
  };
}

export function getSortRank(status: StaffWeekStatus): number {
  // Priority: Red (0) -> Yellow (1) -> Green (2) -> Neutral/others (3)
  if (status.color === 'red') return 0;
  if (status.color === 'yellow') return 1;
  if (status.color === 'green') return 2;
  return 3;
}