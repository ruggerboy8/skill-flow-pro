import { supabase } from "@/integrations/supabase/client";
import { getAnchors, nowUtc } from "@/lib/centralTime";
import { SimOverrides } from '@/devtools/SimProvider';

export interface BacklogItem {
  id: string;
  user_id: string;
  pro_move_id: number;
  added_week_id: string;
  status: 'open' | 'done';
  resolved_week_id?: string;
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

// Detect incomplete weeks where site moves weren't finished
export async function detectIncompleteWeeks(staffId: string): Promise<void> {
  try {
    // Get all weeks for this user's role where site moves exist but aren't completed
    const { data: staffData } = await supabase
      .from('staff')
      .select('role_id')
      .eq('id', staffId)
      .single();

    if (!staffData) return;

    // Find weeks with incomplete site moves (missing both confidence and performance)
    const { data: incompleteWeeks } = await supabase
      .from('weekly_focus')
      .select(`
        id,
        cycle,
        week_in_cycle,
        action_id,
        weekly_scores!left(confidence_score, performance_score)
      `)
      .eq('role_id', staffData.role_id)
      .eq('self_select', false) // Only site moves
      .not('action_id', 'is', null);

    if (!incompleteWeeks) return;

    for (const week of incompleteWeeks) {
      const scores = week.weekly_scores || [];
      const userScore = scores.find((s: any) => s);
      
      // If no scores at all, or incomplete scores, add to backlog
      if (!userScore || !userScore.confidence_score || !userScore.performance_score) {
        await addToBacklog(staffId, week.action_id, week.id);
      }
    }
  } catch (error) {
    console.error('Error detecting incomplete weeks:', error);
  }
}

// Add a pro move to the user's backlog
export async function addToBacklog(userId: string, proMoveId: number, weekId: string): Promise<void> {
  try {
    // Use upsert to avoid duplicates
    await supabase
      .from('user_backlog')
      .upsert({
        user_id: userId,
        pro_move_id: proMoveId,
        added_week_id: weekId,
        status: 'open'
      }, {
        onConflict: 'user_id,pro_move_id,status',
        ignoreDuplicates: true
      });
  } catch (error) {
    console.error('Error adding to backlog:', error);
  }
}

// Populate backlog for a specific missed week (current week assignments that weren't completed)
export async function populateBacklogForMissedWeek(
  userId: string,
  assignments: any[],
  weekContext: { weekInCycle: number; cycleNumber: number }
): Promise<void> {
  try {
    console.log('=== POPULATING BACKLOG FOR MISSED WEEK ===');
    console.log('User:', userId);
    console.log('Week context:', weekContext);
    console.log('Assignments:', assignments);

    // Only add site moves (not self-selects) to backlog
    const siteMoves = assignments.filter(a => a.type === 'site' && a.pro_move_id);
    
    console.log('Site moves to add to backlog:', siteMoves.length);

    for (const assignment of siteMoves) {
      await addToBacklog(userId, assignment.pro_move_id, assignment.weekly_focus_id);
      console.log(`Added pro move ${assignment.pro_move_id} to backlog for user ${userId}`);
    }
  } catch (error) {
    console.error('Error populating backlog for missed week:', error);
  }
}

// Check if backlog has already been populated for this week to avoid duplicates
export async function isBacklogPopulatedForWeek(
  userId: string, 
  weeklyFocusIds: string[]
): Promise<boolean> {
  try {
    if (weeklyFocusIds.length === 0) return false;
    
    const { data, error } = await supabase
      .from('user_backlog')
      .select('id')
      .eq('user_id', userId)
      .in('added_week_id', weeklyFocusIds)
      .limit(1);

    if (error) throw error;
    return (data?.length || 0) > 0;
  } catch (error) {
    console.error('Error checking if backlog populated for week:', error);
    return false; // Assume not populated on error to be safe
  }
}

// Get open backlog items for a user (FIFO order)
export async function getOpenBacklog(userId: string): Promise<BacklogItem[]> {
  try {
    const { data, error } = await supabase
      .from('user_backlog')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'open')
      .order('created_at', { ascending: true }); // FIFO

    if (error) throw error;
    return (data || []) as BacklogItem[];
  } catch (error) {
    console.error('Error fetching backlog:', error);
    return [];
  }
}

// Resolve a backlog item when the user completes it
export async function resolveBacklogItem(userId: string, proMoveId: number, resolvedWeekId: string): Promise<void> {
  try {
    await supabase
      .from('user_backlog')
      .update({
        status: 'done',
        resolved_week_id: resolvedWeekId
      })
      .eq('user_id', userId)
      .eq('pro_move_id', proMoveId)
      .eq('status', 'open');
  } catch (error) {
    console.error('Error resolving backlog item:', error);
  }
}

// Get open backlog count (with simulation override) - moved from weekValidationSim.ts
export async function getOpenBacklogCount(
  userId: string,
  simOverrides?: SimOverrides
): Promise<{ count: number; items: any[] }> {
  // If simulation is active and backlog count is forced
  if (simOverrides?.enabled && simOverrides.forceBacklogCount !== null) {
    const count = simOverrides.forceBacklogCount;
    // Generate synthetic backlog items for UI rendering
    const items = Array.from({ length: count }, (_, i) => ({
      id: `__sim_${i}`,
      __sim: true, // Mark as simulated
      pro_move_id: i + 1,
      status: 'open',
      action_statement: `Simulated Backlog Item ${i + 1}`,
    }));
    return { count, items };
  }

  // Otherwise, get real backlog data
  const { data: backlog } = await supabase
    .from('user_backlog')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'open');

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