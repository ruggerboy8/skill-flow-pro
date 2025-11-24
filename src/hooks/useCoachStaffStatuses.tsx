import { useState, useEffect } from 'react';
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
  const [statuses, setStatuses] = useState<StaffStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);

    try {
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

      // Fetch emails separately since RPC doesn't return them
      const staffIds = (rpcData || []).map((s: any) => s.staff_id);
      let emailMap = new Map<string, string>();
      
      if (staffIds.length > 0) {
        const { data: staffData } = await supabase
          .from('staff')
          .select('id, email')
          .in('id', staffIds);
        
        (staffData || []).forEach((s: any) => {
          emailMap.set(s.id, s.email);
        });
      }

      // Map RPC results to StaffStatus
      const normalized: StaffStatus[] = (rpcData || []).map((row: any) => ({
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

      setStatuses(normalized);
    } catch (err) {
      console.error('[useCoachStaffStatuses] Error:', err);
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return { statuses, loading, error, reload: load };
}
