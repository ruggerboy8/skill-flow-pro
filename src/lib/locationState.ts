import { getWeekAnchors } from '@/v2/time';
import { getPolicyOffsetsForLocation, getAssignmentWeekMondayStr } from '@/lib/submissionPolicy';
import { supabase } from '@/integrations/supabase/client';
import { fetchOrgProMoveMetaByIds } from '@/lib/proMoves';
import { fetchContentOverrides, resolveStatement } from '@/lib/contentOverrides';
// (backlog helpers removed 2026-07-25 — no missed-assignment workflow; roadmap 2.3)
import { format } from 'date-fns';
import { computeWeekCycleMath } from '@/lib/weekCycleMath';
import { computeWeekStateCore, type WeekStateFacts } from '@/lib/weekStateCore';


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
  
  // Get time anchors for this location's timezone with per-location deadline offsets
  const offsets = getPolicyOffsetsForLocation(location);
  const anchors = getWeekAnchors(now, location.timezone, offsets);
  const currentMonday = new Date(anchors.mondayZ);
  
  // Get the Monday of the week containing program start date
  const programStartAnchors = getWeekAnchors(programStartDate, location.timezone, offsets);
  const programStartMonday = new Date(programStartAnchors.mondayZ);

  // Check if we're before the performance deadline (Friday 5pm)
  // If so, we're still working on the previous week's assignments
  const beforePerformanceDeadline = now < anchors.checkout_due;

  // Week index + legacy cycle number/week-in-cycle math — pure, see
  // weekCycleMath.ts (TST-3). cycleNumber/weekInCycle are a legacy concept
  // pending eventual removal; kept here with identical behavior.
  const { cycleNumber, weekInCycle } = computeWeekCycleMath({
    cycleLength,
    currentMonday,
    programStartMonday,
    beforePerformanceDeadline,
  });

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
 * ASG-1 Fix 2: resolves a practice group's parent organization id. One half
 * of the location -> group -> org chain every participant surface must use
 * to find the ONE canonical timezone behind the org-level
 * `weekly_assignments` week key. Reused by `assembleWeek` below and by
 * every other participant surface that already has a `group_id` in hand
 * (via a `locations` join) but not yet an orgId — see
 * `resolveOrgTimezoneForGroup`.
 */
export async function resolveOrgIdForGroup(groupId: string): Promise<string | null> {
  const { data: pgData, error: pgErr } = await supabase
    .from('practice_groups')
    .select('organization_id')
    .eq('id', groupId)
    .maybeSingle();

  if (pgErr) {
    console.warn('[resolveOrgIdForGroup] Failed to resolve organization_id for group=%s: %o', groupId, pgErr);
  }
  return pgData?.organization_id ?? null;
}

/**
 * ASG-1 Fix 2: resolves `organizations.timezone` for a known org id. Falls
 * back to 'America/Chicago' on any missing value or error — same fallback
 * `assembleWeek` always used — so a not-yet-backfilled column or an
 * out-of-order deploy never throws; it just serves the platform default
 * until the real value is available.
 */
export async function resolveOrgTimezoneById(orgId: string): Promise<string> {
  const { data: orgData, error: orgErr } = await supabase
    .from('organizations')
    // organizations.timezone is a recent additive column; generated types
    // lag until Lovable's next regen, so the row is typed by hand below
    // (repo convention, see useAuth.tsx pwa_enabled).
    .select('timezone' as 'id')
    .eq('id', orgId)
    .maybeSingle();

  if (orgErr) {
    console.warn('[resolveOrgTimezoneById] Failed to fetch organizations.timezone for org=%s, falling back to America/Chicago: %o', orgId, orgErr);
  }
  return (orgData as unknown as { timezone: string } | null)?.timezone || 'America/Chicago';
}

