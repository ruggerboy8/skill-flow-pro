import { getWeekAnchors, CT_TZ } from './centralTime';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { getOpenBacklogCount } from './backlog';

export type WeekState = 'onboarding' | 'missed_checkin' | 'can_checkin' | 'can_checkout' | 'wait_for_thu' | 'done' | 'missed_checkout' | 'no_assignments';

export interface SiteWeekContext {
  weekInCycle: number;
  cycle: number;
  anchors: ReturnType<typeof getWeekAnchors>;
  timezone: string;
  siteId: string;
}

export interface StaffStatus {
  state: WeekState;
  nextAction?: string;
  deadlineAt?: Date;
  backlogCount: number;
  selectionPending: boolean;
  lastActivity?: { kind: 'confidence' | 'performance'; at: Date };
  onboardingWeeksLeft?: number;
}

/**
 * Get the current week context for a site
 */
export async function getSiteWeekContext(siteId: string = 'main', now: Date = new Date()): Promise<SiteWeekContext> {
  const { data: siteState } = await supabase
    .from('site_cycle_state')
    .select('*')
    .eq('site_id', siteId)
    .maybeSingle();

  if (!siteState) {
    throw new Error(`Site state not found for site: ${siteId}`);
  }

  const cycleStartDate = new Date(siteState.cycle_start_date);
  const weekInCycle = getWeekInCycle(cycleStartDate, siteState.cycle_length_weeks, now);
  const anchors = getWeekAnchors(now, siteState.timezone);

  return {
    weekInCycle,
    cycle: 1, // For now, enforce Cycle 1 everywhere
    anchors,
    timezone: siteState.timezone,
    siteId
  };
}

/**
 * Calculate week in cycle from site cycle state
 */
export function getWeekInCycle(cycleStartDate: Date, cycleLengthWeeks: number, now: Date = new Date()): number {
  const daysDiff = Math.floor((now.getTime() - cycleStartDate.getTime()) / (1000 * 60 * 60 * 24));
  return ((Math.floor(daysDiff / 7) % cycleLengthWeeks) + 1);
}

/**
 * Check if staff member is eligible for pro moves (past onboarding)
 */
export function isEligibleForProMoves(staff: { hire_date?: string | null; onboarding_weeks: number }, now: Date = new Date()): boolean {
  if (!staff.hire_date) return true; // Assume eligible if no hire date

  const hireDate = new Date(staff.hire_date);
  const participationStart = new Date(hireDate.getTime() + (staff.onboarding_weeks * 7 * 24 * 60 * 60 * 1000));
  return now >= participationStart;
}

/**
 * Get onboarding weeks remaining
 */
export function getOnboardingWeeksLeft(staff: { hire_date?: string | null; onboarding_weeks: number }, now: Date = new Date()): number {
  if (!staff.hire_date) return 0;

  const hireDate = new Date(staff.hire_date);
  const participationStart = new Date(hireDate.getTime() + (staff.onboarding_weeks * 7 * 24 * 60 * 60 * 1000));
  
  if (now >= participationStart) return 0;
  
  const weeksLeft = Math.ceil((participationStart.getTime() - now.getTime()) / (7 * 24 * 60 * 60 * 1000));
  return Math.max(0, weeksLeft);
}

/**
 * Assemble weekly assignments for a user based on site week context
 */
