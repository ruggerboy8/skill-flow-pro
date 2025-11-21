import { getWeekAnchors } from '@/v2/time';
import { supabase } from '@/integrations/supabase/client';
import { getOpenBacklogCountV2, populateBacklogV2ForMissedWeek } from './backlog';
import { format } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';
import { useWeeklyAssignmentsV2Enabled } from './featureFlags';

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
  source?: 'weekly_plan' | 'weekly_focus';
  weekLabel?: string;
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
  
  // Get time anchors for this location's timezone to find Monday of current week
  const anchors = getWeekAnchors(now, location.timezone);
  const currentMonday = new Date(anchors.mondayZ);
  
  // Get the Monday of the week containing program start date
  const programStartAnchors = getWeekAnchors(programStartDate, location.timezone);
  const programStartMonday = new Date(programStartAnchors.mondayZ);
  
  // Calculate week index from program start Monday
  const daysDiff = Math.floor((currentMonday.getTime() - programStartMonday.getTime()) / (1000 * 60 * 60 * 24));
  let weekIndex = Math.floor(daysDiff / 7);
  
  // Check if we're before the performance deadline (Friday 5pm)
  // If so, we're still working on the previous week's assignments
  const beforePerformanceDeadline = now < anchors.checkout_due;
  
  if (beforePerformanceDeadline && weekIndex > 0) {
    // Subtract 1 to get the active assignment week (previous week)
    weekIndex = weekIndex - 1;
  }
  
  // Calculate cycle number and week in cycle
  const cycleNumber = Math.max(1, Math.floor(weekIndex / cycleLength) + 1);
  const weekInCycle = Math.max(1, (weekIndex % cycleLength) + 1);

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
 * Check if staff member is eligible for pro moves based on hire date
 * Eligibility starts on the Monday on or after hire date
 */
export function isEligibleForProMoves(staff: { hire_date?: string | null }, now: Date = new Date()): boolean {
  if (!staff.hire_date) return true; // Assume eligible if no hire date

  const hireDate = new Date(staff.hire_date);
  // Find the Monday on or after hire date
  const dayOfWeek = hireDate.getDay();
  const daysUntilMonday = dayOfWeek === 1 ? 0 : (8 - dayOfWeek) % 7;
  const participationStart = new Date(hireDate.getTime() + (daysUntilMonday * 24 * 60 * 60 * 1000));
  return now >= participationStart;
}

/**
 * Get number of weeks until eligibility for a staff member
 */
