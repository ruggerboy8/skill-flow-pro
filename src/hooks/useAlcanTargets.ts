import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ALCAN_ORG_ID } from '@/lib/askAlcanAccess';

export interface TargetLocation {
  id: string;
  name: string;
}
export interface TargetRole {
  role_id: number;
  role_name: string;
}

/** Active locations and roles within the Alcan org, for survey targeting. */
export function useAlcanTargets() {
  const locations = useQuery({
    queryKey: ['alcan-targets', 'locations'],
    staleTime: 1000 * 60 * 10,
    queryFn: async (): Promise<TargetLocation[]> => {
      const { data: groups } = await supabase
        .from('practice_groups')
        .select('id')
        .eq('organization_id', ALCAN_ORG_ID);
      const groupIds = (groups ?? []).map((g) => g.id);
      if (!groupIds.length) return [];
      const { data, error } = await supabase
        .from('locations')
        .select('id, name')
        .in('group_id', groupIds)
        .eq('active', true)
        .order('name');
      if (error) throw error;
      return (data ?? []) as TargetLocation[];
    },
  });

  const roles = useQuery({
    queryKey: ['alcan-targets', 'roles'],
    staleTime: 1000 * 60 * 10,
    queryFn: async (): Promise<TargetRole[]> => {
      // Roles actually held by active Alcan staff (keeps the picker tidy).
      const { data: groups } = await supabase
        .from('practice_groups')
        .select('id')
        .eq('organization_id', ALCAN_ORG_ID);
      const groupIds = (groups ?? []).map((g) => g.id);
      if (!groupIds.length) return [];
      const { data: locs } = await supabase
        .from('locations')
        .select('id')
        .in('group_id', groupIds);
      const locIds = (locs ?? []).map((l) => l.id);
      if (!locIds.length) return [];
      const { data: staff } = await supabase
        .from('staff')
        .select('role_id')
        .in('primary_location_id', locIds)
        .eq('is_paused', false);
      const roleIds = [...new Set((staff ?? []).map((s) => s.role_id).filter(Boolean))] as number[];
      if (!roleIds.length) return [];
      const { data, error } = await supabase
        .from('roles')
        .select('role_id, role_name')
        .in('role_id', roleIds)
        .order('role_name');
      if (error) throw error;
      return (data ?? []).map((r) => ({ role_id: r.role_id, role_name: r.role_name ?? `Role ${r.role_id}` }));
    },
  });

  return {
    locations: locations.data ?? [],
    roles: roles.data ?? [],
    isLoading: locations.isLoading || roles.isLoading,
  };
}
