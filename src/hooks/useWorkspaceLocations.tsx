import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface WorkspaceLocation { id: string; name: string; group: string }

/**
 * The caller's org locations, for the training workspace's location pickers
 * (issue location tags, transcript-extraction suggestions). Scoped to orgId
 * explicitly rather than leaning on RLS, which is permissive for super
 * admins. Extracted from TrainingWorkspace.tsx so the "Meetings and Focus"
 * tab's meeting dialog can share the same lookup instead of duplicating it.
 */
export function useWorkspaceLocations(orgId: string | null) {
  return useQuery({
    queryKey: ['workspace-locations', orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<WorkspaceLocation[]> => {
      const { data: groups } = await supabase.from('practice_groups').select('id, name').eq('organization_id', orgId);
      const groupIds = (groups ?? []).map((g: any) => g.id);
      if (!groupIds.length) return [];
      const { data: locs } = await supabase.from('locations').select('id, name, group_id').in('group_id', groupIds).eq('active', true).order('name');
      const gmap = new Map((groups ?? []).map((g: any) => [g.id, g.name]));
      return (locs ?? []).map((l: any) => ({ id: l.id, name: l.name, group: gmap.get(l.group_id) ?? '' }));
    },
  });
}
