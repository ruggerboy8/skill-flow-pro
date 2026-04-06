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
  orgId?: string | null;
  enabled?: boolean;
}

function getCurrentMondayString() {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const daysToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const thisMonday = new Date(now);
  thisMonday.setDate(now.getDate() + daysToMonday);
  thisMonday.setHours(0, 0, 0, 0);
  return thisMonday.toISOString().split('T')[0];
}

/**
 * Fetches weekly assignments from the weekly_assignments table.
 * Uses current week Monday as the week_start_date.
 */
export function useWeeklyAssignments({
  roleId,
  orgId,
  enabled = true,
}: UseWeeklyAssignmentsParams) {
  const mondayStr = getCurrentMondayString();

  return useQuery({
    queryKey: ['weekly-assignments', roleId, orgId ?? 'global', mondayStr],
    queryFn: async () => {
      if (!roleId) {
        throw new Error('Role ID is required');
      }

      let assignmentsQuery = supabase
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

      assignmentsQuery = orgId
        ? assignmentsQuery.eq('org_id', orgId)
        : assignmentsQuery.is('org_id', null);

      const { data: assignmentsData, error: assignmentsError } = await assignmentsQuery;

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
    refetchOnMount: 'always',
    refetchOnReconnect: 'always',
  });
}
