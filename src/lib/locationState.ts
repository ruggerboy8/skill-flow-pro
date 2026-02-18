import { getWeekAnchors } from '@/v2/time';
import { supabase } from '@/integrations/supabase/client';
import { getOpenBacklogCountV2, populateBacklogV2ForMissedWeek } from './backlog';
import { format } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';


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
  source?: 'assignments';
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

  // Fetch location timezone
  const { data: locationData } = await supabase
    .from('locations')
    .select('timezone, organization_id')
    .eq('id', locationId)
    .maybeSingle();

  if (!locationData) return [];

  const now = params.simOverrides?.enabled && params.simOverrides?.nowISO 
    ? new Date(params.simOverrides.nowISO) 
    : new Date();
  
  const anchors = getWeekAnchors(now, locationData.timezone);
  const mondayStr = formatInTimeZone(anchors.mondayZ, locationData.timezone, 'yyyy-MM-dd');

  console.info(`[assembleWeek] Using weekly_assignments for role=${roleId} week=${mondayStr}`);
  
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
    console.info('[assembleWeek] ✅ Found %d locked rows for week=%s', assignData.length, mondayStr);
    
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

    return enrichedAssign.map((assign: any) => ({
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
  } else {
    console.warn('[assembleWeek] ❌ No weekly_assignments for week=%s role=%d', mondayStr, roleId);
    return [];
  }
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