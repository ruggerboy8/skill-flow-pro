import { useStaffProfile } from './useStaffProfile';
import { deriveUserRole } from './deriveUserRole';

export function useUserRole() {
  const { data: staff, isLoading } = useStaffProfile();

  if (isLoading || !staff) {
    return {
      isLoading: true,
      staffId: undefined,
      organizationId: undefined as string | undefined,
      practiceType: undefined as string | undefined,
      isSuperAdmin: false,
      isOrgAdmin: false,
      isRegional: false,
      isCoach: false,
      isParticipant: false,
      isLead: false,
      isOfficeManager: false,
      isDoctor: false,
      isClinicalDirector: false,
      isDoctorCoach: false,
      doctorMenteeIds: [] as string[],
      managedLocationIds: [] as string[],
      managedOrgIds: [] as string[],
      homeRoute: '/',
      showRegionalDashboard: false,
      showLocationDashboard: false,
      canAccessAdmin: false,
      canAccessClinical: false,
      // Capability toggles (new system)
      canViewSubmissions: false,
      canSubmitEvals: false,
      canReviewEvals: false,
      canInviteUsers: false,
      canManageLibrary: false,
      canManageLocations: false,
      canManageUsers: false,
      canManageAssignments: false,
      hasCapabilitiesRow: false,
    };
  }

  return deriveUserRole(staff);
}
