// PARTIALLY DEPRECATED: Most functions moved to other modules
// 
// getOpenBacklogCount() -> MOVED to src/lib/backlog.ts
// Week validation functions -> MOVED to src/lib/siteState.ts
//
// This file now only contains ISO week utilities that may still be needed
// for legacy data or specific ISO-based calculations.

import { getWeekAnchors, CT_TZ } from './centralTime';
import { supabase } from '@/integrations/supabase/client';
import { SimOverrides } from '@/devtools/SimProvider';

export type WeekState = 'no_assignments' | 'missed_checkin' | 'can_checkin' | 'wait_for_thu' | 'can_checkout' | 'missed_checkout' | 'done';

export interface WeekContext {
  state: WeekState;
  iso_year: number;
  iso_week: number;
  anchors: ReturnType<typeof getWeekAnchors>;
  hasValidConfidence: boolean;
  hasValidPerformance: boolean;
}

// Get current ISO week and year (for legacy ISO-based calculations only)
export function getCurrentISOWeek(now: Date): { iso_year: number; iso_week: number } {
  const tempDate = new Date(now.getTime());
  tempDate.setUTCDate(tempDate.getUTCDate() + 4 - (tempDate.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(tempDate.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((tempDate.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return { iso_year: tempDate.getUTCFullYear(), iso_week: weekNo };
}

/**
 * @deprecated Use getOpenBacklogCount() from backlog.ts instead
 */
export async function getOpenBacklogCount(
  userId: string,
  simOverrides?: SimOverrides
): Promise<{ count: number; items: any[] }> {
  console.warn('getOpenBacklogCount from weekValidationSim.ts is deprecated. Use backlog.ts instead');
  
  // Re-export from backlog.ts for compatibility
  const { getOpenBacklogCountV2: getBacklogCount } = await import('./backlog');
  return getBacklogCount(userId, simOverrides);
}

/**
 * @deprecated Use computeWeekState() from siteState.ts instead
 */
export async function computeWeekState(
  staffId: string, 
  now: Date, 
  simOverrides?: SimOverrides
): Promise<WeekContext> {
  console.warn('computeWeekState from weekValidationSim.ts is deprecated. Use siteState.ts instead');
  
  const { iso_year, iso_week } = getCurrentISOWeek(now);
  const anchors = getWeekAnchors(now, CT_TZ);
  
  return {
    state: 'no_assignments',
    iso_year,
    iso_week,
    anchors,
    hasValidConfidence: false,
    hasValidPerformance: false
  };
}