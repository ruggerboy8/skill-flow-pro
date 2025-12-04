import { useStaffProfile } from './useStaffProfile';

export function useUserRole() {
  const { data: staff, isLoading, error } = useStaffProfile();

  if (isLoading || !staff) {
    return { 
      isLoading: true, 
      staffId: undefined,
      isSuperAdmin: false,
      isOrgAdmin: false,
      isRegional: false, 
      isCoach: false,
      isParticipant: false,
      isLead: false,
      managedLocationIds: [] as string[],
      homeRoute: '/',
      showRegionalDashboard: false,
    };
  }

  // Derive persona from coach_scopes
  const scopes = staff.coach_scopes || [];
  const isOrgAdmin = scopes.some(s => s.scope_type === 'org');
  const locationScopes = scopes.filter(s => s.scope_type === 'location');
  const locationScopeCount = locationScopes.length;

  // Regional = org admin OR manages 2+ locations
  const isRegional = isOrgAdmin || locationScopeCount >= 2;
  const isCoach = scopes.length > 0 || staff.is_coach;
  const isParticipant = staff.is_participant ?? false;
  const isLead = staff.is_lead ?? false;

  // Get list of managed location IDs (for filtering data)
  const managedLocationIds = locationScopes.map(s => s.scope_id);

  // Determine if this user should see the regional dashboard
  // Non-participants who are coaches/regional managers
  const showRegionalDashboard = !isParticipant && (isRegional || isCoach);

  return {
    isLoading: false,
    staffId: staff.id,
    isSuperAdmin: staff.is_super_admin,
    isOrgAdmin,
    isRegional,
    isCoach,
    isParticipant,
    isLead,
    managedLocationIds,
    homeRoute: isParticipant ? '/' : '/dashboard',
    showRegionalDashboard,
  };
}
