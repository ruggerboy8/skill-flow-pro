import { useUserRole } from '@/hooks/useUserRole';

// Ask Alcan (surveys) is intentionally scoped to the Alcan organization for now.
// Access = super admin AND a member of the Alcan org. Frank (HR) is granted
// super admin, which is sufficient.
export const ALCAN_ORG_ID = 'a1ca0000-0000-0000-0000-000000000001';

export function useAskAlcanAccess(): { canAccess: boolean; isLoading: boolean } {
  const { isSuperAdmin, isLoading } = useUserRole();
  // Ask Alcan is a super-admin-only surface. Org membership is no longer required —
  // every super admin (e.g. Tim) should see it regardless of which org they sit in.
  return {
    isLoading,
    canAccess: !isLoading && isSuperAdmin,
  };
}
