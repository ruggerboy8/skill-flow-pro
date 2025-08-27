import { supabase } from "@/integrations/supabase/client";
import { assembleWeek as locationAssembleWeek, getLocationWeekContext } from './locationState';
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
 * Finds a user's active week based on their scoring progress or simulation time.
 */
async function findUserActiveWeek(
  userId: string,
  staffId: string,
  roleId: number,
  locationId: string,
  simOverrides?: any,
  now?: Date
): Promise<{ cycleNumber: number; weekInCycle: number }> {
  
  // If simulation is active with a specific time, use time-based calculation
  if (simOverrides?.enabled && now) {
    console.log('Using time-based week calculation for simulation');
    const context = await getLocationWeekContext(locationId, now);
    
    return {
      cycleNumber: context.cycleNumber,
      weekInCycle: context.weekInCycle
    };
  }

  // Otherwise, use progress-based calculation (original logic)
  console.log('Using progress-based week calculation');
  
  const { data: locationData } = await supabase
    .from('locations')
    .select('cycle_length_weeks')
    .eq('id', locationId)
    .single();

  if (!locationData) {
    throw new Error(`Location not found for locationId: ${locationId}`);
  }
  const cycleLength = locationData.cycle_length_weeks;

  // Use the new RPC to get last progress week
  const { data, error } = await supabase.rpc('get_last_progress_week', { 
    p_staff_id: staffId 
  });
  
  if (error) {
    throw error;
  }

  let cycleNumber = data?.[0]?.last_cycle ?? 1;
  let weekInCycle = data?.[0]?.last_week ?? 1;
  const isComplete = !!data?.[0]?.is_complete;

  if (isComplete) {
    // Week is complete, advance to next week
    weekInCycle += 1;
    if (weekInCycle > cycleLength) {
      weekInCycle = 1;
      cycleNumber += 1;
    }
  }

  return { cycleNumber, weekInCycle };
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
    
    // Calculate effective time for simulation
    const effectiveNow = simOverrides?.enabled && simOverrides?.nowISO 
      ? new Date(simOverrides.nowISO)
      : new Date();
    
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
    console.log('Effective now:', effectiveNow);

    // Determine user's active week based on their progress or simulation time
    const { cycleNumber, weekInCycle } = await findUserActiveWeek(
      userId,
      staffData.id,
      staffData.role_id,
      staffData.primary_location_id,
      simOverrides,
      effectiveNow
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
