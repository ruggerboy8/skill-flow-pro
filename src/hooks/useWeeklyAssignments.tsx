import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

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
  cycleNumber?: number; // Optional: blocks global assignments for onboarding cycles
  enabled?: boolean;
}

/**
 * Fetches weekly assignments from the weekly_assignments table.
 * Uses current week Monday as the week_start_date.
 */
export function useWeeklyAssignments({
  roleId,
  cycleNumber,
  enabled = true,
}: UseWeeklyAssignmentsParams) {
  return useQuery({
    queryKey: ['weekly-assignments', roleId, cycleNumber],
    queryFn: async () => {
      if (!roleId) {
        throw new Error('Role ID is required');
      }

      // Safety check: Don't return global assignments for onboarding cycles (1-3)
      if (cycleNumber !== undefined && cycleNumber < 4) {
        console.warn('[useWeeklyAssignments] Blocked for onboarding cycle:', cycleNumber);
        return [];
      }

      // Calculate current Monday
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
        .eq('source', 'global')
        .eq('role_id', roleId)
        .eq('week_start_date', mondayStr)
        .eq('status', 'locked')
        .is('org_id', null)
        .is('superseded_at', null)
        .order('display_order');

      if (assignmentsError) {
        throw assignmentsError;
      }

      console.log(`📊 [useWeeklyAssignments] Found ${assignmentsData?.length || 0} assignments for ${mondayStr}`);

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
    },
    enabled: enabled && !!roleId,
    staleTime: 2 * 60 * 1000, // Cache for 2 minutes
  });
}
