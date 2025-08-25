import { getWeekAnchors } from './centralTime';
import { supabase } from '@/integrations/supabase/client';
import { getOpenBacklogCountV2, populateBacklogV2ForMissedWeek } from './backlog';

export type WeekState = 'onboarding' | 'missed_checkin' | 'can_checkin' | 'wait_for_thu' | 'can_checkout' | 'done' | 'missed_checkout' | 'no_assignments';

export interface LocationWeekContext {
  weekInCycle: number;
  cycleNumber: number;
  anchors: ReturnType<typeof getWeekAnchors>;
  timezone: string;
  locationId: string;
  programStartDate: Date;
  cycleLength: number;
}

export interface StaffStatus {
  state: WeekState;
  nextAction?: string;
  deadlineAt?: Date;
  backlogCount: number;
  selectionPending: boolean;
  lastActivity?: { kind: 'confidence' | 'performance'; at: Date };
  onboardingWeeksLeft?: number;
}

/**
 * Get the current week context for a location
 */
export async function getLocationWeekContext(locationId: string, now: Date = new Date()): Promise<LocationWeekContext> {
  const { data: location } = await supabase
    .from('locations')
    .select('*')
    .eq('id', locationId)
    .maybeSingle();

  if (!location) {
    throw new Error(`Location not found: ${locationId}`);
  }

  const programStartDate = new Date(location.program_start_date);
  const cycleLength = location.cycle_length_weeks;
  
  // Calculate week index from program start
  const daysDiff = Math.floor((now.getTime() - programStartDate.getTime()) / (1000 * 60 * 60 * 24));
  const weekIndex = Math.floor(daysDiff / 7);
  
  // Calculate cycle number and week in cycle
  const cycleNumber = Math.max(1, Math.floor(weekIndex / cycleLength) + 1);
  const weekInCycle = Math.max(1, (weekIndex % cycleLength) + 1);
  
  // Get time anchors for this location's timezone
  const anchors = getWeekAnchors(now, location.timezone);

  return {
    weekInCycle,
    cycleNumber,
    anchors,
    timezone: location.timezone,
    locationId,
    programStartDate,
    cycleLength
  };
}

/**
 * Check if staff member is eligible for pro moves (past onboarding)
 */
export function isEligibleForProMoves(staff: { hire_date?: string | null; onboarding_weeks: number }, now: Date = new Date()): boolean {
  if (!staff.hire_date) return true; // Assume eligible if no hire date

  const hireDate = new Date(staff.hire_date);
  const participationStart = new Date(hireDate.getTime() + (staff.onboarding_weeks * 7 * 24 * 60 * 60 * 1000));
  return now >= participationStart;
}

/**
 * Get onboarding weeks remaining
 */
export function getOnboardingWeeksLeft(staff: { hire_date?: string | null; onboarding_weeks: number }, now: Date = new Date()): number {
  if (!staff.hire_date) return 0;

  const hireDate = new Date(staff.hire_date);
  const participationStart = new Date(hireDate.getTime() + (staff.onboarding_weeks * 7 * 24 * 60 * 60 * 1000));
  
  if (now >= participationStart) return 0;
  
  const weeksLeft = Math.ceil((participationStart.getTime() - now.getTime()) / (7 * 24 * 60 * 60 * 1000));
  return Math.max(0, weeksLeft);
}

/**
 * Assemble weekly assignments for a user based on location context
 */