export function getOnboardingWeeksLeft(staff: { hire_date?: string | null }, now: Date = new Date()): number {
  if (!staff.hire_date) return 0;

  const hireDate = new Date(staff.hire_date);
  const dayOfWeek = hireDate.getDay();
  const daysUntilMonday = dayOfWeek === 1 ? 0 : (8 - dayOfWeek) % 7;
  const participationStart = new Date(hireDate.getTime() + (daysUntilMonday * 24 * 60 * 60 * 1000));
  
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
  const { userId, roleId, locationId, cycleNumber, weekInCycle } = params;

  // ----- GRADUATION CHECK: Cycle 4+ uses global plan -----
  if (cycleNumber >= 4) {
    const { data: location } = await supabase
      .from('locations')
      .select('timezone, organization_id')
      .eq('id', locationId)
      .maybeSingle();

    if (!location) return [];

    const now = params.simOverrides?.enabled && params.simOverrides?.nowISO 
      ? new Date(params.simOverrides.nowISO) 
      : new Date();
    
    const anchors = getWeekAnchors(now, location.timezone);
    const mondayStr = formatInTimeZone(anchors.mondayZ, location.timezone, 'yyyy-MM-dd');

    // Check feature flag to determine data source
    if (useWeeklyAssignmentsV2Enabled) {
      console.info('🚀 [assembleWeek] Using weekly_assignments V2 (feature flag ON)');
      
      // Query weekly_assignments (global only: org_id null)
      const { data: assignData, error: assignErr } = await supabase
        .from('weekly_assignments')
        .select('id, display_order, action_id, self_select')
        .eq('source', 'global')
        .eq('role_id', roleId)
        .eq('week_start_date', mondayStr)
        .eq('status', 'locked')
        .is('org_id', null)
        .order('display_order');

      if (!assignErr && assignData && assignData.length > 0) {
        console.info('[assembleWeek] ✅ Using weekly_assignments for Cycle 4+ role=%d week=%s (found %d locked rows)', 
          roleId, mondayStr, assignData.length);
        
        // Fetch with joins
        const { data: enrichedAssign, error: enrichErr } = await supabase
          .from('weekly_assignments')
          .select(`
            id,
            action_id,
            display_order,
            self_select,
            pro_moves!weekly_assignments_action_id_fkey (
              action_statement,
              intervention_text,
              competencies!fk_pro_moves_competency_id (
                name,
                domains!competencies_domain_id_fkey (
                  domain_name
                )
              )
            )
          `)
          .eq('source', 'global')
          .eq('role_id', roleId)
          .eq('week_start_date', mondayStr)
          .eq('status', 'locked')
          .is('org_id', null)
          .order('display_order');

        if (enrichErr || !enrichedAssign) {
          console.error('[assembleWeek] Failed to fetch enriched assignments:', enrichErr);
          return [];
        }

        const result: any[] = enrichedAssign.map((assign: any) => ({
          weekly_focus_id: `assign:${assign.id}`,
          type: 'site',
          pro_move_id: assign.action_id,
          action_statement: assign.pro_moves?.action_statement || 'Pro Move',
          intervention_text: assign.pro_moves?.intervention_text || null,
          competency_name: assign.pro_moves?.competencies?.name || 'General',
          domain_name: assign.pro_moves?.competencies?.domains?.domain_name || 'General',
          required: true,
          locked: !!assign.action_id,
          display_order: assign.display_order,
          source: 'assignments',
          weekLabel: `Week of ${mondayStr}`
        }));
        
        console.info('[assembleWeek] Returning %d weekly_assignments', result.length);
        return result;
      } else {
        console.warn('[assembleWeek] ❌ No weekly_assignments for Cycle 4+ (week %s, role %d) - found %d rows', 
          mondayStr, roleId, assignData?.length || 0);
        return [];
      }
    }

    // Legacy path: weekly_plan
    console.info('📚 [assembleWeek] Using legacy weekly_plan (V2 flag OFF)');
    const { data: planData, error: planErr } = await supabase
      .from('weekly_plan')
      .select('id, display_order, action_id, self_select')
      .is('org_id', null)
      .eq('role_id', roleId)
      .eq('week_start_date', mondayStr)
      .eq('status', 'locked')
      .order('display_order');


    // Check if we have locked rows (at least 1)
    if (!planErr && planData && planData.length > 0) {
      console.info('[assembleWeek] ✅ Using global weekly_plan for Cycle 4+ role=%d week=%s (found %d locked rows)', 
        roleId, mondayStr, planData.length);
      
      // Fetch with joins to get all metadata in one query
      const { data: enrichedPlan, error: enrichErr } = await supabase
        .from('weekly_plan')
        .select(`
          id,
          action_id,
          display_order,
          self_select,
          pro_moves!weekly_plan_action_id_fkey (
            action_statement,
            intervention_text,
            competencies!fk_pro_moves_competency_id (
              name,
              domains!competencies_domain_id_fkey (
                domain_name
              )
            )
          )
        `)
        .is('org_id', null)
        .eq('role_id', roleId)
        .eq('week_start_date', mondayStr)
        .eq('status', 'locked')
        .order('display_order');

      if (enrichErr || !enrichedPlan) {
        console.error('[assembleWeek] Failed to fetch enriched plan data:', enrichErr);
        return [];
      }

      const result: any[] = enrichedPlan.map((plan: any) => ({
        weekly_focus_id: `plan:${plan.id}`,
        type: 'site',
        pro_move_id: plan.action_id,
        action_statement: plan.pro_moves?.action_statement || 'Pro Move',
        intervention_text: plan.pro_moves?.intervention_text || null,
        competency_name: plan.pro_moves?.competencies?.name || 'General',
        domain_name: plan.pro_moves?.competencies?.domains?.domain_name || 'General',
        required: true,
        locked: !!plan.action_id,
        display_order: plan.display_order,
        source: 'plan',
        weekLabel: `Week of ${mondayStr}`
      }));
      
      console.info('[assembleWeek] Returning %d weekly_plan assignments', result.length);
      return result;
    } else {
      console.warn('[assembleWeek] ❌ No global plan for Cycle 4+ (week %s, role %d) - found %d rows with error: %s', 
        mondayStr, roleId, planData?.length || 0, planErr?.message || 'none');
      
      // For Cycle 4+, if no plan data exists, return empty instead of falling back
      if (cycleNumber >= 4) {
        console.warn('[assembleWeek] No global plan for Cycle 4+ - returning empty assignments');
        return [];
      }
    }
  }

  // ----- CYCLES 1-3: Use static weekly_focus -----
  console.info('[assembleWeek] Using weekly_focus for Cycles 1-3: cycle=%d week=%d role=%d', 
    cycleNumber, weekInCycle, roleId);

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
      .select('action_id, action_statement, intervention_text, competencies!inner(name, domain_id)')
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
      intervention_text: pm?.intervention_text || null,
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

  // 1) Location context (no ISO)
  const ctx = await getLocationWeekContext(locationId, now);
  const { cycleNumber, weekInCycle } = weekContext || ctx;

  // 2) Anchors for this location's current week
  const anchors = getWeekAnchors(now, ctx.timezone);
  const { checkin_open, checkin_due, checkout_open, checkout_due } = anchors;

  // Get staff information with org and timezone
  const { data: staff } = await supabase
    .from('staff')
    .select('*, locations!inner(organization_id, timezone)')
    .eq('user_id', userId)
    .maybeSingle();

  if (!staff) {
    throw new Error('Staff member not found');
  }

  const roleId = params.roleId || staff.role_id;
  const orgId = (staff.locations as any)?.organization_id;
  const orgTz = (staff.locations as any)?.timezone || 'America/Chicago';

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

  // Calculate Monday anchor in org timezone
  const mondayStr = formatInTimeZone(anchors.mondayZ, orgTz, 'yyyy-MM-dd');

  // ----- P0 FIX: Use assembleWeek as single source of truth for IDs -----
  const assignments = await assembleWeek({
    userId,
    roleId,
    locationId,
    cycleNumber,
    weekInCycle,
    simOverrides,
  });

  if (!assignments || assignments.length === 0) {
    console.warn('[weekState] ❌ No assignments found for cycle=%d week=%d role=%d', 
      cycleNumber, weekInCycle, roleId);
    return {
      state: 'no_assignments',
      backlogCount: 0,
      selectionPending: false,
    };
  }

  const allIds = assignments.map(a => a.weekly_focus_id);
  const requiredIds = assignments.filter(a => a.required).map(a => a.weekly_focus_id);
  const required = requiredIds.length;

  // Derive source + label for display
  const dataSource = allIds.some(id => {
    const idStr = String(id);
    return idStr.startsWith('plan:') || idStr.startsWith('assign:');
  }) ? 'weekly_plan' : 'weekly_focus';
  const weekLabel = assignments[0]?.weekLabel || `Cycle ${cycleNumber}, Week ${weekInCycle}`;

  // current staff id from userId
  const staffId = staff.id;

  // Query scores against exactly these IDs (from assembleWeek)
  const { data: scores, error: scoresError } = await supabase
    .from('weekly_scores')
    .select('confidence_score, confidence_date, performance_score, performance_date, weekly_focus_id')
    .eq('staff_id', staffId)
    .in('weekly_focus_id', allIds);

  // P2 FIX: Check completion per required slot, not by totals
  const byId = new Map(allIds.map(id => [id, { conf: false, perf: false }]));
  for (const s of (scores ?? [])) {
    const row = byId.get(s.weekly_focus_id);
    if (!row) continue;
    if (s.confidence_score != null) row.conf = true;
    if (s.performance_score != null) row.perf = true;
  }

  let confComplete = requiredIds.every(id => byId.get(id)?.conf);
  let perfComplete = requiredIds.every(id => byId.get(id)?.perf);

  console.log('[weekState] Confidence complete:', confComplete, '(required slots:', required, ')');
  console.log('[weekState] Performance complete:', perfComplete, '(required slots:', required, ')');

  // Apply simulation overrides for confidence/performance status
  if (simOverrides?.enabled) {
    if (simOverrides.forceHasConfidence !== null && simOverrides.forceHasConfidence !== undefined) {
      confComplete = simOverrides.forceHasConfidence;
    }
    if (simOverrides.forceHasPerformance !== null && simOverrides.forceHasPerformance !== undefined) {
      perfComplete = simOverrides.forceHasPerformance;
    }
  }

  // lastActivity
  const latestConf = (scores ?? [])
    .filter(s => s.confidence_date)
    .map(s => ({ kind: 'confidence' as const, at: new Date(s.confidence_date as string) }))
    .sort((a,b) => b.at.getTime() - a.at.getTime())[0];

  const latestPerf = (scores ?? [])
    .filter(s => s.performance_date)
    .map(s => ({ kind: 'performance' as const, at: new Date(s.performance_date as string) }))
    .sort((a,b) => b.at.getTime() - a.at.getTime())[0];

  const lastActivity =
    latestConf && latestPerf
      ? (latestConf.at > latestPerf.at ? latestConf : latestPerf)
      : (latestConf ?? latestPerf);

  // Get backlog count with simulation support
  const backlogResult = await getOpenBacklogCountV2(staffId, simOverrides);
  const backlogCount = backlogResult.count;

  // Check for selection pending
  const selectionPending = false; // Simplified for now

  // State machine (no ISO, only tz-anchors):

  // Fully complete
  if (confComplete && perfComplete) {
    return {
      state: 'done',
      backlogCount,
      selectionPending,
      lastActivity,
    };
  }

  // Before/at Tue noon: confidence window
  if (now <= checkin_due) {
    if (!confComplete) {
      return {
        state: 'can_checkin',
        nextAction: 'Submit confidence',
        deadlineAt: checkin_due,
        backlogCount,
        selectionPending,
        lastActivity,
      };
    }
    // Conf is in, just waiting for Thu to open performance
    return {
      state: 'wait_for_thu',
      nextAction: 'Performance opens Thursday',
      backlogCount,
      selectionPending,
      lastActivity,
    };
  }

  // After Tue noon: confidence late if missing
  if (!confComplete && now > checkin_due && now < checkout_open) {
    // Don't populate backlog until Sunday night (week officially over)
    // Backlog v2 should only be populated at the END of the week, not mid-week
    
    return {
      state: 'missed_checkin',
      nextAction: 'Submit confidence (late)',
      backlogCount,
      selectionPending,
      lastActivity,
    };
  }

  // Thu -> Fri window: performance period
  if (now >= checkout_open && now <= checkout_due) {
    // During performance window, confidence must be complete first
    if (!confComplete) {
      return {
        state: 'missed_checkin',
        nextAction: 'Submit confidence (late)',
        deadlineAt: checkout_due,
        backlogCount,
        selectionPending,
        lastActivity,
      };
    }
    if (!perfComplete) {
      return {
        state: 'can_checkout',
        nextAction: 'Submit performance',
        deadlineAt: checkout_due,
        backlogCount,
        selectionPending,
        lastActivity,
      };
    }
    // Performance already in, but week not marked done => (shouldn't happen unless data skew)
    return {
      state: 'done',
      backlogCount,
      selectionPending,
      lastActivity,
    };
  }

  // After Fri due: if performance missing -> missed_checkout
  if (now > checkout_due && !perfComplete) {
    return {
      state: 'missed_checkout',
      nextAction: 'Submit performance (late)',
      backlogCount,
      selectionPending,
      lastActivity,
    };
  }

  // Fallback: if we've submitted confidence before Thu, keep it in wait_for_thu
  if (confComplete && now < checkout_open) {
    return {
      state: 'wait_for_thu',
      nextAction: 'Performance opens Thursday',
      backlogCount,
      selectionPending,
      lastActivity,
    };
  }

  // Absolute fallback
  return {
    state: 'no_assignments',
    backlogCount,
    selectionPending,
    lastActivity,
  };
}