// DEPRECATED: This file is no longer the source of truth for week logic
// All week logic has been consolidated into src/lib/siteState.ts
// 
// This file is kept for backward compatibility but should not be used
// in new code. Use the following replacements:
//
// getUserCurrentWeek() -> getSiteWeekContext() from siteState.ts
// computeProgressWeekState() -> computeWeekState() from siteState.ts
// getWeekAssignments() -> assembleWeek() from siteState.ts

import { supabase } from "@/integrations/supabase/client";
import { getWeekAnchors, CT_TZ } from './centralTime';
import { SimOverrides } from '@/devtools/SimProvider';

export interface UserProgress {
  cycle: number;
  week_in_cycle: number;
  completed_backfill: boolean;
}

export interface WeekFocus {
  id: string;
  display_order: number;
  self_select: boolean;
  action_id: number | null;
  competency_id: number | null;
  domain_name: string;
  action_statement?: string;
}

export type WeekState = 'no_assignments' | 'missed_checkin' | 'can_checkin' | 'wait_for_thu' | 'can_checkout' | 'missed_checkout' | 'done';

export interface WeekContext {
  state: WeekState;
  cycle: number;
  week_in_cycle: number;
  anchors: ReturnType<typeof getWeekAnchors>;
  hasValidConfidence: boolean;
  hasValidPerformance: boolean;
}

/**
 * @deprecated Use getSiteWeekContext() from siteState.ts instead
 */
export async function getUserCurrentWeek(userId: string, simOverrides?: SimOverrides): Promise<UserProgress> {
  console.warn('getUserCurrentWeek is deprecated. Use getSiteWeekContext() from siteState.ts instead');
  
  // Fallback implementation for compatibility
  return {
    cycle: 1,
    week_in_cycle: 1,
    completed_backfill: true
  };
}

/**
 * @deprecated Use assembleWeek() from siteState.ts instead
 */
export async function getWeekAssignments(roleId: number, cycle: number, weekInCycle: number): Promise<WeekFocus[]> {
  console.warn('getWeekAssignments is deprecated. Use assembleWeek() from siteState.ts instead');
  return [];
}

/**
 * @deprecated Use computeWeekState() from siteState.ts instead
 */
export async function computeProgressWeekState(
  userId: string,
  now: Date,
  simOverrides?: SimOverrides
): Promise<WeekContext> {
  console.warn('computeProgressWeekState is deprecated. Use computeWeekState() from siteState.ts instead');
  
  // Fallback implementation
  const anchors = getWeekAnchors(now, CT_TZ);
  return {
    state: 'no_assignments',
    cycle: 1,
    week_in_cycle: 1,
    anchors,
    hasValidConfidence: false,
    hasValidPerformance: false
  };
}

// Re-export some helper functions that are still valid
export function getCurrentWeekTimeState(now: Date): ReturnType<typeof getWeekAnchors> {
  return getWeekAnchors(now, CT_TZ);
}