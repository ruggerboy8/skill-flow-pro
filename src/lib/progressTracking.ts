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

export type WeekState = 'missed_checkin' | 'can_checkin' | 'can_checkout' | 'wait_for_thu' | 'done';

export interface WeekContext {
  state: WeekState;
  cycle: number;
  week_in_cycle: number;
  anchors: ReturnType<typeof getWeekAnchors>;
  hasValidConfidence: boolean;
  hasValidPerformance: boolean;
}

/**
 * Determines what cycle/week the user should currently be on based on their progress
 */
export async function getUserCurrentWeek(userId: string): Promise<UserProgress> {
  // Get staff info
  const { data: staffData } = await supabase
    .from('staff')
    .select('id, role_id')
    .eq('user_id', userId)
    .single();

  if (!staffData) {
    throw new Error('Staff record not found');
  }

  // Check if user has completed backfill (has any weekly_scores)
  const { data: hasScores } = await supabase
    .from('weekly_scores')
    .select('id')
    .eq('staff_id', staffData.id)
    .limit(1);

  const completed_backfill = hasScores && hasScores.length > 0;

  if (completed_backfill) {
    // Post-backfill: User should be on Cycle 2, Week 1
    return {
      cycle: 2,
      week_in_cycle: 1,
      completed_backfill: true
    };
  } else {
    // Pre-backfill: User should be on Cycle 1, Week 1
    return {
      cycle: 1,
      week_in_cycle: 1,
      completed_backfill: false
    };
  }
}

/**
 * Gets the focus items for a specific cycle/week combination
 */
export async function getWeekAssignments(roleId: number, cycle: number, weekInCycle: number): Promise<WeekFocus[]> {
  // Fix the database relationship error by using explicit relationship syntax
  const { data: weeklyFocus, error } = await supabase
    .from('weekly_focus')
    .select(`
      id,
      display_order,
      self_select,
      action_id,
      competency_id,
      competencies!inner(
        domain_id,
        domains!competencies_domain_id_fkey(domain_name)
      )
    `)
    .eq('cycle', cycle)
    .eq('week_in_cycle', weekInCycle)
    .eq('role_id', roleId)
    .order('display_order');

  if (error) {
    console.error('Database query error:', error);
    throw error;
  }

  if (!weeklyFocus || weeklyFocus.length === 0) {
    return [];
  }

  // Transform the data and get action statements for site moves
  const result: WeekFocus[] = [];
  
  for (const focus of weeklyFocus) {
    const domainName = focus.competencies?.domains?.domain_name || 'Unknown';
    
    let actionStatement = undefined;
    if (focus.action_id && !focus.self_select) {
      // Get the action statement for site moves
      const { data: proMoveData } = await supabase
        .from('pro_moves')
        .select('action_statement')
        .eq('action_id', focus.action_id)
        .single();
      
      actionStatement = proMoveData?.action_statement;
    }

    result.push({
      id: focus.id,
      display_order: focus.display_order,
      self_select: focus.self_select,
      action_id: focus.action_id,
      competency_id: focus.competency_id,
      domain_name: domainName,
      action_statement: actionStatement
    });
  }

  return result;
}

/**
 * Gets the current time-based state rules (independent of which week the user is on)
 */
export function getCurrentWeekTimeState(now: Date): ReturnType<typeof getWeekAnchors> {
  return getWeekAnchors(now, CT_TZ);
}

/**
 * Check if user has valid confidence scores for their current week
 */
export async function hasValidConfidence(
  staffId: string,
  weekFocusIds: string[],
  anchors: ReturnType<typeof getWeekAnchors>,
  simOverrides?: SimOverrides
): Promise<boolean> {
  // If simulation is active, check overrides first
  if (simOverrides?.enabled && simOverrides.forceHasConfidence !== null) {
    return simOverrides.forceHasConfidence;
  }

  if (weekFocusIds.length === 0) return false;

  // Check if all focus items have confidence scores submitted within the confidence window
  const { data: scores } = await supabase
    .from('weekly_scores')
    .select('confidence_score, confidence_date')
    .eq('staff_id', staffId)
    .in('weekly_focus_id', weekFocusIds)
    .not('confidence_score', 'is', null)
    .gte('confidence_date', anchors.checkin_open.toISOString())
    .lte('confidence_date', anchors.confidence_deadline.toISOString());

  return (scores?.length || 0) === weekFocusIds.length;
}

/**
 * Check if user has valid performance scores for their current week
 */
export async function hasValidPerformance(
  staffId: string,
  weekFocusIds: string[],
  anchors: ReturnType<typeof getWeekAnchors>,
  simOverrides?: SimOverrides
): Promise<boolean> {
  // If simulation is active, check overrides first
  if (simOverrides?.enabled && simOverrides.forceHasPerformance !== null) {
    return simOverrides.forceHasPerformance;
  }

  if (weekFocusIds.length === 0) return false;

  // Check if all focus items have performance scores submitted within the performance window  
  const { data: scores } = await supabase
    .from('weekly_scores')
    .select('performance_score, performance_date')
    .eq('staff_id', staffId)
    .in('weekly_focus_id', weekFocusIds)
    .not('performance_score', 'is', null)
    .gte('performance_date', anchors.checkout_open.toISOString())
    .lte('performance_date', anchors.performance_deadline.toISOString());

  return (scores?.length || 0) === weekFocusIds.length;
}

/**
 * Compute the current week state using progress-based approach
 */
export async function computeProgressWeekState(
  userId: string,
  now: Date,
  simOverrides?: SimOverrides
): Promise<WeekContext> {
  // Get staff info
  const { data: staffData } = await supabase
    .from('staff')
    .select('id, role_id')
    .eq('user_id', userId)
    .single();

  if (!staffData) {
    throw new Error('Staff record not found');
  }

  // Get user's current progress week
  const userProgress = await getUserCurrentWeek(userId);
  
  // Get focus items for current week
  const weekFocus = await getWeekAssignments(staffData.role_id, userProgress.cycle, userProgress.week_in_cycle);
  const focusIds = weekFocus.map(f => f.id);
  
  // Get time-based rules
  const anchors = getCurrentWeekTimeState(now);
  
  // Check validation status with simulation support
  const validConfidence = await hasValidConfidence(staffData.id, focusIds, anchors, simOverrides);
  const validPerformance = await hasValidPerformance(staffData.id, focusIds, anchors, simOverrides);

  // State machine logic based on time and submissions
  let state: WeekState;
  
  if (now < anchors.confidence_deadline) {
    // Before Tuesday 12:00 - can check in
    state = 'can_checkin';
  } else if (!validConfidence) {
    // After Tuesday 12:00 with no confidence - missed checkin
    state = 'missed_checkin';
  } else if (now < anchors.checkout_open) {
    // Wednesday - wait for Thursday
    state = 'wait_for_thu';
  } else if (now <= anchors.performance_deadline && !validPerformance) {
    // Thursday until end - can checkout
    state = 'can_checkout';
  } else {
    // Week complete
    state = 'done';
  }

  return {
    state,
    cycle: userProgress.cycle,
    week_in_cycle: userProgress.week_in_cycle,
    anchors,
    hasValidConfidence: validConfidence,
    hasValidPerformance: validPerformance
  };
}