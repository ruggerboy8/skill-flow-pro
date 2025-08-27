import { supabase } from '@/integrations/supabase/client';
import { computeWeekState as computeLocationWeekState, StaffStatus, getLocationWeekContext } from '@/lib/locationState';
import { getCoachDeadlines } from '@/utils/coachDeadlines';
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
    onboarding_weeks: number;
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

    // Get location context for timezone and week calculation
    const locationContext = await getLocationWeekContext(staffData.primary_location_id, currentTime);
    const timezone = locationContext.timezone;
    
    // Calculate deadlines in the staff's timezone
    const deadlines = getCoachDeadlines(currentTime, timezone);
    const localNow = toZonedTime(currentTime, timezone);
    
    // Check if staff is still onboarding
    if (staffData.hire_date) {
      const hireDate = new Date(staffData.hire_date);
      const participationStart = new Date(hireDate.getTime() + (staffData.onboarding_weeks * 7 * 24 * 60 * 60 * 1000));
      if (currentTime < participationStart) {
        const weeksLeft = Math.ceil((participationStart.getTime() - currentTime.getTime()) / (7 * 24 * 60 * 60 * 1000));
        return {
          color: 'grey',
          reason: `Onboarding (${weeksLeft} wks left)`,
          state: 'onboarding',
          blocked: false,
          confCount: 0,
          perfCount: 0,
          backlogCount: 0,
          selectionPending: false,
          onboardingWeeksLeft: weeksLeft,
          label: 'No actions',
          severity: 'grey',
          detail: 'Not participating yet',
          lastActivityText: 'Onboarding in progress'
        };
      }
    }

    // Get current week's weekly_focus items for this role
    const { data: weeklyFocus } = await supabase
      .from('weekly_focus')
      .select('id')
      .eq('role_id', staffData.role_id)
      .eq('cycle', locationContext.cycleNumber)
      .eq('week_in_cycle', locationContext.weekInCycle);

    const required = weeklyFocus?.length || 0;
    
    if (required === 0) {
      return {
        color: 'green',
        reason: 'No assignments',
        state: 'no_assignments',
        blocked: false,
        confCount: 0,
        perfCount: 0,
        backlogCount: 0,
        selectionPending: false,
        label: 'No actions',
        severity: 'green',
        detail: 'No pro-moves this week',
        lastActivityText: 'No check-in yet'
      };
    }

    // Get scores for current week
    const { data: scores } = await supabase
      .from('weekly_scores')
      .select('confidence_score, performance_score, confidence_date, performance_date, confidence_late, performance_late')
      .eq('staff_id', staffData.id)
      .in('weekly_focus_id', weeklyFocus.map(wf => wf.id));

    const confComplete = (scores || []).filter(s => s.confidence_score !== null).length >= required;
    const perfComplete = (scores || []).filter(s => s.performance_score !== null).length >= required;

    // Find most recent activity for lastActivityText
    let lastActivityText = 'No check-in yet';
    if (scores && scores.length > 0) {
      let latestActivity: { kind: 'confidence' | 'performance'; at: Date; late: boolean } | null = null;
      
      for (const score of scores) {
        if (score.confidence_date) {
          const confDate = new Date(score.confidence_date);
          if (!latestActivity || confDate > latestActivity.at) {
            latestActivity = { kind: 'confidence', at: confDate, late: score.confidence_late || false };
          }
        }
        if (score.performance_date) {
          const perfDate = new Date(score.performance_date);
          if (!latestActivity || perfDate > latestActivity.at) {
            latestActivity = { kind: 'performance', at: perfDate, late: score.performance_late || false };
          }
        }
      }
      
      if (latestActivity) {
        const formattedLocal = format(toZonedTime(latestActivity.at, timezone), 'EEE h:mma');
        const lateText = latestActivity.late ? ' (late)' : '';
        const kindText = latestActivity.kind === 'confidence' ? 'Confidence' : 'Performance';
        lastActivityText = `${kindText} submitted${lateText} ${formattedLocal}`;
      }
    }

    // Decision logic
    let label: string;
    let severity: CoachSeverity;
    let detail: string;
    let color: StatusColor;
    let reason: string;
    let state: WeekState;

    if (localNow <= deadlines.confDue) {
      if (confComplete) {
        label = 'All set';
        severity = 'green';
        detail = 'Confidence complete';
        color = 'green';
        reason = 'Complete';
        state = 'wait_for_thu';
      } else {
        label = 'Due today';
        severity = 'yellow';
        detail = 'Confidence due today';
        color = 'yellow';
        reason = 'Can check in';
        state = 'can_checkin';
      }
    } else if (localNow <= deadlines.perfDue) {
      if (!confComplete) {
        label = 'Action needed';
        severity = 'red';
        detail = 'Confidence overdue';
        color = 'red';
        reason = 'Missed check-in';
        state = 'missed_checkin';
      } else if (perfComplete) {
        label = 'All set';
        severity = 'green';
        detail = 'Performance complete';
        color = 'green';
        reason = 'Complete';
        state = 'done';
      } else {
        label = 'Due Thu';
        severity = 'yellow';
        detail = 'Performance due Thu';
        color = 'yellow';
        reason = 'Can check out';
        state = 'can_checkout';
      }
    } else {
      if (perfComplete) {
        label = 'All set';
        severity = 'green';
        detail = 'Week complete';
        color = 'green';
        reason = 'Complete';
        state = 'done';
      } else {
        label = 'Action needed';
        severity = 'red';
        detail = 'Performance overdue';
        color = 'red';
        reason = 'Missed check-out';
        state = 'missed_checkout';
      }
    }

    return {
      color,
      reason,
      state,
      blocked: state === 'missed_checkout',
      confCount: 0,
      perfCount: 0,
      backlogCount: 0,
      selectionPending: false,
      label,
      severity,
      detail,
      lastActivityText,
      tooltip: detail
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
      return `Confidence due by Tuesday 12:00 PM`;
    case 'missed_checkin':
      return `Confidence was due by Tuesday 12:00 PM`;
    case 'wait_for_thu':
      return `Confidence submitted, performance opens Thursday`;
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