export async function assembleWeek(params: {
  userId: string;
  roleId: number;
  locationId: string;
  cycleNumber: number;
  weekInCycle: number;
  simOverrides?: any;
}): Promise<any[]> {
  const { userId, roleId, locationId, cycleNumber, weekInCycle, simOverrides } = params;
  
  // Get staff information to get staff_id for backlog queries
  const { data: staff } = await supabase
    .from('staff')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();

  if (!staff) {
    throw new Error('Staff member not found');
  }
  
  // Fetch weekly focus for this role/cycle/week
  const { data: weeklyFocus } = await supabase
    .from('weekly_focus')
    .select('*')
    .eq('role_id', roleId)
    .eq('cycle', cycleNumber)
    .eq('week_in_cycle', weekInCycle)
    .order('display_order');

  if (!weeklyFocus || weeklyFocus.length === 0) {
    return [];
  }

  // Foundation rule: In Cycle 1, force site moves only (block self-select)
  const isFoundation = cycleNumber === 1;

  // Get user's self-selections (only if not in foundation)
  let selections: any[] = [];
  if (!isFoundation) {
    const { data: userSelections } = await supabase
      .from('weekly_self_select')
      .select('*')
      .eq('user_id', userId)
      .in('weekly_focus_id', weeklyFocus.map(w => w.id));
    selections = userSelections || [];
  }

  // Get user's backlog items (only if not in foundation) - use v2 table with staff_id
  let backlog: any[] = [];
  if (!isFoundation) {
    const { data: userBacklog } = await supabase
      .from('user_backlog_v2')
      .select(`
        *,
        pro_moves!inner(action_id, action_statement, competency_id)
      `)
      .eq('staff_id', staff.id)
      .is('resolved_on', null)  // Only unresolved items
      .order('assigned_on');     // FIFO order
    backlog = userBacklog || [];
  }

  const assignments: any[] = [];
  let backlogIndex = 0;

  // Process each weekly focus slot
  for (const focus of weeklyFocus) {
    if (focus.self_select && !isFoundation) {
      // Self-select slot in flexible cycles (≥2)
      const selection = selections.find(s => s.weekly_focus_id === focus.id);
      
      if (selection) {
        // User has made a selection
        const { data: selectedProMove } = await supabase
          .from('pro_moves')
          .select(`
            *,
            competencies(name, domain_id)
          `)
          .eq('action_id', selection.selected_pro_move_id)
          .maybeSingle();

        // Get domain for the competency
        const { data: domain } = await supabase
          .from('domains')
          .select('domain_name')
          .eq('domain_id', selectedProMove?.competencies?.domain_id)
          .maybeSingle();

        if (selectedProMove) {
          assignments.push({
            weekly_focus_id: focus.id,
            type: 'selfSelect',
            pro_move_id: selectedProMove.action_id,
            action_statement: selectedProMove.action_statement,
            competency_name: selectedProMove.competencies?.name || 'General',
            domain_name: domain?.domain_name || 'General',
            required: false,
            locked: false,
            display_order: focus.display_order
          });
        }
      } else {
        // No user selection - check if we can replace with backlog item
        let backlogReplacement = null;
        
        // Find oldest non-duplicate backlog item
        while (backlogIndex < backlog.length) {
          const backlogItem = backlog[backlogIndex];
          
          // Check if this backlog item would duplicate an already assigned move
          const isDuplicate = assignments.some(a => a.pro_move_id === backlogItem.action_id);
          
          if (!isDuplicate) {
            backlogReplacement = backlogItem;
            backlogIndex++; // Consume this backlog item
            break;
          }
          
          backlogIndex++; // Skip duplicate but don't consume
        }
        
        if (backlogReplacement) {
          // Replace self-select slot with backlog item (treat as locked site move)
          const { data: competency } = await supabase
            .from('competencies')
            .select('name, domain_id')
            .eq('competency_id', backlogReplacement.pro_moves.competency_id)
            .maybeSingle();

          let domainName = 'General';
          if (competency?.domain_id) {
            const { data: domain } = await supabase
              .from('domains')
              .select('domain_name')
              .eq('domain_id', competency.domain_id)
              .maybeSingle();
            domainName = domain?.domain_name || 'General';
          }

          assignments.push({
            weekly_focus_id: focus.id,
            type: 'site', // Treat backlog replacement as locked site move
            pro_move_id: backlogReplacement.action_id,
            action_statement: backlogReplacement.pro_moves.action_statement,
            competency_name: competency?.name || 'General',
            domain_name: domainName,
            required: true,
            locked: true, // Backlog replacements are locked (no dropdown)
            display_order: focus.display_order,
            from_backlog: true // Flag to identify backlog replacements
          });
        } else {
          // No backlog replacement available - show empty self-select slot
          let domainName = 'General';
          let competencyName = 'Select Competency';
          
          if (focus.competency_id) {
            const { data: competency } = await supabase
              .from('competencies')
              .select('name, domain_id')
              .eq('competency_id', focus.competency_id)
              .maybeSingle();

            if (competency) {
              competencyName = competency.name || 'Select Competency';
              
              if (competency.domain_id) {
                const { data: domain } = await supabase
                  .from('domains')
                  .select('domain_name')
                  .eq('domain_id', competency.domain_id)
                  .maybeSingle();
                
                domainName = domain?.domain_name || 'General';
              }
            }
          }

          assignments.push({
            weekly_focus_id: focus.id,
            type: 'selfSelect',
            action_statement: 'Choose a pro-move',
            competency_name: competencyName,
            domain_name: domainName,
            required: false,
            locked: false,
            display_order: focus.display_order
          });
        }
      }
    } else {
      // Site move (or self-select slot in foundation - treat as site move)
      if (focus.action_id) {
        const { data: siteProMove } = await supabase
          .from('pro_moves')
          .select(`
            *,
            competencies(name, domain_id)
          `)
          .eq('action_id', focus.action_id)
          .maybeSingle();

        // Get domain for the competency
        const { data: domain } = await supabase
          .from('domains')
          .select('domain_name')
          .eq('domain_id', siteProMove?.competencies?.domain_id)
          .maybeSingle();

        assignments.push({
          weekly_focus_id: focus.id,
          type: 'site',
          pro_move_id: siteProMove?.action_id,
          action_statement: siteProMove?.action_statement || 'Site move',
          competency_name: siteProMove?.competencies?.name || 'General',
          domain_name: domain?.domain_name || 'General',
          required: true,
          locked: true,
          display_order: focus.display_order
        });
      }
    }
  }

  return assignments.sort((a, b) => a.display_order - b.display_order);
}

