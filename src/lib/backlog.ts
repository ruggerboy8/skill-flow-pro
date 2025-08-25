import { supabase } from "@/integrations/supabase/client";
import { getAnchors, nowUtc } from "@/lib/centralTime";
import { SimOverrides } from '@/devtools/SimProvider';

// Updated backlog interfaces for v2
export interface BacklogItemV2 {
  id: string;
  staff_id: string;
  action_id: number;
  source_cycle?: number;
  source_week?: number;
  assigned_on: string;
  resolved_on?: string | null;
  created_at: string;
}

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

// Add a site move to backlog v2 using RPC
export async function addToBacklogV2(
  staffId: string, 
  actionId: number, 
  sourceCycle: number, 
  sourceWeek: number
): Promise<void> {
  try {
    await supabase.rpc('add_backlog_if_missing', {
      p_staff_id: staffId,
      p_action_id: actionId,
      p_cycle: sourceCycle,
      p_week: sourceWeek
    });
  } catch (error) {
    console.error('Error adding to backlog v2:', error);
  }
}

// Resolve a backlog item using RPC
export async function resolveBacklogItemV2(
  staffId: string, 
  actionId: number
): Promise<void> {
  try {
    await supabase.rpc('resolve_backlog_item', {
      p_staff_id: staffId,
      p_action_id: actionId
    });
  } catch (error) {
    console.error('Error resolving backlog item v2:', error);
  }
}

// Get open backlog items v2 for a staff member (FIFO order)
export async function getOpenBacklogV2(staffId: string): Promise<BacklogItemV2[]> {
  try {
    const { data, error } = await supabase
      .from('user_backlog_v2')
      .select('*')
      .eq('staff_id', staffId)
      .is('resolved_on', null)
      .order('assigned_on', { ascending: true }); // FIFO

    if (error) throw error;
    return (data || []) as BacklogItemV2[];
  } catch (error) {
    console.error('Error fetching backlog v2:', error);
    return [];
  }
}

// Populate backlog v2 for a missed week (confidence not submitted by Tue noon)
export async function populateBacklogV2ForMissedWeek(
  staffId: string,
  assignments: any[],
  weekContext: { weekInCycle: number; cycleNumber: number }
): Promise<void> {
  try {
    console.log('=== POPULATING BACKLOG V2 FOR MISSED WEEK ===');
    console.log('Staff:', staffId);
    console.log('Week context:', weekContext);
    console.log('Assignments:', assignments);

    // Only add site moves (not self-selects) to backlog
    const siteMoves = assignments.filter(a => a.type === 'site' && a.pro_move_id);
    
    console.log('Site moves to add to backlog v2:', siteMoves.length);

    for (const assignment of siteMoves) {
      await addToBacklogV2(
        staffId, 
        assignment.pro_move_id, 
        weekContext.cycleNumber, 
        weekContext.weekInCycle
      );
      console.log(`Added action ${assignment.pro_move_id} to backlog v2 for staff ${staffId}`);
    }
  } catch (error) {
    console.error('Error populating backlog v2 for missed week:', error);
  }
}

// Get open backlog count v2 (with simulation override)
export async function getOpenBacklogCountV2(
  staffId: string,
  simOverrides?: SimOverrides
): Promise<{ count: number; items: any[] }> {
  // If simulation is active and backlog count is forced
  if (simOverrides?.enabled && simOverrides.forceBacklogCount !== null) {
    const count = simOverrides.forceBacklogCount;
    // Generate synthetic backlog items for UI rendering
    const items = Array.from({ length: count }, (_, i) => ({
      id: `__sim_${i}`,
      __sim: true, // Mark as simulated
      action_id: i + 1,
      resolved_on: null,
      action_statement: `Simulated Backlog Item ${i + 1}`,
    }));
    return { count, items };
  }

  // Otherwise, get real backlog data from v2
  const { data: backlog } = await supabase
    .from('user_backlog_v2')
    .select('*')
    .eq('staff_id', staffId)
    .is('resolved_on', null);

  return { count: backlog?.length || 0, items: backlog || [] };
}

// Save user's selection for a self-select slot  
export async function saveUserSelection(
  userId: string, 
  weeklyFocusId: string, 
  slotIndex: number, 
  selectedProMoveId: number,
  source: 'manual' | 'backlog' = 'manual'
): Promise<void> {
  try {
    await supabase
      .from('weekly_self_select')
      .upsert({
        user_id: userId,
        weekly_focus_id: weeklyFocusId,
        slot_index: slotIndex,
        selected_pro_move_id: selectedProMoveId,
        source: source
      }, {
        onConflict: 'user_id,weekly_focus_id,slot_index'
      });
  } catch (error) {
    console.error('Error saving user selection:', error);
  }
}

// Check if selections are allowed based on time locks
export function areSelectionsLocked(): boolean {
  const now = nowUtc();
  const { tueDueZ } = getAnchors(now);
  return now > tueDueZ; // Locked after Tuesday 12:00 CT
}