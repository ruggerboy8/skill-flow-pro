import { formatInTimeZone } from 'date-fns-tz';
import { getWeekAnchors, CT_TZ, nowUtc } from './centralTime';
import { supabase } from '@/integrations/supabase/client';

export type WeekState = 'missed_checkin' | 'can_checkin' | 'can_checkout' | 'wait_for_thu' | 'done';

export interface WeekContext {
  state: WeekState;
  iso_year: number;
  iso_week: number;
  anchors: ReturnType<typeof getWeekAnchors>;
  hasValidConfidence: boolean;
  hasValidPerformance: boolean;
}

// Get current ISO week info
export function getCurrentISOWeek(now: Date = nowUtc()) {
  const iso_year = Number(formatInTimeZone(now, CT_TZ, 'yyyy'));
  const iso_week = Number(formatInTimeZone(now, CT_TZ, 'I'));
  return { iso_year, iso_week };
}

// Check if scores were submitted within valid time windows for current week
export async function hasValidScores(staffId: string, now: Date = nowUtc()) {
  const { iso_year, iso_week } = getCurrentISOWeek(now);
  const anchors = getWeekAnchors(now);

  // Get all focus items for current week
  const { data: focusData } = await supabase
    .from('weekly_focus')
    .select('id')
    .eq('iso_year', iso_year)
    .eq('iso_week', iso_week);

  if (!focusData || focusData.length === 0) {
    return { hasValidConfidence: false, hasValidPerformance: false, totalFocus: 0 };
  }

  const focusIds = focusData.map(f => f.id);

  // Get scores submitted within valid time windows
  const { data: scores } = await supabase
    .from('weekly_scores')
    .select('confidence_score, confidence_date, performance_score, performance_date')
    .eq('staff_id', staffId)
    .in('weekly_focus_id', focusIds);

  const validConfidenceCount = (scores || []).filter(score => 
    score.confidence_score !== null && 
    score.confidence_date && 
    new Date(score.confidence_date) >= anchors.checkin_open &&
    new Date(score.confidence_date) <= anchors.confidence_deadline
  ).length;

  const validPerformanceCount = (scores || []).filter(score => 
    score.performance_score !== null && 
    score.performance_date && 
    new Date(score.performance_date) >= anchors.checkout_open &&
    new Date(score.performance_date) <= anchors.performance_deadline
  ).length;

  return {
    hasValidConfidence: validConfidenceCount === focusData.length,
    hasValidPerformance: validPerformanceCount === focusData.length,
    totalFocus: focusData.length
  };
}

// Compute current week state based on time and valid submissions
export async function computeWeekState(staffId: string, now: Date = nowUtc()): Promise<WeekContext> {
  const { iso_year, iso_week } = getCurrentISOWeek(now);
  const anchors = getWeekAnchors(now);
  const { hasValidConfidence, hasValidPerformance } = await hasValidScores(staffId, now);

  let state: WeekState;

  if (now > anchors.confidence_deadline && !hasValidConfidence) {
    state = 'missed_checkin';
  } else if (!hasValidConfidence) {
    state = 'can_checkin';
  } else if (hasValidConfidence && now >= anchors.checkout_open && !hasValidPerformance) {
    state = 'can_checkout';
  } else if (hasValidConfidence && !hasValidPerformance && now < anchors.checkout_open) {
    state = 'wait_for_thu';
  } else {
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