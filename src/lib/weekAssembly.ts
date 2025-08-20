import { supabase } from "@/integrations/supabase/client";
import { getUserCurrentWeek, getWeekAssignments, WeekFocus } from './progressTracking';
import { getOpenBacklogCount } from './weekValidationSim';
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
 * Assemble a user's current week assignments using progress-based approach
 */
export async function assembleCurrentWeek(
  userId: string,
  simOverrides?: any
): Promise<WeekAssignment[]> {
  try {
    console.log('=== ASSEMBLING CURRENT WEEK (PROGRESS-BASED) ===');
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

    // Get user's current progress week (with simulation support)
    const userProgress = await getUserCurrentWeek(userId, simOverrides);
    console.log('User progress:', userProgress);

    // Get focus items for current week
    const weekFocus = await getWeekAssignments(staffData.role_id, userProgress.cycle, userProgress.week_in_cycle);
    console.log('Week focus items:', weekFocus.length, 'items found for Cycle', userProgress.cycle, 'Week', userProgress.week_in_cycle);

    if (weekFocus.length === 0) {
      console.log('No weekly focus found - returning empty assignments');
      return [];
    }

    const assignments: WeekAssignment[] = [];

    // Get user's backlog items (FIFO order) with simulation support
    const backlogResult = await getOpenBacklogCount(userId, simOverrides);
    const backlogItems = backlogResult.items;
    console.log('Backlog items:', backlogItems);

    // Get user's current selections for self-select slots (unless simulating empty state)
    const focusIds = weekFocus.map(f => f.id);
    const shouldIgnoreSelections = simOverrides?.enabled && simOverrides?.forceBacklogCount === 0;
    
    let userSelections = null;
    if (!shouldIgnoreSelections) {
      const { data } = await supabase
        .from('weekly_self_select')
        .select('weekly_focus_id, slot_index, selected_pro_move_id, source')
        .eq('user_id', userId)
        .in('weekly_focus_id', focusIds);
      userSelections = data;
    }

    const selectionMap = new Map();
    (userSelections || []).forEach((sel: any) => {
      selectionMap.set(sel.weekly_focus_id, sel);
    });

    let backlogIndex = 0;

    // Process each focus item
    for (const focus of weekFocus) {
      if (!focus.self_select) {
        // Site move - mandatory with predefined action
        assignments.push({
          weekly_focus_id: focus.id,
          type: 'site',
          pro_move_id: focus.action_id || undefined,
          action_statement: focus.action_statement || 'Site Move',
          domain_name: focus.domain_name,
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
            domain_name: focus.domain_name,
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
            domain_name: focus.domain_name,
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
            domain_name: focus.domain_name,
            required: false,
            locked: areSelectionsLocked(),
            display_order: focus.display_order
          });
        }
      }
    }

    // Sort by display order
    const sortedAssignments = assignments.sort((a, b) => a.display_order - b.display_order);
    console.log('Final assignments:', sortedAssignments);
    
    return sortedAssignments;

  } catch (error) {
    console.error('Error assembling current week:', error);
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