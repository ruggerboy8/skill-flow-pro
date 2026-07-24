import { useStaffProfile } from './useStaffProfile';

export function useUserRole() {
  const { data: staff, isLoading, error } = useStaffProfile();

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

  // ─── Capability resolution ─────────────────────────────────────────────────
  // CAPS-ONLY since 2026-07-25 (roadmap 1.3): user_capabilities is the single
  // source of truth for permissions. Every staff row has a caps row (backfilled
  // 2026-07-24, and the admin-users edge function upserts one on create/edit).
  // The legacy staff.is_* flags are no longer read here — only the staff-role
  // attributes (office manager / doctor / clinical director / lead), which are
  // "who someone is", not permissions.
  const caps = staff.user_capabilities;
  const hasCapabilitiesRow = caps !== null;

  // Derive persona from coach_scopes
  const scopes = staff.coach_scopes || [];
  const orgScopes = scopes.filter(s => s.scope_type === 'org');
  const hasOrgScope = orgScopes.length > 0;
  const locationScopes = scopes.filter(s => s.scope_type === 'location');
  const locationScopeCount = locationScopes.length;

  // ─── Elevated roles ────────────────────────────────────────────────────────
  const isSuperAdmin = caps?.is_platform_admin ?? false;
  const isOrgAdmin = caps?.is_org_admin ?? false;
  const isParticipant = caps?.is_participant ?? false;

  // Office Manager, Doctor, Clinical Director flags live on staff only (not yet in user_capabilities)
  const isOfficeManager = staff.is_office_manager ?? false;
  const isDoctor = staff.is_doctor ?? false;
  const isClinicalDirector = staff.is_clinical_director ?? false;

  // is_lead: still on staff table (scope-based role — not a capability toggle)
  const isLead = staff.is_lead ?? false;

  // ─── Coach / regional / coaching scope ────────────────────────────────────
  // isCoach: has coach_scopes OR can_view_submissions capability
  const isCoach = scopes.length > 0 || (caps?.can_view_submissions ?? false);

  // Regional = org admin OR has org scope OR manages 2+ locations
  const isRegional = isOrgAdmin || hasOrgScope || locationScopeCount >= 2;

  // ─── Capability toggles ───────────────────────────────────────────────────
  const canViewSubmissions = caps?.can_view_submissions ?? false;
  const canSubmitEvals = caps?.can_submit_evals ?? false;
  const canReviewEvals = caps?.can_review_evals ?? false;
  const canInviteUsers = caps?.can_invite_users ?? false;
  const canManageLibrary = caps?.can_manage_library ?? false;
  const canManageLocations = caps?.can_manage_locations ?? false;
  const canManageUsers = caps?.can_manage_users ?? false;
  const canManageAssignments = (caps?.can_manage_assignments ?? false) || isOrgAdmin || isSuperAdmin;

  // ─── Managed scope lists ──────────────────────────────────────────────────
  const managedLocationIds = locationScopes.map(s => s.scope_id);
  const managedOrgIds = orgScopes.map(s => s.scope_id);

  // ─── Dashboard visibility ─────────────────────────────────────────────────
  // Non-participants who are coaches/regional managers (admin role wins over doctor)
  const showRegionalDashboard = !isParticipant && (isRegional || isCoach);

  // Office managers who are NOT coaches or regional managers
  const showLocationDashboard = isOfficeManager && !isCoach && !isRegional;

  // ─── Admin / clinical access ──────────────────────────────────────────────
  // Capability-based admins (e.g. users with can_manage_users but no is_org_admin flag)
  // must also be able to land on /admin. Otherwise AdminPage redirects them to "/".
  const canAccessAdmin =
    isSuperAdmin ||
    isOrgAdmin ||
    canManageUsers ||
    canManageLocations ||
    canManageAssignments ||
    canInviteUsers ||
    canViewSubmissions ||
    canReviewEvals ||
    canManageLibrary;
  const canAccessClinical = isClinicalDirector || isSuperAdmin;

  // ─── Home route ───────────────────────────────────────────────────────────
  // Admin / regional / coach roles take precedence over isDoctor for landing page.
  // Pure doctors (no admin/coach role) still land on /doctor.
  let homeRoute = '/';
  if (isSuperAdmin || isOrgAdmin || isRegional || isCoach) {
    homeRoute = '/dashboard';
  } else if (isDoctor) {
    homeRoute = '/doctor';
  } else if (!isParticipant) {
    homeRoute = '/dashboard';
  }

  return {
    isLoading: false,
    staffId: staff.id,
    organizationId: staff.organization_id ?? staff.locations?.practice_groups?.organization_id ?? undefined,
    practiceType: (staff.locations?.practice_groups?.organizations as any)?.practice_type ?? undefined,
    isSuperAdmin,
    isOrgAdmin,
    isRegional,
    isCoach,
    isParticipant,
    isLead,
    isOfficeManager,
    isDoctor,
    isClinicalDirector,
    managedLocationIds,
    managedOrgIds,
    homeRoute,
    showRegionalDashboard,
    showLocationDashboard,
    canAccessAdmin,
    canAccessClinical,
    // Capability toggles (new system)
    canViewSubmissions,
    canSubmitEvals,
    canReviewEvals,
    canInviteUsers,
    canManageLibrary,
    canManageLocations,
    canManageUsers,
    canManageAssignments,
    hasCapabilitiesRow,
  };
}