export async function assembleWeek(params: {
  userId: string;
  roleId: number;
  siteId?: string;
  weekInCycle?: number;
  simOverrides?: any;
}): Promise<any[]> {
  const { userId, roleId, siteId = 'main', simOverrides } = params;
  
  // Get site week context if not provided
  let weekInCycle = params.weekInCycle;
  if (!weekInCycle) {
    const context = await getSiteWeekContext(siteId);
    weekInCycle = context.weekInCycle;
  }

  // Get current cycle (for now, assume cycle 1)
  const cycle = 1;

  // Fetch weekly focus for this role/cycle/week
  const { data: weeklyFocus } = await supabase
    .from('weekly_focus')
    .select('*')
    .eq('role_id', roleId)
    .eq('cycle', cycle)
    .eq('week_in_cycle', weekInCycle)
    .order('display_order');

  if (!weeklyFocus || weeklyFocus.length === 0) {
    return [];
  }

  // Get user's self-selections
  const { data: selections } = await supabase
    .from('weekly_self_select')
    .select('*')
    .eq('user_id', userId)
    .in('weekly_focus_id', weeklyFocus.map(w => w.id));

  // Get user's backlog items
  const { data: backlog } = await supabase
    .from('user_backlog')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'open')
    .order('created_at');

  const assignments: any[] = [];
  let backlogIndex = 0;

  // Process each weekly focus slot
  for (const focus of weeklyFocus) {
    if (focus.self_select) {
      // Check if user has made a selection for this slot
      const selection = selections?.find(s => s.weekly_focus_id === focus.id);
      
      if (selection) {
        // Get selected pro move details
        const { data: selectedProMove } = await supabase
          .from('pro_moves')
          .select(`
            *,
            competencies(name, domain_id)
          `)
          .eq('action_id', selection.selected_pro_move_id)
          .maybeSingle();

        // Get domain for the competency
        const { data: domain } = await supabase
          .from('domains')
          .select('domain_name')
          .eq('domain_id', selectedProMove?.competencies?.domain_id)
          .maybeSingle();

        if (selectedProMove) {
          assignments.push({
            weekly_focus_id: focus.id,
            type: 'selfSelect',
            pro_move_id: selectedProMove.action_id,
            action_statement: selectedProMove.action_statement,
            domain_name: domain?.domain_name || 'General',
            required: false,
            locked: false,
            display_order: focus.display_order
          });
        }
      } else {
        // Auto-fill from backlog if available
        if (backlog && backlogIndex < backlog.length) {
          const backlogItem = backlog[backlogIndex];
          
          // Get pro move details for backlog item
          const { data: backlogProMove } = await supabase
            .from('pro_moves')
            .select(`
              *,
              competencies(name, domain_id)
            `)
            .eq('action_id', backlogItem.pro_move_id)
            .maybeSingle();

          // Get domain for the competency
          const { data: domain } = await supabase
            .from('domains')
            .select('domain_name')
            .eq('domain_id', backlogProMove?.competencies?.domain_id)
            .maybeSingle();

          assignments.push({
            weekly_focus_id: focus.id,
            type: 'backlog',
            pro_move_id: backlogProMove?.action_id,
            action_statement: backlogProMove?.action_statement || 'Backlog item',
            domain_name: domain?.domain_name || 'General',
            required: false,
            locked: false,
            backlog_id: backlogItem.id,
            display_order: focus.display_order
          });
          backlogIndex++;
        } else {
          // Empty self-select slot
          // Get domain for the competency if it exists
          let domainName = 'General';
          if (focus.competency_id) {
            const { data: competency } = await supabase
              .from('competencies')
              .select('domain_id')
              .eq('competency_id', focus.competency_id)
              .maybeSingle();

            if (competency?.domain_id) {
              const { data: domain } = await supabase
                .from('domains')
                .select('domain_name')
                .eq('domain_id', competency.domain_id)
                .maybeSingle();
              
              domainName = domain?.domain_name || 'General';
            }
          }

          assignments.push({
            weekly_focus_id: focus.id,
            type: 'selfSelect',
            action_statement: 'Choose a pro-move',
            domain_name: domainName,
            required: false,
            locked: false,
            display_order: focus.display_order
          });
        }
      }
    } else {
      // Site move - get pro move details
      if (focus.action_id) {
        const { data: siteProMove } = await supabase
          .from('pro_moves')
          .select(`
            *,
            competencies(name, domain_id)
          `)
          .eq('action_id', focus.action_id)
          .maybeSingle();

        // Get domain for the competency
        const { data: domain } = await supabase
          .from('domains')
          .select('domain_name')
          .eq('domain_id', siteProMove?.competencies?.domain_id)
          .maybeSingle();

        assignments.push({
          weekly_focus_id: focus.id,
          type: 'site',
          pro_move_id: siteProMove?.action_id,
          action_statement: siteProMove?.action_statement || 'Site move',
          domain_name: domain?.domain_name || 'General',
          required: true,
          locked: true,
          display_order: focus.display_order
        });
      }
    }
  }

  return assignments.sort((a, b) => a.display_order - b.display_order);
}

/**
 * Compute comprehensive week state for staff member
 */
