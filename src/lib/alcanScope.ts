import { supabase } from '@/integrations/supabase/client';
import { ALCAN_ORG_ID } from './askAlcanAccess';

// Shared resolution of the Alcan org's groups/locations so the targeting
// picker, the recipient estimate, and (conceptually) the publish snapshot all
// agree on the same scope — specifically "active locations only".

export async function getAlcanGroupIds(): Promise<string[]> {
  const { data } = await supabase
    .from('practice_groups')
    .select('id')
    .eq('organization_id', ALCAN_ORG_ID);
  return (data ?? []).map((g) => g.id);
}

export async function getAlcanActiveLocationIds(): Promise<string[]> {
  const groupIds = await getAlcanGroupIds();
  if (!groupIds.length) return [];
  const { data } = await supabase
    .from('locations')
    .select('id')
    .in('group_id', groupIds)
    .eq('active', true);
  return (data ?? []).map((l) => l.id);
}
