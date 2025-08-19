import { supabase } from "@/integrations/supabase/client";
import { getAnchors, nowUtc } from "@/lib/centralTime";
import { getCurrentISOWeek } from './weekValidation';

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

// Assemble a week's assignments (site moves + backlog + self-select)
export async function assembleWeek(userId: string, isoYear: number, isoWeek: number, roleId: number): Promise<WeekAssignment[]> {
  try {
    const assignments: WeekAssignment[] = [];

    // 1. Get all weekly focus items for the current ISO week
    const { data: weeklyFocus, error: focusError } = await supabase
      .from('weekly_focus')
      .select(`
        id,
        display_order,
        self_select,
        action_id,
        competency_id,
        competencies!inner(
          domain_id,
          domains!inner(domain_name)
        )
      `)
      .eq('iso_year', isoYear)
      .eq('iso_week', isoWeek)
      .eq('role_id', roleId)
      .order('display_order');

    if (focusError) throw focusError;
    if (!weeklyFocus) return [];

    // 2. Get user's backlog items (FIFO order)
    const backlogItems = await getOpenBacklog(userId);

    // 3. Get user's current selections for self-select slots
    const focusIds = weeklyFocus.map((f: any) => f.id);
    const { data: userSelections } = await supabase
      .from('weekly_self_select')
      .select('weekly_focus_id, slot_index, selected_pro_move_id, source')
      .eq('user_id', userId)
      .in('weekly_focus_id', focusIds);

    const selectionMap = new Map();
    (userSelections || []).forEach((sel: any) => {
      selectionMap.set(sel.weekly_focus_id, sel);
    });

    let backlogIndex = 0;

    // 4. Process each focus item
    for (const focus of weeklyFocus as any[]) {
      const domainName = focus.competencies?.domains?.domain_name || 'Unknown';

      if (!focus.self_select) {
        // Site move - mandatory with predefined action
        const { data: proMoveData } = await supabase
          .from('pro_moves')
          .select('action_statement')
          .eq('action_id', focus.action_id)
          .single();

        assignments.push({
          weekly_focus_id: focus.id,
          type: 'site',
          pro_move_id: focus.action_id,
          action_statement: proMoveData?.action_statement || 'Site Move',
          domain_name: domainName,
          required: true,
          locked: true,
          display_order: focus.display_order
        });
      } else {
        // Self-select slot
        const selection = selectionMap.get(focus.id);
        
        if (selection) {
          // User has made a selection
          const { data: proMoveData } = await supabase
            .from('pro_moves')
            .select('action_statement')
            .eq('action_id', selection.selected_pro_move_id)
            .single();

          assignments.push({
            weekly_focus_id: focus.id,
            type: selection.source === 'backlog' ? 'backlog' : 'selfSelect',
            pro_move_id: selection.selected_pro_move_id,
            action_statement: proMoveData?.action_statement || 'Selected Move',
            domain_name: domainName,
            required: false,
            locked: areSelectionsLocked(),
            slot_index: selection.slot_index,
            display_order: focus.display_order
          });
        } else if (backlogIndex < backlogItems.length) {
          // Auto-assign from backlog
          const backlogItem = backlogItems[backlogIndex++];
          const { data: proMoveData } = await supabase
            .from('pro_moves')
            .select('action_statement')
            .eq('action_id', backlogItem.pro_move_id)
            .single();

          // Save the auto-assignment
          await saveUserSelection(userId, focus.id, 0, backlogItem.pro_move_id, 'backlog');

          assignments.push({
            weekly_focus_id: focus.id,
            type: 'backlog',
            pro_move_id: backlogItem.pro_move_id,
            action_statement: proMoveData?.action_statement || 'Backlog Item',
            domain_name: domainName,
            required: false,
            locked: areSelectionsLocked(),
            backlog_id: backlogItem.id,
            slot_index: 0,
            display_order: focus.display_order
          });
        } else {
          // Empty self-select slot
          assignments.push({
            weekly_focus_id: focus.id,
            type: 'selfSelect',
            action_statement: '', // Empty - user needs to choose
            domain_name: domainName,
            required: false,
            locked: areSelectionsLocked(),
            display_order: focus.display_order
          });
        }
      }
    }

    // Sort by display order
    return assignments.sort((a, b) => a.display_order - b.display_order);

  } catch (error) {
    console.error('Error assembling week:', error);
    return [];
  }
}

// Get user's current selections for choosable self-select slots
export async function getUserSelections(userId: string, weeklyFocusIds: string[]): Promise<any[]> {
  try {
    const { data, error } = await supabase
      .from('weekly_self_select')
      .select('*')
      .eq('user_id', userId)
      .in('weekly_focus_id', weeklyFocusIds);

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching user selections:', error);
    return [];
  }
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