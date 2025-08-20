import { getWeekAnchors, CT_TZ } from './centralTime';
import { supabase } from '@/integrations/supabase/client';
import { SimOverrides } from '@/devtools/SimProvider';

export type WeekState = 'missed_checkin' | 'can_checkin' | 'can_checkout' | 'wait_for_thu' | 'done';

export interface WeekContext {
  state: WeekState;
  iso_year: number;
  iso_week: number;
  anchors: ReturnType<typeof getWeekAnchors>;
  hasValidConfidence: boolean;
  hasValidPerformance: boolean;
}

// Get current ISO week and year
export function getCurrentISOWeek(now: Date): { iso_year: number; iso_week: number } {
  const tempDate = new Date(now.getTime());
  tempDate.setUTCDate(tempDate.getUTCDate() + 4 - (tempDate.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(tempDate.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((tempDate.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return { iso_year: tempDate.getUTCFullYear(), iso_week: weekNo };
}

// Read-override hook: Check if staff has valid confidence for current week
export async function hasCurrentWeekConfidence(
  staffId: string, 
  weekId: { iso_year: number; iso_week: number }, 
  anchors: ReturnType<typeof getWeekAnchors>,
  simOverrides?: SimOverrides
): Promise<boolean> {
  // If simulation is active, check overrides first
  if (simOverrides?.enabled && simOverrides.forceHasConfidence !== null) {
    return simOverrides.forceHasConfidence;
  }

  // Otherwise, check real data
  return await checkRealConfidence(staffId, weekId, anchors);
}

// Read-override hook: Check if staff has valid performance for current week  
export async function hasCurrentWeekPerformance(
  staffId: string,
  weekId: { iso_year: number; iso_week: number },
  anchors: ReturnType<typeof getWeekAnchors>,
  simOverrides?: SimOverrides
): Promise<boolean> {
  // If simulation is active, check overrides first
  if (simOverrides?.enabled && simOverrides.forceHasPerformance !== null) {
    return simOverrides.forceHasPerformance;
  }

  // Otherwise, check real data
  return await checkRealPerformance(staffId, weekId, anchors);
}

async function checkRealConfidence(
  staffId: string, 
  weekId: { iso_year: number; iso_week: number }, 
  anchors: ReturnType<typeof getWeekAnchors>
): Promise<boolean> {
  // First try to get weekly focus for current ISO week
  let { data: weeklyFocus } = await supabase
    .from('weekly_focus')
    .select('id')
    .eq('cycle', 2)
    .eq('week_in_cycle', 1);

  // If no results, try cycle 2 week 1 (post-backfill)
  if (!weeklyFocus?.length) {
    const { data: staffData } = await supabase
      .from('staff')
      .select('id, role_id')
      .eq('id', staffId)
      .single();

    if (staffData) {
      // Check if user completed backfill
      const { data: hasScores } = await supabase
        .from('weekly_scores')
        .select('id')
        .eq('staff_id', staffId)
        .limit(1);

      if (hasScores && hasScores.length > 0) {
        const { data: cycle2Focus } = await supabase
          .from('weekly_focus')
          .select('id')
          .eq('cycle', 2)
          .eq('week_in_cycle', 1)
          .eq('role_id', staffData.role_id);
        
        if (cycle2Focus) {
          weeklyFocus = cycle2Focus;
        }
      }
    }
  }

  if (!weeklyFocus?.length) return false;

  const focusIds = weeklyFocus.map(f => f.id);

  // Check if all have confidence scores submitted within the confidence window
  const { data: scores } = await supabase
    .from('weekly_scores')
    .select('confidence_score, confidence_date')
    .eq('staff_id', staffId)
    .in('weekly_focus_id', focusIds)
    .not('confidence_score', 'is', null)
    .gte('confidence_date', anchors.checkin_open.toISOString())
    .lte('confidence_date', anchors.confidence_deadline.toISOString());

  return (scores?.length || 0) === focusIds.length;
}

async function checkRealPerformance(
  staffId: string,
  weekId: { iso_year: number; iso_week: number },
  anchors: ReturnType<typeof getWeekAnchors>
): Promise<boolean> {
  // First try to get weekly focus for current ISO week
  let { data: weeklyFocus } = await supabase
    .from('weekly_focus')
    .select('id')
    .eq('cycle', 2)
    .eq('week_in_cycle', 1);

  // If no results, try cycle 2 week 1 (post-backfill)
  if (!weeklyFocus?.length) {
    const { data: staffData } = await supabase
      .from('staff')
      .select('id, role_id')
      .eq('id', staffId)
      .single();

    if (staffData) {
      // Check if user completed backfill
      const { data: hasScores } = await supabase
        .from('weekly_scores')
        .select('id')
        .eq('staff_id', staffId)
        .limit(1);

      if (hasScores && hasScores.length > 0) {
        const { data: cycle2Focus } = await supabase
          .from('weekly_focus')
          .select('id')
          .eq('cycle', 2)
          .eq('week_in_cycle', 1)
          .eq('role_id', staffData.role_id);
        
        if (cycle2Focus) {
          weeklyFocus = cycle2Focus;
        }
      }
    }
  }

  if (!weeklyFocus?.length) return false;

  const focusIds = weeklyFocus.map(f => f.id);

  // Check if all have performance scores submitted within the performance window  
  const { data: scores } = await supabase
    .from('weekly_scores')
    .select('performance_score, performance_date')
    .eq('staff_id', staffId)
    .in('weekly_focus_id', focusIds)
    .not('performance_score', 'is', null)
    .gte('performance_date', anchors.checkout_open.toISOString())
    .lte('performance_date', anchors.performance_deadline.toISOString());

  return (scores?.length || 0) === focusIds.length;
}

// Read-override hook: Get backlog count (with simulation override)
export async function getOpenBacklogCount(
  userId: string,
  simOverrides?: SimOverrides
): Promise<{ count: number; items: any[] }> {
  // If simulation is active and backlog count is forced
  if (simOverrides?.enabled && simOverrides.forceBacklogCount !== null) {
    const count = simOverrides.forceBacklogCount;
    // Generate synthetic backlog items for UI rendering
    const items = Array.from({ length: count }, (_, i) => ({
      id: `__sim_${i}`,
      __sim: true, // Mark as simulated
      pro_move_id: i + 1,
      status: 'open',
      action_statement: `Simulated Backlog Item ${i + 1}`,
    }));
    return { count, items };
  }

  // Otherwise, get real backlog data
  const { data: backlog } = await supabase
    .from('user_backlog')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'open');

  return { count: backlog?.length || 0, items: backlog || [] };
}

// Compute the current week state with proper read masking
export async function computeWeekState(
  staffId: string, 
  now: Date, 
  simOverrides?: SimOverrides
): Promise<WeekContext> {
  const { iso_year, iso_week } = getCurrentISOWeek(now);
  const anchors = getWeekAnchors(now, CT_TZ);
  
  const hasValidConfidence = await hasCurrentWeekConfidence(
    staffId, 
    { iso_year, iso_week }, 
    anchors, 
    simOverrides
  );
  
  const hasValidPerformance = await hasCurrentWeekPerformance(
    staffId, 
    { iso_year, iso_week }, 
    anchors, 
    simOverrides
  );

  let state: WeekState;

  // State machine logic based on time and submissions
  if (now < anchors.confidence_deadline) {
    // Before Tuesday 12:00 - can check in
    state = 'can_checkin';
  } else if (!hasValidConfidence) {
    // After Tuesday 12:00 with no confidence - missed checkin
    state = 'missed_checkin';
  } else if (now < anchors.checkout_open) {
    // Wednesday - wait for Thursday
    state = 'wait_for_thu';
  } else if (now <= anchors.performance_deadline && !hasValidPerformance) {
    // Thursday until end - can checkout
    state = 'can_checkout';
  } else {
    // Week complete
    state = 'done';
  }

  return {
    state,
    iso_year,
    iso_week,
    anchors,
    hasValidConfidence,
    hasValidPerformance
  };
}
