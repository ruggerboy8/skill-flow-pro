import { supabase } from "@/integrations/supabase/client";
import { getLocationWeekContext, assembleWeek as locationAssembleWeek } from './locationState';
import { getOpenBacklogCount, areSelectionsLocked, saveUserSelection } from './backlog';
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
 * Assemble a user's current week assignments using location-based approach (unified)
 */
export async function assembleCurrentWeek(
  userId: string,
  simOverrides?: any
): Promise<WeekAssignment[]> {
  try {
    console.log('=== ASSEMBLING CURRENT WEEK (LOCATION-BASED) ===');
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

    // Get location context
    const effectiveNow = simOverrides?.enabled && simOverrides.nowISO ? new Date(simOverrides.nowISO) : new Date();
    const locationContext = await getLocationWeekContext(staffData.primary_location_id, effectiveNow);
    
    console.log('Location context:', locationContext);

    // Use location-based approach
    const locationAssignments = await locationAssembleWeek({
      userId,
      roleId: staffData.role_id,
      locationId: staffData.primary_location_id,
      cycleNumber: locationContext.cycleNumber,
      weekInCycle: locationContext.weekInCycle,
      simOverrides
    });

    console.log('Location-based assignments:', locationAssignments);
    
    return locationAssignments.sort((a, b) => a.display_order - b.display_order);

  } catch (error) {
    console.error('Error assembling current week:', error);
    return [];
  }
}

// Re-export functions from backlog.ts for compatibility
export { saveUserSelection, areSelectionsLocked } from './backlog';