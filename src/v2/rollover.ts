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
  debug?: boolean;
}): Promise<{ executed: boolean; reason: string; prevWeek?: { cycle: number; week: number } }> {
  const { userId, staffId, roleId, locationId, now, debug = false } = args;

  const log = (msg: string, data?: any) => {
    if (debug) console.log(`[ROLLOVER] ${msg}`, data || '');
  };

  log('Starting rollover check', { userId, staffId, roleId, locationId, now: now.toISOString() });

  // Get location (tz, program_start_date, cycle_length)
  const { data: loc, error: locErr } = await supabase
    .from('locations')
    .select('timezone, program_start_date, cycle_length_weeks')
    .eq('id', locationId)
    .maybeSingle();
  if (locErr || !loc) {
    log('Location not found or error', { locErr });
    return { executed: false, reason: 'Location not found' };
  }

  // Is it >= Monday 12:01am local?
  const currAnchors = getWeekAnchors(now, loc.timezone);
  const rolloverThreshold = addMinutes(currAnchors.checkin_open, 1); // Mon 00:01 local
  if (now < rolloverThreshold) {
    log('Not rollover time yet', { now, threshold: rolloverThreshold });
    return { executed: false, reason: 'Not rollover time yet' };
  }

  // Get previous week's cycle/week using our location context (time-shift by -7 days)
  const prevCtx = await getLocationWeekContext(locationId, subDays(now, 7));
  const prevCycle = prevCtx.cycleNumber;
  const prevWeek  = prevCtx.weekInCycle;

  log('Previous week context', { prevCycle, prevWeek });

  // Find all weekly_focus rows for prev cycle/week/role
  const { data: focusRows } = await supabase
    .from('weekly_focus')
    .select('id, action_id, self_select')
    .eq('role_id', roleId)
    .eq('cycle', prevCycle)
    .eq('week_in_cycle', prevWeek);

  const focusIds = (focusRows || []).map(f => f.id);
  if (!focusIds.length) {
    log('No focus rows for previous week', { prevCycle, prevWeek, roleId });
    return { executed: false, reason: 'No focus rows for previous week', prevWeek: { cycle: prevCycle, week: prevWeek } };
  }

  log('Found focus rows', { count: focusIds.length, focusIds });

  // Check completion: do we have performance for ALL of them?
  const { data: prevScores } = await supabase
    .from('weekly_scores')
    .select('id, weekly_focus_id, confidence_score, confidence_date, performance_score')
    .eq('staff_id', staffId)
    .in('weekly_focus_id', focusIds);

  const required = focusIds.length;
  const perfCount = (prevScores || []).filter(s => s.performance_score !== null).length;
  const fullyPerformed = perfCount >= required;

  log('Performance check', { required, perfCount, fullyPerformed, scores: prevScores });

  if (fullyPerformed) {
    log('Week fully performed, no rollover needed');
    return { executed: false, reason: 'Week fully performed', prevWeek: { cycle: prevCycle, week: prevWeek } };
  }

  // 1) Add SITE moves from that week to backlog (dedup handled by RPC)
  const assignments = await assembleLocationWeek({
    userId,
    roleId,
    locationId,
    cycleNumber: prevCycle,
    weekInCycle: prevWeek,
  });

  const siteMoves = assignments.filter((a: any) => a.type === 'site' && a.pro_move_id);
  log('Found site moves to add to backlog', { count: siteMoves.length, moves: siteMoves.map(s => ({ id: s.pro_move_id, statement: s.action_statement })) });

  for (const s of siteMoves) {
    await addToBacklogV2(staffId, s.pro_move_id, prevCycle, prevWeek);
    log('Added to backlog', { actionId: s.pro_move_id, statement: s.action_statement });
  }

  // 2) Clear confidence for items that still lack performance
  const toClear = (prevScores || [])
    .filter(r => r.performance_score === null); // only where perf is missing
  
  log('Clearing confidence for incomplete items', { count: toClear.length });
  
  if (toClear.length) {
    const updates = toClear.map(r => ({
      id: r.id,
      staff_id: staffId,
      weekly_focus_id: r.weekly_focus_id,
      confidence_score: null,
      confidence_date: null,
    }));
    await supabase.from('weekly_scores').upsert(updates);
    log('Cleared confidence scores', { count: updates.length });
  }

  log('Rollover completed successfully', { siteMoves: siteMoves.length, clearedConfidence: toClear.length });
  return { 
    executed: true, 
    reason: `Rolled over ${siteMoves.length} site moves, cleared ${toClear.length} confidence scores`,
    prevWeek: { cycle: prevCycle, week: prevWeek }
  };
}