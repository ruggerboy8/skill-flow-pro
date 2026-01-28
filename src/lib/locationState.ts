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
 * Check if staff member is eligible for pro moves
 * Always returns true - if someone has an account, they're eligible
 */
export function isEligibleForProMoves(_staff: { hire_date?: string | null }, _now: Date = new Date()): boolean {
  return true;
}

/**
 * Get number of weeks until eligibility for a staff member
 * Always returns 0 - no grace period
 */
export function getOnboardingWeeksLeft(_staff: { hire_date?: string | null }, _now: Date = new Date()): number {
  return 0;
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

  // Fetch location to check onboarding_active flag
  const { data: locationData } = await supabase
    .from('locations')
    .select('timezone, organization_id, onboarding_active')
    .eq('id', locationId)
    .maybeSingle();

  if (!locationData) return [];

  // Use global plan if cycle >= 4 OR onboarding is disabled
  const useGlobalPlan = cycleNumber >= 4 || locationData.onboarding_active === false;

  // ----- GRADUATION CHECK: Cycle 4+ OR skip onboarding uses global plan -----
  console.info(`[assembleWeek] cycle=${cycleNumber}, week=${weekInCycle}, onboarding_active=${locationData.onboarding_active}, using ${useGlobalPlan ? 'weekly_assignments/weekly_plan' : 'weekly_focus'}`);
  
  if (useGlobalPlan) {
    const location = locationData;

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
      console.warn('[assembleWeek] ❌ No global plan for graduated location (week %s, role %d) - found %d rows with error: %s', 
        mondayStr, roleId, planData?.length || 0, planErr?.message || 'none');
      
      // For global plan mode, if no plan data exists, return empty instead of falling back
      console.warn('[assembleWeek] No global plan for graduated location - returning empty assignments');
      return [];
    }
  }

  // ----- CYCLES 1-3 with onboarding enabled: Use weekly_assignments with source='onboarding' -----
  console.info('[assembleWeek] Using weekly_assignments for Cycles 1-3: cycle=%d week=%d role=%d location=%s', 
    cycleNumber, weekInCycle, roleId, locationId);

  // We already have location data from above
  const timezone = locationData.timezone;
  const cycleLength = 6; // Default if not fetched

  // Get cycle_length_weeks from a separate query if needed
  const { data: locDetails } = await supabase
    .from('locations')
    .select('cycle_length_weeks')
    .eq('id', locationId)
    .maybeSingle();
  
  const actualCycleLength = locDetails?.cycle_length_weeks || cycleLength;

  // Use current week's Monday (same approach as global plan) instead of calculating from program_start_date
  // This ensures we find assignments for new hires whose onboarding starts mid-location-cycle
  const now = params.simOverrides?.enabled && params.simOverrides?.nowISO 
    ? new Date(params.simOverrides.nowISO) 
    : new Date();
  const anchors = getWeekAnchors(now, timezone);
  const weekStartStr = formatInTimeZone(anchors.mondayZ, timezone, 'yyyy-MM-dd');

  console.info('[assembleWeek] Using current Monday for onboarding lookup:', weekStartStr);

  const { data: weeklyAssignments } = await supabase
    .from('weekly_assignments')
    .select('id, display_order, self_select, action_id, competency_id')
    .eq('role_id', roleId)
    .eq('location_id', locationId)
    .eq('week_start_date', weekStartStr)
    .eq('source', 'onboarding')
    .eq('status', 'locked')
    .order('display_order');

  if (!weeklyAssignments || weeklyAssignments.length === 0) return [];

  const isFoundation = cycleNumber === 1;

  // 2) Build set of "already assigned" action_ids (site moves first)
  const assignedActionIds = new Set<number>();
  const siteAssignments = weeklyAssignments.filter(wa => !wa.self_select && wa.action_id);
  if (siteAssignments.length) {
    const { data: siteMoves } = await supabase
      .from('pro_moves')
      .select('action_id')
      .in('action_id', siteAssignments.map(wa => wa.action_id as number));
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
  for (const wa of weeklyAssignments) {
    if (!wa.self_select) {
      // SITE move
      if (wa.action_id) {
        const info = await hydrateAction(wa.action_id);
        result.push({
          weekly_focus_id: `assign:${wa.id}`,
          type: 'site',
          ...info,
          required: true,
          locked: true,
          display_order: wa.display_order
        });
        if (info.pro_move_id) assignedActionIds.add(info.pro_move_id);
      }
      continue;
    }

    // SELF-SELECT slot
    if (isFoundation) {
      // Foundation = force site moves only; treat as "choose later"
      result.push({
        weekly_focus_id: `assign:${wa.id}`,
        type: 'selfSelect',
        action_statement: 'Choose a pro-move',
        domain_name: 'General',
        required: false,
        locked: false,
        display_order: wa.display_order
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
        weekly_focus_id: `assign:${wa.id}`,
        type: 'backlog',
        backlog_id: usedBacklog.id,
        ...info,
        required: false,
        locked: true,
        display_order: wa.display_order
      });
      if (info.pro_move_id) assignedActionIds.add(info.pro_move_id);
    } else {
      // No eligible backlog -> normal self-select
      let domainName = 'General';
      if (wa.competency_id) {
        const { data: comp } = await supabase
          .from('competencies')
          .select('name, domain_id')
          .eq('competency_id', wa.competency_id)
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
        weekly_focus_id: `assign:${wa.id}`,
        type: 'selfSelect',
        action_statement: 'Choose a pro-move',
        domain_name: domainName,
        required: false,
        locked: false,
        display_order: wa.display_order
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
  staffId?: string; // Optional: pass staff.id directly for masquerade support
}): Promise<StaffStatus> {
  const { userId, locationId, now = new Date(), simOverrides, weekContext, staffId: passedStaffId } = params;

  // 1) Location context (no ISO)
  const ctx = await getLocationWeekContext(locationId, now);
  const { cycleNumber, weekInCycle } = weekContext || ctx;

  // 2) Anchors for this location's current week
  const anchors = getWeekAnchors(now, ctx.timezone);
  const { checkin_open, checkin_due, checkout_open, checkout_due } = anchors;

  // Get staff information with org and timezone
  // Support masquerade: if staffId is passed, query by id; otherwise query by user_id
  let staffQuery = supabase
    .from('staff')
    .select('*, locations!inner(organization_id, timezone)');
  
  if (passedStaffId) {
    staffQuery = staffQuery.eq('id', passedStaffId);
  } else {
    staffQuery = staffQuery.eq('user_id', userId);
  }
  
  const { data: staff } = await staffQuery.maybeSingle();

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

  // Query scores against exactly these IDs (check both assignment_id and weekly_focus_id)
  const { data: scores, error: scoresError } = await supabase
    .from('weekly_scores')
    .select('confidence_score, confidence_date, performance_score, performance_date, weekly_focus_id, assignment_id')
    .eq('staff_id', staffId)
    .or(allIds.map(id => `assignment_id.eq.${id},weekly_focus_id.eq.${id}`).join(','));

  // P2 FIX: Check completion per required slot, not by totals
  const byId = new Map(allIds.map(id => [id, { conf: false, perf: false }]));
  for (const s of (scores ?? [])) {
    // Match by either assignment_id or weekly_focus_id
    const matchingId = allIds.find(id => id === s.assignment_id || id === s.weekly_focus_id);
    const row = matchingId ? byId.get(matchingId) : null;
    if (!row) continue;
    if (s.confidence_score != null) row.conf = true;
    if (s.performance_score != null) row.perf = true;
  }

  let confComplete = requiredIds.every(id => byId.get(id)?.conf);
  let perfComplete = requiredIds.every(id => byId.get(id)?.perf);

  // Check for individual excused submissions - treat excused metrics as complete
  const { data: excusedSubmissions } = await supabase
    .from('excused_submissions')
    .select('metric')
    .eq('staff_id', staffId)
    .eq('week_of', mondayStr);

  const excusedMetrics = new Set(
    (excusedSubmissions ?? []).map(e => e.metric)
  );

  // Also check for location-level excuses (excused_locations table)
  const { data: locationExcuses } = await supabase
    .from('excused_locations')
    .select('metric')
    .eq('location_id', locationId)
    .eq('week_of', mondayStr);

  // Merge location excuses into the set
  (locationExcuses ?? []).forEach(e => excusedMetrics.add(e.metric));

  // If a metric is excused (individually OR at location level), treat it as complete so the CTA skips it
  if (excusedMetrics.has('confidence')) {
    confComplete = true;
    console.log('[weekState] Confidence excused for week', mondayStr, '(individual or location-level)');
  }
  if (excusedMetrics.has('performance')) {
    perfComplete = true;
    console.log('[weekState] Performance excused for week', mondayStr, '(individual or location-level)');
  }

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

  // Get backlog count
  const backlogResult = await getOpenBacklogCountV2(staffId);
  const backlogCount = backlogResult.count;

  // Check for selection pending
  const selectionPending = false; // Simplified for now

  // Check if performance time gate is disabled
  const { data: timeGateSetting } = await supabase
    .from('app_kv')
    .select('value')
    .eq('key', 'global:performance_time_gate_enabled')
    .maybeSingle();
  
  const isTimeGateEnabled = (timeGateSetting?.value as { enabled?: boolean } | null)?.enabled !== false;

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
    // Conf is in - check if time gate is disabled
    if (!isTimeGateEnabled) {
      // Time gate disabled - allow immediate performance submission
      return {
        state: 'can_checkout',
        nextAction: 'Submit performance',
        deadlineAt: checkout_due,
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

  // Fallback: if we've submitted confidence before Thu, check time gate
  if (confComplete && now < checkout_open) {
    if (!isTimeGateEnabled) {
      // Time gate disabled - allow immediate performance submission
      return {
        state: 'can_checkout',
        nextAction: 'Submit performance',
        deadlineAt: checkout_due,
        backlogCount,
        selectionPending,
        lastActivity,
      };
    }
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