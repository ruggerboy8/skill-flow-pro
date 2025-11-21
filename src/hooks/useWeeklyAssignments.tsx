import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useWeeklyAssignmentsV2Enabled } from '@/lib/featureFlags';

export interface WeeklyAssignment {
  id: string;
  action_id: number | null;
  display_order: number;
  self_select: boolean;
  competency_id?: number;
  competency_name?: string;
  domain_name?: string;
  action_statement: string;
}

interface UseWeeklyAssignmentsParams {
  roleId: number | null | undefined;
  cycle?: number;        // If not provided, uses current week
  weekInCycle?: number;  // If not provided, uses current week
  enabled?: boolean;     // Allow caller to control query execution
}

/**
 * Fetches weekly assignments from weekly_plan (for Cycle 4+) or weekly_focus (for Cycle 1-3).
 * Automatically falls back to weekly_focus if no weekly_plan data exists.
 * 
 * @param roleId - The role ID to fetch assignments for
 * @param cycle - Optional cycle number (defaults to current week via weekly_plan)
 * @param weekInCycle - Optional week in cycle (for weekly_focus fallback)
 * @param enabled - Whether the query should run
 */
export function useWeeklyAssignments({
  roleId,
  cycle,
  weekInCycle,
  enabled = true,
}: UseWeeklyAssignmentsParams) {
  const v2Enabled = useWeeklyAssignmentsV2Enabled;

  return useQuery({
    queryKey: ['weekly-assignments', roleId, cycle, weekInCycle, v2Enabled],
    queryFn: async () => {
      if (!roleId) {
        throw new Error('Role ID is required');
      }

      // ========== PHASE 2: DUAL-READ PATH ==========
      if (v2Enabled) {
        console.log('🚀 [useWeeklyAssignments] Using weekly_assignments V2 (feature flag ON)');
        
        // Calculate current Monday for week_start_date query
        const now = new Date();
        const dayOfWeek = now.getDay();
        const daysToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
        const thisMonday = new Date(now);
        thisMonday.setDate(now.getDate() + daysToMonday);
        thisMonday.setHours(0, 0, 0, 0);
        const mondayStr = thisMonday.toISOString().split('T')[0];

        const { data: assignmentsData, error: assignmentsError } = await supabase
          .from('weekly_assignments')
          .select(`
            id,
            action_id,
            display_order,
            self_select,
            competency_id,
            source,
            pro_moves!weekly_assignments_action_id_fkey (
              action_id,
              action_statement,
              competency_id,
              competencies!pro_moves_competency_id_fkey (
                competency_id,
                name,
                domain_id,
                domains!competencies_domain_id_fkey (
                  domain_id,
                  domain_name
                )
              )
            ),
            competencies!weekly_assignments_competency_id_fkey (
              competency_id,
              name,
              domain_id,
              domains!competencies_domain_id_fkey (
                domain_id,
                domain_name
              )
            )
          `)
          .eq('role_id', roleId)
          .eq('week_start_date', mondayStr)
          .eq('status', 'locked')
          .is('superseded_at', null)
          .order('display_order');

        if (assignmentsError) {
          throw assignmentsError;
        }

        console.log(`📊 [useWeeklyAssignments V2] Found ${assignmentsData?.length || 0} assignments for ${mondayStr}`);

        const mappedData = (assignmentsData || []).map((item: any) => ({
          id: `assign:${item.id}`,
          action_id: item.action_id,
          display_order: item.display_order,
          self_select: item.self_select,
          competency_id: item.pro_moves?.competency_id || item.competency_id,
          competency_name: item.pro_moves?.competencies?.name || item.competencies?.name,
          domain_name: item.pro_moves?.competencies?.domains?.domain_name || item.competencies?.domains?.domain_name,
          action_statement: item.pro_moves?.action_statement || '',
        }));

        return mappedData as WeeklyAssignment[];
      }

      // ========== LEGACY PATH (default) ==========
      console.log('📚 [useWeeklyAssignments] Using legacy weekly_plan/weekly_focus (V2 flag OFF)');
      let focusData: any[] | null = null;

      // Calculate current Monday for weekly_plan query
      const now = new Date();
      const dayOfWeek = now.getDay();
      const daysToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      const thisMonday = new Date(now);
      thisMonday.setDate(now.getDate() + daysToMonday);
      thisMonday.setHours(0, 0, 0, 0);
      const mondayStr = thisMonday.toISOString().split('T')[0];

      // Try weekly_plan first (for Cycle 4+ or current week)
      const { data: planData } = await supabase
        .from('weekly_plan')
        .select(`
          id,
          action_id,
          display_order,
          self_select,
          pro_moves!weekly_plan_action_id_fkey (
            action_id,
            action_statement,
            competency_id,
            competencies!pro_moves_competency_id_fkey (
              competency_id,
              name,
              domain_id,
              domains!competencies_domain_id_fkey (
                domain_id,
                domain_name
              )
            )
          )
        `)
        .is('org_id', null)
        .eq('role_id', roleId)
        .eq('week_start_date', mondayStr)
        .eq('status', 'locked')
        .order('display_order');

      if (planData && planData.length > 0) {
        console.log('📊 [useWeeklyAssignments] Using weekly_plan data source');
        focusData = planData.map((item: any) => ({
          id: `plan:${item.id}`,
          action_id: item.action_id,
          display_order: item.display_order,
          self_select: item.self_select,
          competency_id: item.pro_moves?.competency_id,
          competency_name: item.pro_moves?.competencies?.name,
          domain_name: item.pro_moves?.competencies?.domains?.domain_name,
          action_statement: item.pro_moves?.action_statement || '',
        }));
      }

      // Fall back to weekly_focus if no weekly_plan data
      if (!focusData && cycle !== undefined && weekInCycle !== undefined) {
        console.log('📚 [useWeeklyAssignments] Using weekly_focus data source (fallback)');
        const { data: focusResult, error: focusError } = await supabase
          .from('weekly_focus')
          .select(`
            id,
            action_id,
            display_order,
            self_select,
            competency_id,
            pro_moves!weekly_focus_action_id_fkey (
              action_statement
            ),
            competencies!weekly_focus_competency_id_fkey (
              name,
              domains!competencies_domain_id_fkey (
                domain_name
              )
            )
          `)
          .eq('cycle', cycle)
          .eq('week_in_cycle', weekInCycle)
          .eq('role_id', roleId)
          .order('display_order');

        if (focusError) {
          throw focusError;
        }

        focusData = (focusResult || []).map((item: any) => ({
          id: item.id,
          action_id: item.action_id,
          display_order: item.display_order,
          self_select: item.self_select,
          competency_id: item.competency_id,
          competency_name: item.competencies?.name,
          domain_name: item.competencies?.domains?.domain_name,
          action_statement: item.pro_moves?.action_statement || '',
        }));
      }

      if (!focusData || focusData.length === 0) {
        return [];
      }

      return focusData as WeeklyAssignment[];
    },
    enabled: enabled && !!roleId,
    staleTime: 2 * 60 * 1000, // Cache for 2 minutes
  });
}