/**
 * Compute comprehensive week state for staff member using location context
 */
export async function computeWeekState(params: {
  userId: string;
  locationId: string;
  roleId?: number;
  now?: Date;
  simOverrides?: any;
  weekContext?: { cycleNumber: number; weekInCycle: number };
}): Promise<StaffStatus> {
  const { userId, locationId, now = new Date(), simOverrides, weekContext } = params;

  // Get staff information
  const { data: staff } = await supabase
    .from('staff')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (!staff) {
    throw new Error('Staff member not found');
  }

  const roleId = params.roleId || staff.role_id;

  // Check eligibility (onboarding status)
  if (!isEligibleForProMoves(staff, now)) {
    const weeksLeft = getOnboardingWeeksLeft(staff, now);
    return {
      state: 'onboarding',
      nextAction: `Complete onboarding`,
      backlogCount: 0,
      selectionPending: false,
      onboardingWeeksLeft: weeksLeft
    };
  }

  // Use provided week context or calculate from time
  const { cycleNumber, weekInCycle } = weekContext || await getLocationWeekContext(locationId, now);
  const { anchors } = await getLocationWeekContext(locationId, now);

  // Get weekly assignments
  const assignments = await assembleWeek({ 
    userId, 
    roleId, 
    locationId, 
    cycleNumber, 
    weekInCycle, 
    simOverrides 
  });

  if (assignments.length === 0) {
    return {
      state: 'no_assignments',
      nextAction: undefined,
      backlogCount: 0,
      selectionPending: false
    };
  }

  // Get current week's scores within time windows (for completion status)
  const { data: scores } = await supabase
    .from('weekly_scores')
    .select(`
      *,
      weekly_focus!inner(cycle, week_in_cycle)
    `)
    .eq('staff_id', staff.id)
    .eq('weekly_focus.cycle', cycleNumber)
    .eq('weekly_focus.week_in_cycle', weekInCycle);

  // Advisory: completion = "is there a score?", regardless of timestamp
  const requiredCount = assignments.length;
  const confFilled = (scores || []).filter(s => s.confidence_score !== null).length;
  const perfFilled = (scores || []).filter(s => s.performance_score !== null).length;
  
  // Apply simulation overrides for confidence/performance status
  let hasConfidence = confFilled >= requiredCount;
  let hasPerformance = perfFilled >= requiredCount;
  
  if (simOverrides?.enabled) {
    if (simOverrides.forceHasConfidence !== null && simOverrides.forceHasConfidence !== undefined) {
      hasConfidence = simOverrides.forceHasConfidence;
    }
    if (simOverrides.forceHasPerformance !== null && simOverrides.forceHasPerformance !== undefined) {
      hasPerformance = simOverrides.forceHasPerformance;
    }
  }

  // Get backlog count with simulation support
  const backlogResult = await getOpenBacklogCountV2(staff.id, simOverrides);
  const backlogCount = backlogResult.count;

  // Check for selection pending
  const selectionPending = assignments.some(a => a.type === 'selfSelect' && !a.pro_move_id);

  // Get last activity (ALL historical activity, not just current week)
  const { data: allScores } = await supabase
    .from('weekly_scores')
    .select('confidence_date, performance_date, updated_at')
    .eq('staff_id', staff.id)
    .or('confidence_date.not.is.null,performance_date.not.is.null')
    .order('updated_at', { ascending: false })
    .limit(50); // Get recent activity

  let lastActivity: { kind: 'confidence' | 'performance'; at: Date } | undefined;
  
  if (allScores && allScores.length > 0) {
    // Find the most recent activity by comparing all confidence and performance dates
    let latestDate: Date | null = null;
    let latestKind: 'confidence' | 'performance' | null = null;
    
    for (const score of allScores) {
      if (score.confidence_date) {
        const confDate = new Date(score.confidence_date);
        if (!latestDate || confDate > latestDate) {
          latestDate = confDate;
          latestKind = 'confidence';
        }
      }
      if (score.performance_date) {
        const perfDate = new Date(score.performance_date);
        if (!latestDate || perfDate > latestDate) {
          latestDate = perfDate;
          latestKind = 'performance';
        }
      }
    }
    
    if (latestDate && latestKind) {
      lastActivity = { kind: latestKind, at: latestDate };
    }
  }

  // Determine state and next action (advisory gating)
  if (now > anchors.confidence_deadline && !hasConfidence) {
    // Auto-populate backlog v2 when check-in is missed
    try {
      await populateBacklogV2ForMissedWeek(staff.id, assignments, { weekInCycle, cycleNumber });
    } catch (e) {
      console.warn('Backlog v2 population failed (non-fatal):', e);
    }
    
    return {
      state: 'missed_checkin',
      nextAction: 'Overdue',
      deadlineAt: anchors.confidence_deadline,
      backlogCount,
      selectionPending,
      lastActivity
    };
  }

  if (!hasConfidence) {
    return {
      state: 'can_checkin',
      nextAction: 'Confidence',
      deadlineAt: anchors.confidence_deadline,
      backlogCount,
      selectionPending,
      lastActivity
    };
  }

  if (hasConfidence && !hasPerformance) {
    if (now > anchors.performance_deadline) {
      return {
        state: 'missed_checkout',
        nextAction: 'Overdue',
        deadlineAt: anchors.performance_deadline,
        backlogCount,
        selectionPending,
        lastActivity
      };
    } else if (now < anchors.checkout_open) {
      // Confidence submitted but performance not yet available
      return {
        state: 'wait_for_thu',
        nextAction: 'Performance',
        deadlineAt: anchors.checkout_open,
        backlogCount,
        selectionPending,
        lastActivity
      };
    } else {
      return {
        state: 'can_checkout',
        nextAction: 'Performance',
        deadlineAt: anchors.performance_deadline,
        backlogCount,
        selectionPending,
        lastActivity
      };
    }
  }

  if (hasConfidence && hasPerformance) {
    return {
      state: 'done',
      nextAction: undefined,
      backlogCount,
      selectionPending,
      lastActivity
    };
  }

  // Fallback
  return {
    state: 'no_assignments',
    nextAction: undefined,
    backlogCount,
    selectionPending,
    lastActivity
  };
}