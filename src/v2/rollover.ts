import { addMinutes, subDays } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { getWeekAnchors } from '@/v2/time';
import { getLocationWeekContext, assembleWeek as assembleLocationWeek } from '@/lib/locationState';

/**
 * Enforce weekly rollover at local Monday 12:01am.
 * - If the previous week is not fully "performed", push SITE moves to backlog (FIFO).
 * Safe to call repeatedly; it's idempotent.
 */
export async function enforceWeeklyRolloverNow(args: {
  userId: string;
  staffId: string;
  roleId: number;
  locationId: string;
  now: Date;
}): Promise<void> {
  const { userId, staffId, roleId, locationId, now } = args;

  // Get location (tz, program_start_date, cycle_length)
  const { data: loc, error: locErr } = await supabase
    .from('locations')
    .select('timezone, program_start_date, cycle_length_weeks')
    .eq('id', locationId)
    .maybeSingle();
  if (locErr || !loc) return;

  // Get previous week's cycle/week using our location context (time-shift by -7 days)
  const prevCtx = await getLocationWeekContext(locationId, subDays(now, 7));
  const prevCycle = prevCtx.cycleNumber;
  const prevWeek  = prevCtx.weekInCycle;

  // Skip rollover for Cycle 4+ (global plan handles it)
  if (prevCycle >= 4) {
    console.log(`[Rollover] Skipping for Cycle ${prevCycle} (global plan active)`);
    return;
  }

  // Is it >= Monday 12:01am local?
  const currAnchors = getWeekAnchors(now, loc.timezone);
  const rolloverThreshold = addMinutes(currAnchors.checkin_open, 1);
  if (now < rolloverThreshold) return;

  // Find all weekly_focus rows for prev cycle/week/role
  const { data: focusRows } = await supabase
    .from('weekly_focus')
    .select('id, action_id, self_select')
    .eq('role_id', roleId)
    .eq('cycle', prevCycle)
    .eq('week_in_cycle', prevWeek);

  const focusIds = (focusRows || []).map(f => f.id);
  if (!focusIds.length) return;

  // Check completion: do we have performance for ALL of them?
  const { data: prevScores } = await supabase
    .from('weekly_scores')
    .select('id, weekly_focus_id, confidence_score, confidence_date, performance_score, performance_date')
    .eq('staff_id', staffId)
    .in('weekly_focus_id', focusIds);

  const required = focusIds.length;
  const perfCount = (prevScores || []).filter(s => s.performance_score !== null).length;
  const fullyPerformed = perfCount >= required;

  if (fullyPerformed) return; // nothing to rollover

  // Backlog writes removed 2026-07-25 (roadmap 2.3): no missed-assignment
  // workflow — Pro Moves are only meaningful in the group meeting, so missed
  // weeks are simply missed. (Rollover itself is cycles-1-3 legacy and is
  // slated for full retirement in roadmap 2.4.)
}