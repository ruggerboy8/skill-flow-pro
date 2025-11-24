import { supabase } from '@/integrations/supabase/client';
import { computeWeekState, getLocationWeekContext } from '@/lib/locationState';
import { format } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';

export type StatusColor = "grey" | "yellow" | "green" | "red";
export type CoachSeverity = 'green' | 'yellow' | 'red' | 'grey';
export type WeekState = 'onboarding' | 'no_assignments' | 'missed_checkin' | 'can_checkin' | 'wait_for_thu' | 'can_checkout' | 'missed_checkout' | 'done';

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
  // New coach-focused fields
  label?: string;
  severity?: CoachSeverity;
  detail?: string;
  lastActivityText?: string;
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
    primary_location_id?: string | null;
  },
  now?: Date
): Promise<StaffWeekStatus> {
  try {
    const currentTime = now || new Date();
    
    if (!staffData.primary_location_id) {
      return {
        color: 'grey' as StatusColor,
        reason: 'No location assigned',
        state: 'no_assignments',
        blocked: false,
        confCount: 0,
        perfCount: 0,
        backlogCount: 0,
        selectionPending: false,
        label: 'No actions',
        severity: 'grey',
        detail: 'No location assigned',
        lastActivityText: 'No check-in yet'
      };
    }

    // Use the corrected computeWeekState function
    const weekState = await computeWeekState({
      userId,
      locationId: staffData.primary_location_id,
      roleId: staffData.role_id,
      now: currentTime
    });

    // Map week state to coach status format
    let label: string;
    let severity: CoachSeverity;
    let detail: string;
    let color: StatusColor;
    let reason: string;

    switch (weekState.state) {
      case 'onboarding':
        label = 'No actions';
        severity = 'grey';
        detail = 'Not participating yet';
        color = 'grey';
        reason = `Onboarding (${weekState.onboardingWeeksLeft} wks left)`;
        break;
      
      case 'no_assignments':
        label = 'No actions';
        severity = 'green';
        detail = 'No pro-moves this week';
        color = 'green';
        reason = 'No assignments';
        break;
        
      case 'can_checkin':
        label = 'Due today';
        severity = 'yellow';
        detail = 'Confidence due today';
        color = 'yellow';
        reason = 'Can check in';
        break;
        
      case 'missed_checkin':
        label = 'Action needed';
        severity = 'red';
        detail = 'Confidence overdue';
        color = 'red';
        reason = 'Missed check-in';
        break;
        
      case 'wait_for_thu':
        label = 'All set';
        severity = 'green';
        detail = 'Confidence complete';
        color = 'green';
        reason = 'Complete';
        break;
        
      case 'can_checkout':
        label = 'Due Thu';
        severity = 'yellow';
        detail = 'Performance due Thu';
        color = 'yellow';
        reason = 'Can check out';
        break;
        
      case 'missed_checkout':
        label = 'Action needed';
        severity = 'red';
        detail = 'Performance overdue';
        color = 'red';
        reason = 'Missed check-out';
        break;
        
      case 'done':
        label = 'All set';
        severity = 'green';
        detail = 'Week complete';
        color = 'green';
        reason = 'Complete';
        break;
        
      default:
        label = 'No actions';
        severity = 'grey';
        detail = 'Unknown state';
        color = 'grey';
        reason = 'Unknown';
    }

    // Build lastActivityText from weekState.lastActivity
    let lastActivityText = 'No check-in yet';
    if (weekState.lastActivity) {
      const { kind, at } = weekState.lastActivity;
      // Get timezone for formatting
      const locationContext = await getLocationWeekContext(staffData.primary_location_id, currentTime);
      const formattedLocal = format(toZonedTime(at, locationContext.timezone), 'EEE h:mma');
      const kindText = kind === 'confidence' ? 'Confidence' : 'Performance';
      lastActivityText = `${kindText} submitted ${formattedLocal}`;
    }

    return {
      color,
      reason,
      state: weekState.state,
      blocked: weekState.state === 'missed_checkout',
      confCount: 0,
      perfCount: 0,
      backlogCount: weekState.backlogCount,
      selectionPending: weekState.selectionPending,
      label,
      severity,
      detail,
      lastActivityText,
      tooltip: detail,
      onboardingWeeksLeft: weekState.onboardingWeeksLeft,
      lastActivity: weekState.lastActivity,
      nextAction: weekState.nextAction,
      deadlineAt: weekState.deadlineAt
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
      selectionPending: false,
      label: 'Error',
      severity: 'grey',
      detail: 'Unable to compute status',
      lastActivityText: 'Error loading data'
    };
  }
}

function getTooltipForState(state: WeekState, deadlineAt?: Date): string | undefined {
  switch (state) {
    case 'can_checkin':
      return `Confidence due by Tuesday 3:00 PM`;
    case 'missed_checkin':
      return `Confidence was due by Tuesday 3:00 PM`;
    case 'wait_for_thu':
      return `Confidence submitted, performance opens Thursday`;
    case 'can_checkout':
      return `Performance due by Friday 3:00 PM`;
    case 'missed_checkout':
      return `Performance was due by Friday 3:00 PM`;
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
  if (status.severity) {
    switch (status.severity) {
      case 'red': return 0;
      case 'yellow': return 1;
      case 'green': return 2;
      default: return 3;
    }
  }
  // Fallback to old color system
  if (status.color === 'red') return 0;
  if (status.color === 'yellow') return 1;
  if (status.color === 'green') return 2;
  return 3;
}