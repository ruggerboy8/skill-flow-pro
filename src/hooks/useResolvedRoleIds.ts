import { useStaffProfile, type StaffProfile } from '@/hooks/useStaffProfile';
import { useLeadRoleId } from '@/hooks/useLeadRoleId';

export interface ResolvedRoleIds {
  staffProfile: StaffProfile | undefined;
  /** Base role id first, then the lead role id (if applicable and distinct). */
  roleIds: number[];
  isLoading: boolean;
}

/**
 * Role-resolution half of the round-3 merge logic (see
 * src/lib/roleCompetencyMerge.ts for the other half). Shared by
 * useDomainDetail and useCraftAtlas so both hooks query competencies for
 * the same set of role ids: the staff member's base role, plus their lead
 * role when `is_lead` is true (deduped).
 */
export function useResolvedRoleIds(): ResolvedRoleIds {
  const { data: staffProfile, isLoading: profileLoading } = useStaffProfile({
    redirectToSetup: false,
    showErrorToast: false,
  });
  const { data: leadRoleId, isLoading: leadRoleLoading } = useLeadRoleId();

  const roleIds: number[] = [];
  if (staffProfile?.role_id) roleIds.push(staffProfile.role_id);
  if (staffProfile?.is_lead && leadRoleId && !roleIds.includes(leadRoleId)) {
    roleIds.push(leadRoleId);
  }

  return { staffProfile, roleIds, isLoading: profileLoading || leadRoleLoading };
}
