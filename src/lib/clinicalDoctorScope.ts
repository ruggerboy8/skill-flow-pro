import { supabase } from '@/integrations/supabase/client';

export async function buildOrganizationStaffScopeFilter(organizationId: string): Promise<string> {
  const filters = [`organization_id.eq.${organizationId}`];

  const { data: groups, error: groupsError } = await supabase
    .from('practice_groups')
    .select('id')
    .eq('organization_id', organizationId);

  if (groupsError) throw groupsError;

  const groupIds = (groups ?? []).map((group) => group.id).filter(Boolean);
  if (groupIds.length === 0) return filters.join(',');

  const { data: locations, error: locationsError } = await supabase
    .from('locations')
    .select('id')
    .in('group_id', groupIds);

  if (locationsError) throw locationsError;

  const locationIds = (locations ?? []).map((location) => location.id).filter(Boolean);
  if (locationIds.length > 0) {
    filters.push(`primary_location_id.in.(${locationIds.join(',')})`);
  }

  return filters.join(',');
}