import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from './useUserRole';

interface RoleAlias {
  role_id: number;
  display_name: string;
}

/**
 * Fetches the current org's role display name overrides and provides
 * a resolver function: resolve(role_id, fallbackName) → display name.
 *
 * Use this in any user-facing component that shows a role name.
 * Platform-level admin views should continue using roles.role_name directly.
 */
export function useRoleDisplayNames() {
  const { organizationId } = useUserRole();
  const [aliasMap, setAliasMap] = useState<Map<number, string>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!organizationId) {
      setLoading(false);
      return;
    }

    const fetch = async () => {
      const { data } = await supabase
        .from('organization_role_names')
        .select('role_id, display_name')
        .eq('org_id', organizationId);

      const map = new Map<number, string>();
      (data || []).forEach((row: RoleAlias) => {
        map.set(row.role_id, row.display_name);
      });
      setAliasMap(map);
      setLoading(false);
    };

    fetch();
  }, [organizationId]);

  /** Resolve a role_id + fallback platform name to the org's display name */
  const resolve = useCallback(
    (roleId: number, fallback: string): string => {
      return aliasMap.get(roleId) || fallback;
    },
    [aliasMap]
  );

  return { resolve, aliasMap, loading };
}
