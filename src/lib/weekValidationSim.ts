import { nowUtc, getWeekAnchors } from './centralTime';
import { supabase } from '@/integrations/supabase/client';
import { useSim } from '@/devtools/SimProvider';

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
export function getCurrentISOWeek(now: Date = nowUtc()): { iso_year: number; iso_week: number } {
  const tempDate = new Date(now.getTime());
  tempDate.setUTCDate(tempDate.getUTCDate() + 4 - (tempDate.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(tempDate.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((tempDate.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return { iso_year: tempDate.getUTCFullYear(), iso_week: weekNo };
}

// Check if staff has valid scores for current week (with simulation overrides)
export async function hasValidScores(staffId: string, now: Date = nowUtc(), simOverrides?: any): Promise<{
  hasValidConfidence: boolean;
  hasValidPerformance: boolean;
}> {
  // If simulation is active, check overrides first
  if (simOverrides?.enabled) {
    const hasValidConfidence = simOverrides.forceHasConfidence ?? await checkRealConfidence(staffId, now);
    const hasValidPerformance = simOverrides.forceHasPerformance ?? await checkRealPerformance(staffId, now);
    return { hasValidConfidence, hasValidPerformance };
  }

  // Otherwise, check real data
  const hasValidConfidence = await checkRealConfidence(staffId, now);
  const hasValidPerformance = await checkRealPerformance(staffId, now);
  return { hasValidConfidence, hasValidPerformance };
}

async function checkRealConfidence(staffId: string, now: Date): Promise<boolean> {
  const { iso_year, iso_week } = getCurrentISOWeek(now);
  const anchors = getWeekAnchors(now);

  // Get weekly focus for current week
  const { data: weeklyFocus } = await supabase
    .from('weekly_focus')
    .select('id')
    .eq('iso_year', iso_year)
    .eq('iso_week', iso_week);

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

async function checkRealPerformance(staffId: string, now: Date): Promise<boolean> {
  const { iso_year, iso_week } = getCurrentISOWeek(now);
  const anchors = getWeekAnchors(now);

  // Get weekly focus for current week
  const { data: weeklyFocus } = await supabase
    .from('weekly_focus')
    .select('id')
    .eq('iso_year', iso_year)
    .eq('iso_week', iso_week);

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

// Compute the current week state (with simulation support)
export async function computeWeekState(staffId: string, now: Date = nowUtc(), simOverrides?: any): Promise<WeekContext> {
  const { iso_year, iso_week } = getCurrentISOWeek(now);
  const anchors = getWeekAnchors(now);
  
  const { hasValidConfidence, hasValidPerformance } = await hasValidScores(staffId, now, simOverrides);

  let state: WeekState;

  if (now < anchors.confidence_deadline) {
    // Before Tuesday 12:00 CT - can check in
    state = 'can_checkin';
  } else if (!hasValidConfidence) {
    // After Tuesday 12:00 CT with no confidence - missed checkin
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
