import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { hexToHsl } from '@/lib/colorUtils';

export interface OrgBranding {
  name: string | null;
  displayName: string | null;
  logoUrl: string | null;
  brandColor: string | null;
}

// Resolves the current user's org id without depending on useUserRole/
// useStaffProfile (which can trigger setup redirects) so this is safe to call
// from the pre-app auth screens.
async function resolveCurrentOrgId(): Promise<string | null> {
  const { data: auth } = await supabase.auth.getUser();
  const user = auth?.user;
  if (!user) return null;

  const { data: staff } = await supabase
    .from('staff')
    .select('organization_id, primary_location_id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!staff) return null;
  if (staff.organization_id) return staff.organization_id;

  if (staff.primary_location_id) {
    const { data: loc } = await supabase
      .from('locations')
      .select('group_id')
      .eq('id', staff.primary_location_id)
      .maybeSingle();
    if (loc?.group_id) {
      const { data: grp } = await supabase
        .from('practice_groups')
        .select('organization_id')
        .eq('id', loc.group_id)
        .maybeSingle();
      return grp?.organization_id ?? null;
    }
  }
  return null;
}

/**
 * Branding for the current user's organization. Pass `{ applyPrimary: true }`
 * to re-skin the app's --primary color from the org's brand color.
 */
export function useOrgBranding(opts?: { applyPrimary?: boolean }) {
  const query = useQuery({
    queryKey: ['org-branding-current'],
    staleTime: 1000 * 60 * 5,
    queryFn: async (): Promise<OrgBranding | null> => {
      const orgId = await resolveCurrentOrgId();
      if (!orgId) return null;
      const { data } = await supabase
        .from('organizations')
        .select('name, app_display_name, logo_url, brand_color')
        .eq('id', orgId)
        .maybeSingle();
      if (!data) return null;
      const row = data as any;
      return {
        name: row.name ?? null,
        displayName: row.app_display_name ?? null,
        logoUrl: row.logo_url ?? null,
        brandColor: row.brand_color ?? null,
      };
    },
  });

  const brandColor = query.data?.brandColor ?? null;
  useEffect(() => {
    if (!opts?.applyPrimary || !brandColor) return;
    const hsl = hexToHsl(brandColor);
    if (hsl) document.documentElement.style.setProperty('--primary', hsl);
  }, [opts?.applyPrimary, brandColor]);

  return { branding: query.data ?? null, isLoading: query.isLoading };
}
