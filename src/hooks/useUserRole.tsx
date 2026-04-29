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
  // When a user_capabilities row exists, prefer those values.
  // Fall back to legacy boolean flags on the staff table.
  const caps = staff.user_capabilities;
  const hasCapabilitiesRow = caps !== null;

  // Derive persona from coach_scopes
  const scopes = staff.coach_scopes || [];
  const orgScopes = scopes.filter(s => s.scope_type === 'org');
  const hasOrgScope = orgScopes.length > 0;
  const locationScopes = scopes.filter(s => s.scope_type === 'location');
  const locationScopeCount = locationScopes.length;

  // ─── Elevated roles ────────────────────────────────────────────────────────
  // is_platform_admin in the new table maps to is_super_admin in the old table
  const isSuperAdmin = caps
    ? (caps.is_platform_admin ?? false)
    : (staff.is_super_admin ?? false);

  // is_org_admin: prefer capabilities row
  const isOrgAdmin = caps
    ? (caps.is_org_admin ?? false)
    : (staff.is_org_admin ?? false);

  // is_participant: prefer capabilities row
  const isParticipant = caps
    ? (caps.is_participant ?? false)
    : (staff.is_participant ?? false);

  // Office Manager, Doctor, Clinical Director flags live on staff only (not yet in user_capabilities)
  const isOfficeManager = staff.is_office_manager ?? false;
  const isDoctor = staff.is_doctor ?? false;
  const isClinicalDirector = staff.is_clinical_director ?? false;

  // is_lead: still on staff table (scope-based role — not a capability toggle)
  const isLead = staff.is_lead ?? false;

  // ─── Coach / regional / coaching scope ────────────────────────────────────
  // isCoach: has coach_scopes OR old is_coach flag OR can_view_submissions capability
  const isCoach = scopes.length > 0 || staff.is_coach || (caps?.can_view_submissions ?? false);

  // Regional = org admin OR has org scope OR manages 2+ locations
  const isRegional = isOrgAdmin || hasOrgScope || locationScopeCount >= 2;

  // ─── Capability toggles (new system) ──────────────────────────────────────
  // When caps row exists use its values; otherwise derive from legacy flags.
  const canViewSubmissions = caps
    ? (caps.can_view_submissions ?? false)
    : (staff.is_coach || staff.is_org_admin || staff.is_super_admin || false);

  const canSubmitEvals = caps
    ? (caps.can_submit_evals ?? false)
    : (staff.is_coach || staff.is_org_admin || staff.is_super_admin || false);

  const canReviewEvals = caps
    ? (caps.can_review_evals ?? false)
    : (staff.is_org_admin || staff.is_super_admin || false);

  const canInviteUsers = caps
    ? (caps.can_invite_users ?? false)
    : (staff.is_org_admin || staff.is_super_admin || false);

  const canManageLibrary = caps
    ? (caps.can_manage_library ?? false)
    : (staff.is_super_admin || false);

  const canManageLocations = caps
    ? (caps.can_manage_locations ?? false)
    : (staff.is_org_admin || staff.is_super_admin || false);

  const canManageUsers = caps
    ? (caps.can_manage_users ?? false)
    : (staff.is_org_admin || staff.is_super_admin || false);

  const canManageAssignments = caps
    ? (caps.can_manage_assignments ?? false) || isOrgAdmin || isSuperAdmin
    : (staff.is_org_admin || staff.is_super_admin || false);

  // ─── Managed scope lists ──────────────────────────────────────────────────
  const managedLocationIds = locationScopes.map(s => s.scope_id);
  const managedOrgIds = orgScopes.map(s => s.scope_id);

  // ─── Dashboard visibility ─────────────────────────────────────────────────
  // Non-participants who are coaches/regional managers (admin role wins over doctor)
  const showRegionalDashboard = !isParticipant && (isRegional || isCoach);

  // Office managers who are NOT coaches or regional managers
  const showLocationDashboard = isOfficeManager && !isCoach && !isRegional;

  // ─── Admin / clinical access ──────────────────────────────────────────────
  const canAccessAdmin = isSuperAdmin || isOrgAdmin;
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