/**
 * ASG-1 Fix 2: the shared "what org-canonical timezone applies to this
 * practice group" resolver — composes `resolveOrgIdForGroup` +
 * `resolveOrgTimezoneById`, the exact chain `assembleWeek` uses. Every
 * participant surface that already has a location's `group_id` in hand
 * (e.g. a `staff.locations(...group_id)` join) should call this instead of
 * re-deriving the location -> group -> org -> timezone chain itself, so
 * there is one definition of "the org-canonical week" to keep correct.
 * Falls back to 'America/Chicago' (and `orgId: null`) when `groupId` is
 * missing or has no resolvable organization, matching `assembleWeek`.
 */
export async function resolveOrgTimezoneForGroup(
  groupId: string | null | undefined
): Promise<{ orgId: string | null; timezone: string }> {
  if (!groupId) return { orgId: null, timezone: 'America/Chicago' };
  const orgId = await resolveOrgIdForGroup(groupId);
  if (!orgId) return { orgId: null, timezone: 'America/Chicago' };
  return { orgId, timezone: await resolveOrgTimezoneById(orgId) };
}

/**
 * Assemble weekly assignments for a user based on location context.
 *
 * Returns the canonical `weekStartDate` ('yyyy-MM-dd', org-tz Monday)
 * alongside the assignments, so every caller that also needs to key a
 * "Week of" label or an excused-week lookup off the same week can reuse
 * this ONE resolution instead of recomputing it (ASG-1 Fix 2). `null` only
 * when the location or its org could not be resolved at all (in which case
 * `assignments` is always `[]` too).
 */
