import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface StaffStatus {
  staff_id: string;
  staff_name: string;
  email?: string;
  role_id: number;
  role_name: string;
  location_id: string;
  location_name: string;
  organization_id: string;
  organization_name: string;
  active_monday: string;
  cycle_number: number;
  week_in_cycle: number;
  phase: string;
  checkin_due: string;
  checkout_open: string;
  checkout_due: string;
  required_count: number;
  conf_count: number;
  perf_count: number;
  backlog_count: number;
  last_activity_kind: string | null;
  last_activity_at: string | null;
  source_used: string;
  tz: string;
}

export function useCoachStaffStatuses() {
  const query = useQuery<StaffStatus[]>({
    queryKey: ['coach-staff-statuses'],
    staleTime: 60 * 1000,
    refetchInterval: 30000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('Not authenticated');
      }

      const { data: rpcData, error: rpcError } = await supabase
        .rpc('get_staff_statuses', { p_coach_user_id: user.id });

      if (rpcError) {
        console.error('[useCoachStaffStatuses] RPC error:', rpcError);
        throw rpcError;
      }

      // Log warning if no data returned
      if (!rpcData || rpcData.length === 0) {
        console.warn('⚠️ get_staff_statuses returned no rows', {
          message: 'Check RLS policies and coach scope configuration'
        });
      }

      // Map RPC results to StaffStatus (email will be undefined)
      const normalized: StaffStatus[] = (rpcData || []).map((row: any) => ({
        staff_id: row.staff_id,
        staff_name: row.staff_name,
        email: undefined,
        role_id: row.role_id,
        role_name: row.role_name,
        location_id: row.location_id,
        location_name: row.location_name,
        organization_id: row.organization_id,
        organization_name: row.organization_name,
        active_monday: row.active_monday,
        cycle_number: row.cycle_number,
        week_in_cycle: row.week_in_cycle,
        phase: row.phase,
        checkin_due: row.checkin_due,
        checkout_open: row.checkout_open,
        checkout_due: row.checkout_due,
        required_count: row.required_count,
        conf_count: row.conf_count,
        perf_count: row.perf_count,
        backlog_count: row.backlog_count,
        last_activity_kind: row.last_activity_kind,
        last_activity_at: row.last_activity_at,
        source_used: row.source_used,
        tz: row.tz,
      }));

      return normalized;
    },
  });

  return {
    statuses: query.data ?? [],
    loading: query.isLoading,
    error: query.error as Error | null,
    reload: query.refetch,
  };
}
