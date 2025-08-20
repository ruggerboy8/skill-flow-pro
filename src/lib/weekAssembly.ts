import { supabase } from "@/integrations/supabase/client";
import { getSiteWeekContext, assembleWeek as siteAssembleWeek } from './siteState';
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
 * Assemble a user's current week assignments using site-based approach (unified)
 */
export async function assembleCurrentWeek(
  userId: string,
  simOverrides?: any
): Promise<WeekAssignment[]> {
  try {
    console.log('=== ASSEMBLING CURRENT WEEK (SITE-BASED) ===');
    console.log('Input params:', { userId, simOverrides });
    
    // Get staff info
    const { data: staffData } = await supabase
      .from('staff')
      .select('id, role_id')
      .eq('user_id', userId)
      .single();

    if (!staffData) {
      throw new Error('Staff record not found');
    }

    console.log('Staff data:', staffData);

    // Use site-based approach (single source of truth)
    const siteId = 'main'; // Use the main site that exists in DB
    const siteAssignments = await siteAssembleWeek({
      userId,
      roleId: staffData.role_id,
      siteId,
      simOverrides
    });

    console.log('Site-based assignments:', siteAssignments);
    
    return siteAssignments.sort((a, b) => a.display_order - b.display_order);

  } catch (error) {
    console.error('Error assembling current week:', error);
    return [];
  }
}

// Re-export functions from backlog.ts for compatibility
export { saveUserSelection, areSelectionsLocked } from './backlog';