export async function computeWeekState(params: {
  userId: string;
  siteId?: string;
  roleId?: number;
  now?: Date;
  simOverrides?: any;
}): Promise<StaffStatus> {
  const { userId, siteId = 'main', now = new Date(), simOverrides } = params;

  // Get staff information
  const { data: staff } = await supabase
    .from('staff')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (!staff) {
    throw new Error('Staff member not found');
  }

  const roleId = params.roleId || staff.role_id;

  // Check eligibility (onboarding status)
  if (!isEligibleForProMoves(staff, now)) {
    const weeksLeft = getOnboardingWeeksLeft(staff, now);
    return {
      state: 'onboarding',
      nextAction: `Complete onboarding`,
      backlogCount: 0,
      selectionPending: false,
      onboardingWeeksLeft: weeksLeft
    };
  }

  // Get site week context
  const context = await getSiteWeekContext(siteId, now);
  const { weekInCycle, anchors } = context;

  // Get weekly assignments
  const assignments = await assembleWeek({ userId, roleId, siteId, weekInCycle, simOverrides });

  if (assignments.length === 0) {
    return {
      state: 'no_assignments',
      nextAction: undefined,
      backlogCount: 0,
      selectionPending: false
    };
  }

  // Get current week's scores within time windows
  const currentCycle = 1; // For now, assume cycle 1
  const { data: scores } = await supabase
    .from('weekly_scores')
    .select(`
      *,
      weekly_focus!inner(cycle, week_in_cycle)
    `)
    .eq('staff_id', staff.id)
    .eq('weekly_focus.cycle', currentCycle)
    .eq('weekly_focus.week_in_cycle', weekInCycle);

  // Count valid scores within time windows
  const confidenceScores = scores?.filter(s => 
    s.confidence_score !== null && 
    s.confidence_date && 
    new Date(s.confidence_date) >= anchors.checkin_open &&
    new Date(s.confidence_date) <= anchors.confidence_deadline
  ) || [];

  const performanceScores = scores?.filter(s => 
    s.performance_score !== null && 
    s.performance_date && 
    new Date(s.performance_date) >= anchors.checkout_open &&
    new Date(s.performance_date) <= anchors.performance_deadline
  ) || [];

  // Dynamic completion check based on actual assignment count
  const requiredCount = assignments.length;
  const hasConfidence = confidenceScores.length >= requiredCount;
  const hasPerformance = performanceScores.length >= requiredCount;

  // Get backlog count with simulation support
  const backlogResult = await getOpenBacklogCount(userId, simOverrides);
  const backlogCount = backlogResult.count;

  // Check for selection pending
  const selectionPending = assignments.some(a => a.type === 'selfSelect' && !a.action_statement);

  // Get last activity
  let lastActivity: { kind: 'confidence' | 'performance'; at: Date } | undefined;
  const allScores = [...confidenceScores, ...performanceScores].sort(
    (a, b) => new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime()
  );

  if (allScores.length > 0) {
    const latest = allScores[0];
    if (latest.confidence_date && (!latest.performance_date || new Date(latest.confidence_date) > new Date(latest.performance_date))) {
      lastActivity = { kind: 'confidence', at: new Date(latest.confidence_date) };
    } else if (latest.performance_date) {
      lastActivity = { kind: 'performance', at: new Date(latest.performance_date) };
    }
  }

  // Determine state and next action
  if (now > anchors.confidence_deadline && !hasConfidence) {
    return {
      state: 'missed_checkin',
      nextAction: 'Overdue',
      deadlineAt: anchors.confidence_deadline,
      backlogCount,
      selectionPending,
      lastActivity
    };
  }

  if (now <= anchors.confidence_deadline && !hasConfidence) {
    return {
      state: 'can_checkin',
      nextAction: 'Confidence',
      deadlineAt: anchors.confidence_deadline,
      backlogCount,
      selectionPending,
      lastActivity
    };
  }

  if (hasConfidence && now < anchors.checkout_open) {
    return {
      state: 'wait_for_thu',
      nextAction: 'Performance opens Thursday',
      deadlineAt: anchors.checkout_open,
      backlogCount,
      selectionPending,
      lastActivity
    };
  }

  if (hasConfidence && !hasPerformance && now >= anchors.checkout_open && now <= anchors.performance_deadline) {
    return {
      state: 'can_checkout',
      nextAction: 'Performance',
      deadlineAt: anchors.performance_deadline,
      backlogCount,
      selectionPending,
      lastActivity
    };
  }

  if (hasConfidence && !hasPerformance && now > anchors.performance_deadline) {
    return {
      state: 'missed_checkout',
      nextAction: 'Overdue',
      deadlineAt: anchors.performance_deadline,
      backlogCount,
      selectionPending,
      lastActivity
    };
  }

  if (hasConfidence && hasPerformance) {
    return {
      state: 'done',
      nextAction: undefined,
      backlogCount,
      selectionPending,
      lastActivity
    };
  }

  // Fallback
  return {
    state: 'no_assignments',
    nextAction: undefined,
    backlogCount,
    selectionPending,
    lastActivity
  };
}