import { getWeekAnchors } from './centralTime';
import { supabase } from '@/integrations/supabase/client';
import { getOpenBacklogCountV2, populateBacklogV2ForMissedWeek } from './backlog';

export type WeekState = 'onboarding' | 'missed_checkin' | 'can_checkin' | 'wait_for_thu' | 'can_checkout' | 'done' | 'missed_checkout' | 'no_assignments';

export interface LocationWeekContext {
  weekInCycle: number;
  cycleNumber: number;
  anchors: ReturnType<typeof getWeekAnchors>;
  timezone: string;
  locationId: string;
  programStartDate: Date;
  cycleLength: number;
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
 * Get the current week context for a location
 */
export async function getLocationWeekContext(locationId: string, now: Date = new Date()): Promise<LocationWeekContext> {
  const { data: location } = await supabase
    .from('locations')
    .select('*')
    .eq('id', locationId)
    .maybeSingle();

  if (!location) {
    throw new Error(`Location not found: ${locationId}`);
  }

  const programStartDate = new Date(location.program_start_date);
  const cycleLength = location.cycle_length_weeks;
  
  // Calculate week index from program start
  const daysDiff = Math.floor((now.getTime() - programStartDate.getTime()) / (1000 * 60 * 60 * 24));
  const weekIndex = Math.floor(daysDiff / 7);
  
  // Calculate cycle number and week in cycle
  const cycleNumber = Math.max(1, Math.floor(weekIndex / cycleLength) + 1);
  const weekInCycle = Math.max(1, (weekIndex % cycleLength) + 1);
  
  // Get time anchors for this location's timezone
  const anchors = getWeekAnchors(now, location.timezone);

  return {
    weekInCycle,
    cycleNumber,
    anchors,
    timezone: location.timezone,
    locationId,
    programStartDate,
    cycleLength
  };
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
 * Assemble weekly assignments for a user based on location context
 */
export async function assembleWeek(params: {
  userId: string;
  roleId: number;
  locationId: string;
  cycleNumber: number;
  weekInCycle: number;
  simOverrides?: any;
}): Promise<any[]> {
  const { userId, roleId, cycleNumber, weekInCycle } = params;

  // 1) Load weekly_focus for this role/week
  const { data: weeklyFocus } = await supabase
    .from('weekly_focus')
    .select('id, display_order, self_select, action_id, competency_id')
    .eq('role_id', roleId)
    .eq('cycle', cycleNumber)
    .eq('week_in_cycle', weekInCycle)
    .order('display_order');

  if (!weeklyFocus || weeklyFocus.length === 0) return [];

  const isFoundation = cycleNumber === 1;

  // 2) Build set of "already assigned" action_ids (site moves first)
  const assignedActionIds = new Set<number>();
  const siteFocus = weeklyFocus.filter(wf => !wf.self_select && wf.action_id);
  if (siteFocus.length) {
    const { data: siteMoves } = await supabase
      .from('pro_moves')
      .select('action_id')
      .in('action_id', siteFocus.map(wf => wf.action_id as number));
    (siteMoves || []).forEach(m => assignedActionIds.add(m.action_id));
  }

  // 3) Load backlog FIFO (only if not foundation)
  let backlog: { id: string; action_id: number }[] = [];
  if (!isFoundation) {
    // We need staff_id for backlog; fetch once
    const { data: staff } = await supabase
      .from('staff')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle();
    if (staff?.id) {
      const { data: open } = await supabase
        .from('user_backlog_v2')
        .select('id, action_id')
        .eq('staff_id', staff.id)
        .is('resolved_on', null)
        .order('assigned_on', { ascending: true });
      backlog = (open || []) as any[];
    }
  }

  // helper: fetch pro move + domain for a given action_id
  async function hydrateAction(actionId: number) {
    const { data: pm } = await supabase
      .from('pro_moves')
      .select('action_id, action_statement, competencies!inner(name, domain_id)')
      .eq('action_id', actionId)
      .maybeSingle();

    let domainName = 'General';
    if (pm?.competencies?.domain_id) {
      const { data: d } = await supabase
        .from('domains')
        .select('domain_name')
        .eq('domain_id', pm.competencies.domain_id)
        .maybeSingle();
      domainName = d?.domain_name || 'General';
    }

    return {
      pro_move_id: pm?.action_id,
      action_statement: pm?.action_statement || 'Pro Move',
      competency_name: pm?.competencies?.name || 'General',
      domain_name: domainName
    };
  }

  const result: any[] = [];

  // 4) Build assignments slot by slot (dedup against assignedActionIds)
  for (const wf of weeklyFocus) {
    if (!wf.self_select) {
      // SITE move
      if (wf.action_id) {
        const info = await hydrateAction(wf.action_id);
        result.push({
          weekly_focus_id: wf.id,
          type: 'site',
          ...info,
          required: true,
          locked: true,
          display_order: wf.display_order
        });
        if (info.pro_move_id) assignedActionIds.add(info.pro_move_id);
      }
      continue;
    }

    // SELF-SELECT slot
    if (isFoundation) {
      // Foundation = force site moves only; treat as "choose later"
      result.push({
        weekly_focus_id: wf.id,
        type: 'selfSelect',
        action_statement: 'Choose a pro-move',
        domain_name: 'General',
        required: false,
        locked: false,
        display_order: wf.display_order
      });
      continue;
    }

    // Try to consume oldest non-duplicate backlog item
    let usedBacklog: { id: string; action_id: number } | undefined;
    for (const item of backlog) {
      if (!assignedActionIds.has(item.action_id)) {
        usedBacklog = item;
        break;
      }
    }

    if (usedBacklog) {
      const info = await hydrateAction(usedBacklog.action_id);
      result.push({
        weekly_focus_id: wf.id,
        type: 'backlog',
        backlog_id: usedBacklog.id,
        ...info,
        required: false,
        locked: true,            // locked: no dropdown
        display_order: wf.display_order
      });
      if (info.pro_move_id) assignedActionIds.add(info.pro_move_id);
    } else {
      // No eligible backlog -> normal self-select
      // Optional: look up competency/domain for nicer badge (same as your current code)
      let domainName = 'General';
      if (wf.competency_id) {
        const { data: comp } = await supabase
          .from('competencies')
          .select('name, domain_id')
          .eq('competency_id', wf.competency_id)
          .maybeSingle();
        if (comp?.domain_id) {
          const { data: d } = await supabase
            .from('domains')
            .select('domain_name')
            .eq('domain_id', comp.domain_id)
            .maybeSingle();
          domainName = d?.domain_name || 'General';
        }
      }
      result.push({
        weekly_focus_id: wf.id,
        type: 'selfSelect',
        action_statement: 'Choose a pro-move',
        domain_name: domainName,
        required: false,
        locked: false,
        display_order: wf.display_order
      });
    }
  }

  return result.sort((a, b) => a.display_order - b.display_order);
}

/**
 * Compute comprehensive week state for staff member using location context
 */
export async function computeWeekState(params: {
  userId: string;
  locationId: string;
  roleId?: number;
  now?: Date;
  simOverrides?: any;
  weekContext?: { cycleNumber: number; weekInCycle: number };
}): Promise<StaffStatus> {
  const { userId, locationId, now = new Date(), simOverrides, weekContext } = params;

  // Get staff information
  const { data: staff } = await supabase
    .from('staff')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

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

  // Use provided week context or calculate from time
  const { cycleNumber, weekInCycle } = weekContext || await getLocationWeekContext(locationId, now);
  const { anchors } = await getLocationWeekContext(locationId, now);

  // Get weekly assignments
  const assignments = await assembleWeek({ 
    userId, 
    roleId, 
    locationId, 
    cycleNumber, 
    weekInCycle, 
    simOverrides 
  });

  if (assignments.length === 0) {
    return {
      state: 'no_assignments',
      nextAction: undefined,
      backlogCount: 0,
      selectionPending: false
    };
  }

  // Get current week's scores within time windows (for completion status)
  const { data: scores } = await supabase
    .from('weekly_scores')
    .select(`
      *,
      weekly_focus!inner(cycle, week_in_cycle)
    `)
    .eq('staff_id', staff.id)
    .eq('weekly_focus.cycle', cycleNumber)
    .eq('weekly_focus.week_in_cycle', weekInCycle);

  // Advisory: completion = "is there a score?", regardless of timestamp
  const requiredCount = assignments.length;
  const confFilled = (scores || []).filter(s => s.confidence_score !== null).length;
  const perfFilled = (scores || []).filter(s => s.performance_score !== null).length;
  
  // Apply simulation overrides for confidence/performance status
  let hasConfidence = confFilled >= requiredCount;
  let hasPerformance = perfFilled >= requiredCount;
  
  if (simOverrides?.enabled) {
    if (simOverrides.forceHasConfidence !== null && simOverrides.forceHasConfidence !== undefined) {
      hasConfidence = simOverrides.forceHasConfidence;
    }
    if (simOverrides.forceHasPerformance !== null && simOverrides.forceHasPerformance !== undefined) {
      hasPerformance = simOverrides.forceHasPerformance;
    }
  }

  // Get backlog count with simulation support
  const backlogResult = await getOpenBacklogCountV2(staff.id, simOverrides);
  const backlogCount = backlogResult.count;

  // Check for selection pending
  const selectionPending = assignments.some(a => a.type === 'selfSelect' && !a.pro_move_id);

  // Get last activity (ALL historical activity, not just current week)
  const { data: allScores } = await supabase
    .from('weekly_scores')
    .select('confidence_date, performance_date, updated_at')
    .eq('staff_id', staff.id)
    .or('confidence_date.not.is.null,performance_date.not.is.null')
    .order('updated_at', { ascending: false })
    .limit(50); // Get recent activity

  let lastActivity: { kind: 'confidence' | 'performance'; at: Date } | undefined;
  
  if (allScores && allScores.length > 0) {
    // Find the most recent activity by comparing all confidence and performance dates
    let latestDate: Date | null = null;
    let latestKind: 'confidence' | 'performance' | null = null;
    
    for (const score of allScores) {
      if (score.confidence_date) {
        const confDate = new Date(score.confidence_date);
        if (!latestDate || confDate > latestDate) {
          latestDate = confDate;
          latestKind = 'confidence';
        }
      }
      if (score.performance_date) {
        const perfDate = new Date(score.performance_date);
        if (!latestDate || perfDate > latestDate) {
          latestDate = perfDate;
          latestKind = 'performance';
        }
      }
    }
    
    if (latestDate && latestKind) {
      lastActivity = { kind: latestKind, at: latestDate };
    }
  }

  // Determine state and next action (advisory gating)
  if (now > anchors.confidence_deadline && !hasConfidence) {
    // Auto-populate backlog v2 when check-in is missed
    try {
      await populateBacklogV2ForMissedWeek(staff.id, assignments, { weekInCycle, cycleNumber });
    } catch (e) {
      console.warn('Backlog v2 population failed (non-fatal):', e);
    }
    
    return {
      state: 'missed_checkin',
      nextAction: 'Overdue',
      deadlineAt: anchors.confidence_deadline,
      backlogCount,
      selectionPending,
      lastActivity
    };
  }

  if (!hasConfidence) {
    return {
      state: 'can_checkin',
      nextAction: 'Confidence',
      deadlineAt: anchors.confidence_deadline,
      backlogCount,
      selectionPending,
      lastActivity
    };
  }

  if (hasConfidence && !hasPerformance) {
    if (now > anchors.performance_deadline) {
      return {
        state: 'missed_checkout',
        nextAction: 'Overdue',
        deadlineAt: anchors.performance_deadline,
        backlogCount,
        selectionPending,
        lastActivity
      };
    } else if (now < anchors.checkout_open) {
      // Confidence submitted but performance not yet available
      return {
        state: 'wait_for_thu',
        nextAction: 'Performance',
        deadlineAt: anchors.checkout_open,
        backlogCount,
        selectionPending,
        lastActivity
      };
    } else {
      return {
        state: 'can_checkout',
        nextAction: 'Performance',
        deadlineAt: anchors.performance_deadline,
        backlogCount,
        selectionPending,
        lastActivity
      };
    }
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