import { addMinutes, subDays } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { getWeekAnchors } from '@/v2/time';
import { getLocationWeekContext, assembleWeek as assembleLocationWeek } from '@/lib/locationState';
import { addToBacklogV2 } from '@/lib/backlog';

/**
 * Enforce weekly rollover at local Monday 12:01am.
 * - If the previous week is not fully "performed", push SITE moves to backlog (FIFO).
 * - Clear confidence for prior-week rows that still lack performance.
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

  // Is it >= Monday 12:01am local?
  const currAnchors = getWeekAnchors(now, loc.timezone);
  const rolloverThreshold = addMinutes(currAnchors.checkin_open, 1); // Mon 00:01 local
  if (now < rolloverThreshold) return; // not time yet

  // Get previous week's cycle/week using our location context (time-shift by -7 days)
  const prevCtx = await getLocationWeekContext(locationId, subDays(now, 7));
  const prevCycle = prevCtx.cycleNumber;
  const prevWeek  = prevCtx.weekInCycle;

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
  const confCount = (prevScores || []).filter(s => s.confidence_score !== null).length;
  const perfCount = (prevScores || []).filter(s => s.performance_score !== null).length;
  const fullyPerformed = perfCount >= required;
  const hadAnyConfidence = confCount > 0;

  if (fullyPerformed) return; // nothing to rollover
  if (!hadAnyConfidence) return; // don't backlog a week that had no check-in

  // 1) Add SITE moves from that week to backlog (dedup handled by RPC)
  const siteActionIds = (focusRows || [])
    .filter(f => !f.self_select && f.action_id)     // site slots only
    .map(f => f.action_id as number);

  for (const actionId of siteActionIds) {
    await addToBacklogV2(staffId, actionId, prevCycle, prevWeek); // RPC dedups
  }

  // 2) Clear confidence for items that still lack performance
  const toClear = (prevScores || [])
    .filter(r => r.performance_score === null); // only where perf is missing
  if (toClear.length) {
    console.log(`[Rollover] Clearing confidence for ${toClear.length} incomplete items for staff ${staffId}, cycle ${prevCycle}, week ${prevWeek}`);
    
    const updates = toClear.map(r => ({
      id: r.id,
      staff_id: staffId,
      weekly_focus_id: r.weekly_focus_id,
      confidence_score: null,
      confidence_date: null,
      performance_score: r.performance_score, // preserve existing performance score
      performance_date: r.performance_date, // preserve existing performance date
    }));
    
    const { error } = await supabase.from('weekly_scores').upsert(updates);
    if (error) {
      console.error('[Rollover] Error clearing confidence scores:', error);
      throw new Error(`Failed to clear confidence scores: ${error.message}`);
    }
  }
}