export async function assembleWeek(params: {
  userId: string;
  roleId: number;
  locationId: string;
  cycleNumber: number;
  weekInCycle: number;
  simOverrides?: any;
}): Promise<{ assignments: any[]; weekStartDate: string | null }> {
  const { userId, roleId, locationId, cycleNumber, weekInCycle } = params;

  console.info(`🔎 [assembleWeek] START — userId=${userId} roleId=${roleId} locationId=${locationId} cycle=${cycleNumber} week=${weekInCycle}`);

  // Fetch location timezone
  const { data: locationData, error: locErr } = await supabase
    .from('locations')
    .select('timezone, group_id, conf_due_day, conf_due_time, perf_due_day, perf_due_time')
    .eq('id', locationId)
    .maybeSingle();

  if (!locationData) {
    console.warn('[assembleWeek] ❌ Location not found for id=%s error=%o', locationId, locErr);
    return { assignments: [], weekStartDate: null };
  }

  console.info('[assembleWeek] Location resolved — group_id=%s tz=%s', locationData.group_id, locationData.timezone);

  const now = params.simOverrides?.enabled && params.simOverrides?.nowISO
    ? new Date(params.simOverrides.nowISO)
    : new Date();

  // ASG-1 Fix 2: resolve the org BEFORE computing the assignment-lookup
  // Monday. weekly_assignments rows are org-level (location_id is null),
  // so the lookup key must come from the org's ONE canonical timezone, not
  // this location's own timezone. Per-location timezone/offsets still drive
  // due-date/deadline display elsewhere (getLocationWeekContext,
  // computeWeekState below); nothing about that changes here. This also
  // makes the now-unneeded getWeekAnchors(now, locationData.timezone, ...)
  // call (previously used only to derive the old location-tz mondayStr)
  // go away, since its one consumer moved to the org-tz path below.
  const orgId = await resolveOrgIdForGroup(locationData.group_id);

  console.info(`[assembleWeek] Org resolution — group_id=${locationData.group_id} → organization_id=${orgId}`);

  if (!orgId) {
    console.warn('[assembleWeek] ❌ No organization_id found for location=%s group_id=%s', locationId, locationData.group_id);
    return { assignments: [], weekStartDate: null };
  }

  const orgTimezone = await resolveOrgTimezoneById(orgId);
  const mondayStr = getAssignmentWeekMondayStr(now, orgTimezone);

  console.info('[assembleWeek] Computed mondayStr=%s from now=%s orgTz=%s (org-canonical, not location tz)', mondayStr, now.toISOString(), orgTimezone);

  // Query weekly_assignments scoped to the organization (no fallback)
  console.info('[assembleWeek] Querying weekly_assignments — role_id=%d week=%s status=locked org_id=%s', roleId, mondayStr, orgId);
  const { data: assignData, error: assignErr } = await supabase
    .from('weekly_assignments')
    .select('id, display_order, action_id, self_select, status, source, org_id')
    .eq('role_id', roleId)
    .eq('week_start_date', mondayStr)
    .eq('status', 'locked')
    .eq('org_id', orgId)
    .order('display_order');

  console.info('[assembleWeek] Query result — rows=%d error=%s rawData=%o', assignData?.length ?? 0, assignErr?.message ?? 'none', assignData);

  if (!assignErr && assignData && assignData.length > 0) {
    console.info('[assembleWeek] ✅ Found %d locked rows for week=%s', assignData.length, mondayStr);
    
    // Fetch with joins
    const { data: enrichedAssign, error: enrichErr } = await supabase
      .from('weekly_assignments')
      .select(`
        id,
        action_id,
        org_move_id,
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
      .eq('role_id', roleId)
      .eq('week_start_date', mondayStr)
      .eq('status', 'locked')
      .eq('org_id', orgId)
      .order('display_order');

    if (enrichErr || !enrichedAssign) {
      console.error('[assembleWeek] Failed to fetch enriched assignments:', enrichErr);
      return { assignments: [], weekStartDate: mondayStr };
    }

    // Resolve org-custom move metadata (rows where org_move_id is set instead of action_id)
    const orgMoveIds = enrichedAssign
      .map((a: any) => a.org_move_id)
      .filter((id: string | null): id is string => !!id);
    const orgMeta = orgMoveIds.length > 0
      ? await fetchOrgProMoveMetaByIds(orgMoveIds)
      : new Map();

    // PML-2b: participant-facing rewording. Fetch this org's content
    // overrides for every platform action_id in the week, so the org's
    // custom wording (not the platform default) is what shows at check-in.
    const platformActionIds = enrichedAssign
      .map((a: any) => a.action_id)
      .filter((id: number | null): id is number => id != null);
    const overrides = await fetchContentOverrides(orgId, platformActionIds);

    const assignments = enrichedAssign.map((assign: any) => {
      const om = assign.org_move_id ? orgMeta.get(assign.org_move_id) : undefined;
      const platformStatement = assign.pro_moves?.action_statement || null;
      const resolvedPlatformStatement = platformStatement
        ? resolveStatement(assign.action_id, platformStatement, overrides)
        : null;
      return {
        weekly_focus_id: `assign:${assign.id}`,
        type: 'site',
        pro_move_id: assign.action_id,
        org_move_id: assign.org_move_id ?? null,
        action_statement: resolvedPlatformStatement || om?.statement || 'Pro Move',
        intervention_text: assign.pro_moves?.intervention_text || om?.description || null,
        competency_name: assign.pro_moves?.competencies?.name || om?.competencyName || 'General',
        domain_name: assign.pro_moves?.competencies?.domains?.domain_name || om?.domain || 'General',
        required: true,
        locked: !!(assign.action_id || assign.org_move_id),
        display_order: assign.display_order,
        source: 'assignments',
        weekLabel: `Week of ${mondayStr}`
      };
    });
    return { assignments, weekStartDate: mondayStr };
  } else {
    console.warn('[assembleWeek] ❌ No weekly_assignments for week=%s role=%d', mondayStr, roleId);
    return { assignments: [], weekStartDate: mondayStr };
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

  // 2) Anchors for this location's current week — reuse the context's anchors,
  // which already honor the location's per-deadline offsets (Phase C U5; the
  // previous recompute here silently used system-default due times).
  const anchors = ctx.anchors;
  const { checkin_open, checkin_due, checkout_open, checkout_due } = anchors;

  // Get staff information with org and timezone.
  // Support masquerade: if staffId is passed, query by id; otherwise query by user_id.
  // weekly_assignments.org_id stores organizations.id (NOT practice_groups.id), so we must
  // resolve the true organization id via the location's group → organization chain or fall
  // back to staff.organization_id directly.
  let staffQuery = supabase
    .from('staff')
    .select('*, locations!inner(group_id, timezone, practice_groups!locations_org_fkey(organization_id))');

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
  const orgId =
    (staff as any).organization_id ||
    (staff.locations as any)?.practice_groups?.organization_id ||
    null;

  // Check eligibility (onboarding status). isEligibleForProMoves is pure and
  // always true today, so this never actually short-circuits in practice —
  // kept as an early return (matching origin/main exactly) so that if it
  // ever stops being a stub, an ineligible staff member still skips
  // assembleWeek()/weekly_scores/excused_* below, same as before this
  // refactor (TST-3 QA finding: ordering must stay byte-faithful).
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

  // ASG-1 Fix 2 (secondary): the excused_submissions/excused_locations
  // lookups below key by 'week_of', which must match the same org-canonical
  // week assembleWeek() now resolves assignments under, not this staff
  // member's location timezone (the previous computation here, despite
  // being named "org timezone", actually used staff.locations.timezone).
  // Org resolution itself (`orgId` above) is unchanged, out of scope here
  // per ASG-1 Fix 3. The organizations.timezone lookup itself now goes
  // through the same shared resolver assembleWeek() uses, instead of a
  // second inlined copy of the same query.
  const canonicalOrgTz = orgId ? await resolveOrgTimezoneById(orgId) : 'America/Chicago';
  const mondayStr = getAssignmentWeekMondayStr(now, canonicalOrgTz);

  // ----- P0 FIX: Use assembleWeek as single source of truth for IDs -----
  const { assignments } = await assembleWeek({
    userId,
    roleId,
    locationId,
    cycleNumber,
    weekInCycle,
    simOverrides,
  });

  const hasAssignments = !!(assignments && assignments.length > 0);
  if (!hasAssignments) {
    console.warn('[weekState] ❌ No assignments found for cycle=%d week=%d role=%d',
      cycleNumber, weekInCycle, roleId);
  }

  let confComplete = false;
  let perfComplete = false;
  let lastActivity: { kind: 'confidence' | 'performance'; at: Date } | undefined;

  if (hasAssignments) {
    const allIds = assignments.map(a => a.weekly_focus_id);
    const requiredIds = assignments.filter(a => a.required).map(a => a.weekly_focus_id);
    const required = requiredIds.length;

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

    confComplete = requiredIds.every(id => byId.get(id)?.conf);
    perfComplete = requiredIds.every(id => byId.get(id)?.perf);

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

    lastActivity =
      latestConf && latestPerf
        ? (latestConf.at > latestPerf.at ? latestConf : latestPerf)
        : (latestConf ?? latestPerf);
  }

  // Backlog retired (2026-07-25): no missed-assignment workflow, count is always 0.
  const backlogCount = 0;

  // Check for selection pending
  const selectionPending = false; // Simplified for now

  // Performance time gate is always enforced — Thursday 00:01 local tz

  // Delegate the actual state decision to the pure core (TST-3). Same
  // branch order and same returned StaffStatus shapes as the inline state
  // machine this replaced. eligible is always true here — the ineligible
  // case already returned above, matching origin/main's ordering.
  const facts: WeekStateFacts = {
    now,
    anchors: { checkin_due, checkout_open, checkout_due },
    eligible: true,
    hasAssignments,
    confComplete,
    perfComplete,
    backlogCount,
    selectionPending,
    lastActivity,
  };

  return computeWeekStateCore(facts);
}