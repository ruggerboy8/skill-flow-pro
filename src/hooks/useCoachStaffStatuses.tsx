import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { startOfWeek, format } from 'date-fns';

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
  required_count: number;
  conf_submitted_count: number;
  conf_late_count: number;
  perf_submitted_count: number;
  perf_late_count: number;
  backlog_count: number;
  last_conf_at: string | null;
  last_perf_at: string | null;
  tz: string;
}

export interface UseCoachStaffStatusesOptions {
  coachUserId?: string | null;
  weekOf?: Date | string;
  enabled?: boolean;
}

export function useCoachStaffStatuses({
  coachUserId,
  weekOf,
  enabled = true,
}: UseCoachStaffStatusesOptions = {}) {
  const serializedWeek = useMemo(() => {
    if (!weekOf) return undefined;
    const dateValue = typeof weekOf === 'string' ? new Date(weekOf) : weekOf;
    if (Number.isNaN(dateValue.getTime())) return undefined;
    const monday = startOfWeek(dateValue, { weekStartsOn: 1 });
    return format(monday, 'yyyy-MM-dd'); // YYYY-MM-DD for the Monday
  }, [weekOf]);

  const query = useQuery<StaffStatus[]>({
    queryKey: ['coach-staff-statuses', coachUserId, serializedWeek],
    enabled: enabled && (coachUserId === undefined || !!coachUserId),
    staleTime: 60 * 1000,
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const effectiveCoachId = coachUserId ?? user?.id;

      if (!effectiveCoachId) {
        throw new Error('Not authenticated');
      }

      const rpcArgs: { p_coach_user_id: string; p_week_start?: string } = {
        p_coach_user_id: effectiveCoachId,
      };

      if (serializedWeek) {
        rpcArgs.p_week_start = serializedWeek;
      }

      const { data: rpcData, error: rpcError } = await supabase
        .rpc('get_staff_statuses', rpcArgs);

      if (rpcError) {
        console.error('[useCoachStaffStatuses] RPC error:', rpcError);
        throw rpcError;
      }

      const staffIds = (rpcData || []).map((s: any) => s.staff_id);
      const emailMap = new Map<string, string>();

      if (staffIds.length > 0) {
        const { data: staffData, error: staffError } = await supabase
          .from('staff')
          .select('id, email')
          .in('id', staffIds);

        if (staffError) {
          console.error('[useCoachStaffStatuses] Staff email lookup error:', staffError);
          throw staffError;
        }

        (staffData || []).forEach((s: any) => {
          emailMap.set(s.id, s.email);
        });
      }

      return (rpcData || []).map((row: any) => ({
        staff_id: row.staff_id,
        staff_name: row.staff_name,
        email: emailMap.get(row.staff_id),
        role_id: row.role_id,
        role_name: row.role_name,
        location_id: row.location_id,
        location_name: row.location_name,
        organization_id: row.organization_id,
        organization_name: row.organization_name,
        active_monday: row.active_monday,
        required_count: row.required_count,
        conf_submitted_count: row.conf_submitted_count,
        conf_late_count: row.conf_late_count,
        perf_submitted_count: row.perf_submitted_count,
        perf_late_count: row.perf_late_count,
        backlog_count: row.backlog_count,
        last_conf_at: row.last_conf_at,
        last_perf_at: row.last_perf_at,
        tz: row.tz,
      }));
    },
  });

  return {
    statuses: query.data ?? [],
    loading: query.isLoading,
    error: (query.error as Error) ?? null,
    reload: query.refetch,
  };
}
