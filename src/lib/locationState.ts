import { getWeekAnchors } from '@/v2/time';
import { supabase } from '@/integrations/supabase/client';
import { getOpenBacklogCountV2, populateBacklogV2ForMissedWeek } from './backlog';
import { format } from 'date-fns';

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
  const mondayStr = format(anchors.mondayZ, 'yyyy-MM-dd');

  // ----- HYBRID LOGIC: Try locked weekly_plan first -----
  let focusIds: string[] = [];
  let dataSource: 'weekly_plan' | 'weekly_focus' = 'weekly_focus';

  // Simple per-render cache to avoid N× queries for same week
  const cacheKey = `${orgId}:${roleId}:${mondayStr}`;
  if (!globalThis.__weekStateCache) {
    globalThis.__weekStateCache = new Map<string, { ids: string[], source: string }>();
  }
  const cache = globalThis.__weekStateCache as Map<string, { ids: string[], source: string }>;

  if (cache.has(cacheKey)) {
    const cached = cache.get(cacheKey)!;
    focusIds = cached.ids;
    dataSource = cached.source as 'weekly_plan' | 'weekly_focus';
    console.info(`[weekState] cache hit for ${cacheKey} source=${dataSource}`);
  } else {
    // Try weekly_plan if we have org context
    if (orgId) {
      const { data: planData, error: planErr } = await supabase
        .from('weekly_plan')
        .select('id, display_order')
        .eq('org_id', orgId)
        .eq('role_id', roleId)
        .eq('week_start_date', mondayStr)
        .eq('status', 'locked')
        .order('display_order');

      // Only use plan if we have exactly 3 locked rows
      if (!planErr && planData && planData.length === 3) {
        focusIds = planData.map(p => `plan:${p.id}`);
        dataSource = 'weekly_plan';
        console.info('[weekState] source=weekly_plan locked=true org=%s role=%d week=%s', 
          orgId, roleId, mondayStr);
      }
    }

    // Fallback to weekly_focus
    if (focusIds.length === 0) {
      const { data: focusRows, error: focusErr } = await supabase
        .from('weekly_focus')
        .select('id')
        .eq('role_id', roleId)
        .eq('cycle', cycleNumber)
        .eq('week_in_cycle', weekInCycle);

      if (!focusErr && focusRows) {
        focusIds = focusRows.map(r => r.id);
        dataSource = 'weekly_focus';
        console.info('[weekState] source=weekly_focus cycle=%d week=%d role=%d', 
          cycleNumber, weekInCycle, roleId);
      }
    }

    // Cache result
    cache.set(cacheKey, { ids: focusIds, source: dataSource });
  }

  const required = focusIds.length;

  if (required === 0) {
    return {
      state: 'no_assignments',
      backlogCount: 0,
      selectionPending: false,
    };
  }

  // current staff id from userId
  const staffId = staff.id;

  // Get weekly_scores for those focus IDs (this week only!)
  const { data: scores } = await supabase
    .from('weekly_scores')
    .select('confidence_score, confidence_date, performance_score, performance_date, weekly_focus_id')
    .eq('staff_id', staffId)
    .in('weekly_focus_id', focusIds);

  // Debug logging for score filtering
  console.log('=== DEBUG SCORES FILTERING ===');
  console.log('Focus IDs for current week:', focusIds);
  console.log('All scores found:', scores);
  
  const confCount = (scores ?? []).filter(s => s.confidence_score !== null).length;
  const perfCount = (scores ?? []).filter(s => s.performance_score !== null).length;
  
  console.log('Confidence count:', confCount, '/ required:', required);
  console.log('Performance count:', perfCount, '/ required:', required);

  // Apply simulation overrides for confidence/performance status
  let confComplete = confCount >= required;
  let perfComplete = perfCount >= required;
  
  console.log('Confidence complete:', confComplete);
  console.log('Performance complete:', perfComplete);
  
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