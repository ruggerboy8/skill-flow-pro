import { supabase } from "@/integrations/supabase/client";
import { assembleWeek as locationAssembleWeek } from './locationState';
import { getOpenBacklogCountV2, areSelectionsLocked, saveUserSelection } from './backlog';
import { nowUtc, getAnchors } from "./centralTime";

export interface WeekAssignment {
  weekly_focus_id: string;
  type: 'site' | 'backlog' | 'selfSelect';
  pro_move_id?: number;
  action_statement: string;
  domain_name: string;
  required: boolean;
  locked: boolean;
  backlog_id?: string;
  slot_index?: number;
  display_order: number;
}

/**
 * Finds a user's active week based on their scoring progress.
 */
async function findUserActiveWeek(
  userId: string,
  staffId: string,
  roleId: number,
  locationId: string,
  simOverrides?: any
): Promise<{ cycleNumber: number; weekInCycle: number }> {
  
  const { data: locationData } = await supabase
    .from('locations')
    .select('cycle_length_weeks')
    .eq('id', locationId)
    .single();

  if (!locationData) {
    throw new Error(`Location not found for locationId: ${locationId}`);
  }
  const cycleLength = locationData.cycle_length_weeks;

  // Find the most recent week the user has scores for
  const { data: lastScoredFocus } = await supabase
    .from('weekly_scores')
    .select('weekly_focus!inner(id, cycle, week_in_cycle)')
    .eq('staff_id', staffId)
    .order('weekly_focus(cycle)', { ascending: false })
    .order('weekly_focus(week_in_cycle)', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!lastScoredFocus || !lastScoredFocus.weekly_focus) {
    // No scores at all, brand new user. Start them at the beginning.
    return { cycleNumber: 1, weekInCycle: 1 };
  }

  const lastCycle = lastScoredFocus.weekly_focus.cycle;
  const lastWeekInCycle = lastScoredFocus.weekly_focus.week_in_cycle;

  // Now, check if that week is fully complete
  const assignmentsForLastWeek = await locationAssembleWeek({
    userId,
    roleId,
    locationId,
    cycleNumber: lastCycle,
    weekInCycle: lastWeekInCycle,
    simOverrides,
  });

  const { data: scoresForLastWeek } = await supabase
    .from('weekly_scores')
    .select('confidence_score, performance_score')
    .eq('staff_id', staffId)
    .in('weekly_focus_id', assignmentsForLastWeek.map(a => a.weekly_focus_id));

  const requiredCount = assignmentsForLastWeek.length;
  const confidenceCount = scoresForLastWeek?.filter(s => s.confidence_score !== null).length || 0;
  const performanceCount = scoresForLastWeek?.filter(s => s.performance_score !== null).length || 0;

  if (requiredCount > 0 && confidenceCount >= requiredCount && performanceCount >= requiredCount) {
    // Last scored week is complete, advance to the next week
    let nextCycle = lastCycle;
    let nextWeekInCycle = lastWeekInCycle + 1;
    if (nextWeekInCycle > cycleLength) {
      nextWeekInCycle = 1;
      nextCycle++;
    }
    return { cycleNumber: nextCycle, weekInCycle: nextWeekInCycle };
  } else {
    // Last scored week is incomplete, so that's the active week
    return { cycleNumber: lastCycle, weekInCycle: lastWeekInCycle };
  }
}

/**
 * Assemble a user's current week assignments based on their progress.
 */
export async function assembleCurrentWeek(
  userId: string,
  simOverrides?: any
): Promise<{
  assignments: WeekAssignment[];
  cycleNumber: number;
  weekInCycle: number;
}> {
  try {
    console.log('=== ASSEMBLING CURRENT WEEK (PROGRESS-BASED) ===');
    console.log('Input params:', { userId, simOverrides });
    
    // Get staff info including location
    const { data: staffData } = await supabase
      .from('staff')
      .select('id, role_id, primary_location_id')
      .eq('user_id', userId)
      .single();

    if (!staffData) {
      throw new Error('Staff record not found');
    }

    if (!staffData.primary_location_id) {
      throw new Error('Staff member has no assigned location');
    }

    console.log('Staff data:', staffData);

    // Determine user's active week based on their progress
    const { cycleNumber, weekInCycle } = await findUserActiveWeek(
      userId,
      staffData.id,
      staffData.role_id,
      staffData.primary_location_id,
      simOverrides
    );
    
    console.log('User-specific active week:', { cycleNumber, weekInCycle });

    // Use location-based assembly logic with the progress-based week
    const assignments = await locationAssembleWeek({
      userId,
      roleId: staffData.role_id,
      locationId: staffData.primary_location_id,
      cycleNumber: cycleNumber,
      weekInCycle: weekInCycle,
      simOverrides
    });

    console.log('Progress-based assignments:', assignments);
    
    return {
      assignments: assignments.sort((a, b) => a.display_order - b.display_order),
      cycleNumber,
      weekInCycle
    };

  } catch (error) {
    console.error('Error assembling current week:', error);
    return { assignments: [], cycleNumber: 1, weekInCycle: 1 };
  }
}

// Re-export functions from backlog.ts for compatibility
export { saveUserSelection, areSelectionsLocked } from './backlog';
