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
      isOfficeManager: false,
      managedLocationIds: [] as string[],
      managedOrgIds: [] as string[],
      homeRoute: '/',
      showRegionalDashboard: false,
      showLocationDashboard: false,
      canAccessAdmin: false,
    };
  }

  // Derive persona from coach_scopes
  const scopes = staff.coach_scopes || [];
  const orgScopes = scopes.filter(s => s.scope_type === 'org');
  const hasOrgScope = orgScopes.length > 0;
  const locationScopes = scopes.filter(s => s.scope_type === 'location');
  const locationScopeCount = locationScopes.length;

  // isOrgAdmin comes from the explicit flag (admin powers)
  const isOrgAdmin = staff.is_org_admin ?? false;
  
  // Office Manager flag (hybrid: participant + location visibility)
  const isOfficeManager = staff.is_office_manager ?? false;
  
  // Regional = org admin OR has org scope OR manages 2+ locations
  const isRegional = isOrgAdmin || hasOrgScope || locationScopeCount >= 2;
  const isCoach = scopes.length > 0 || staff.is_coach;
  const isParticipant = staff.is_participant ?? false;
  const isLead = staff.is_lead ?? false;

  // Get list of managed location IDs (for filtering data)
  const managedLocationIds = locationScopes.map(s => s.scope_id);
  
  // Get list of managed org IDs (for org-level filtering)
  const managedOrgIds = orgScopes.map(s => s.scope_id);

  // Determine if this user should see the regional dashboard
  // Non-participants who are coaches/regional managers
  const showRegionalDashboard = !isParticipant && (isRegional || isCoach);
  
  // Determine if this user should see the location dashboard link
  // Office managers who are NOT coaches or regional managers
  const showLocationDashboard = isOfficeManager && !isCoach && !isRegional;

  // Can access admin pages (super admin OR org admin)
  const canAccessAdmin = staff.is_super_admin || staff.is_org_admin;

  return {
    isLoading: false,
    staffId: staff.id,
    isSuperAdmin: staff.is_super_admin,
    isOrgAdmin,
    isRegional,
    isCoach,
    isParticipant,
    isLead,
    isOfficeManager,
    managedLocationIds,
    managedOrgIds,
    homeRoute: isParticipant ? '/' : '/dashboard',
    showRegionalDashboard,
    showLocationDashboard,
    canAccessAdmin,
  };
}
