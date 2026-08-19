import { describe, it, expect } from 'vitest';
import { deriveUserRole } from './deriveUserRole';
import type { StaffProfile, UserCapabilities } from './useStaffProfile';

function caps(overrides: Partial<UserCapabilities> = {}): UserCapabilities {
  return {
    is_participant: false,
    participation_start_at: null,
    can_view_submissions: false,
    can_submit_evals: false,
    can_review_evals: false,
    can_invite_users: false,
    can_manage_library: false,
    can_manage_locations: false,
    can_manage_users: false,
    can_manage_assignments: false,
    is_org_admin: false,
    is_platform_admin: false,
    ...overrides,
  };
}

function staff(overrides: Partial<StaffProfile> = {}): StaffProfile {
  return {
    id: 'staff-1',
    name: 'Test Staff',
    role_id: 1,
    primary_location_id: 'loc-1',
    organization_id: 'org-1',
    is_super_admin: false,
    is_org_admin: false,
    is_participant: true,
    is_coach: false,
    is_lead: false,
    is_office_manager: false,
    is_doctor: false,
    is_clinical_director: false,
    is_paused: false,
    paused_at: null,
    pause_reason: null,
    allow_backfill_until: null,
    baseline_released_at: null,
    baseline_released_by: null,
    scheduling_link: null,
    roles: null,
    locations: null,
    coach_scopes: [],
    mentee_assignments: [],
    user_capabilities: caps(),
    ...overrides,
  };
}

describe('deriveUserRole', () => {
  it('plain participant: no admin/coach access, home route is "/"', () => {
    const result = deriveUserRole(
      staff({ user_capabilities: caps({ is_participant: true }) })
    );

    expect(result.isCoach).toBe(false);
    expect(result.isRegional).toBe(false);
    expect(result.showRegionalDashboard).toBe(false);
    expect(result.showLocationDashboard).toBe(false);
    expect(result.canAccessAdmin).toBe(false);
    expect(result.canAccessClinical).toBe(false);
    expect(result.homeRoute).toBe('/');
  });

  it('office manager (non-coach, non-regional): sees the location dashboard, not admin', () => {
    const result = deriveUserRole(
      staff({
        is_office_manager: true,
        user_capabilities: caps({ is_participant: true }),
      })
    );

    expect(result.showLocationDashboard).toBe(true);
    expect(result.showRegionalDashboard).toBe(false);
    expect(result.canAccessAdmin).toBe(false);
    // Office manager without admin, participant lands on "/"
    expect(result.homeRoute).toBe('/');
  });

  it('coach with location scopes: isCoach true via scopes alone, one location does not make them regional', () => {
    const result = deriveUserRole(
      staff({
        user_capabilities: caps({ is_participant: false, can_view_submissions: false }),
        coach_scopes: [{ scope_type: 'location', scope_id: 'loc-1' }],
      })
    );

    expect(result.isCoach).toBe(true);
    expect(result.isRegional).toBe(false); // only 1 location scope, needs >= 2
    expect(result.showRegionalDashboard).toBe(true); // non-participant + isCoach
    expect(result.homeRoute).toBe('/dashboard');
  });

  it('coach who manages 2+ locations becomes regional (boundary: exactly 2)', () => {
    const result = deriveUserRole(
      staff({
        user_capabilities: caps(),
        coach_scopes: [
          { scope_type: 'location', scope_id: 'loc-1' },
          { scope_type: 'location', scope_id: 'loc-2' },
        ],
      })
    );

    expect(result.isRegional).toBe(true);
    expect(result.managedLocationIds).toEqual(['loc-1', 'loc-2']);
  });

  it('single location scope is not enough to be regional (boundary: 1 short of 2)', () => {
    const result = deriveUserRole(
      staff({
        user_capabilities: caps(),
        coach_scopes: [{ scope_type: 'location', scope_id: 'loc-1' }],
      })
    );

    expect(result.isRegional).toBe(false);
  });

  it('org admin: full admin access regardless of capability toggles, lands on /dashboard', () => {
    const result = deriveUserRole(
      staff({
        is_org_admin: false, // legacy staff flag deliberately left false
        user_capabilities: caps({ is_org_admin: true }),
      })
    );

    expect(result.isOrgAdmin).toBe(true);
    expect(result.isRegional).toBe(true); // org admin implies regional
    expect(result.canAccessAdmin).toBe(true);
    expect(result.canManageAssignments).toBe(true); // org admin always gets this, even without the toggle
    expect(result.homeRoute).toBe('/dashboard');
  });

  it('legacy staff.is_org_admin flag alone does not grant org-admin derivation (caps is the source of truth)', () => {
    const result = deriveUserRole(
      staff({
        is_org_admin: true, // legacy flag set...
        user_capabilities: caps({ is_org_admin: false }), // ...but caps says no
      })
    );

    expect(result.isOrgAdmin).toBe(false);
    expect(result.canAccessAdmin).toBe(false);
  });

  it('doctor-coach: has mentees, gets clinical access and the dashboard, not /doctor', () => {
    const result = deriveUserRole(
      staff({
        is_doctor: true,
        user_capabilities: caps({ is_participant: false }),
        mentee_assignments: [{ doctor_staff_id: 'doctor-2' }],
      })
    );

    expect(result.isDoctorCoach).toBe(true);
    expect(result.canAccessClinical).toBe(true);
    // isDoctor alone would route to /doctor, but doctor-coach is not
    // itself isCoach/isRegional/admin, so it still falls through to the
    // isDoctor branch — doctor-coach status affects clinical access, not routing.
    expect(result.homeRoute).toBe('/doctor');
  });

  it('pure doctor with no mentees is not a doctor-coach and lands on /doctor', () => {
    const result = deriveUserRole(
      staff({
        is_doctor: true,
        user_capabilities: caps({ is_participant: false }),
        mentee_assignments: [],
      })
    );

    expect(result.isDoctorCoach).toBe(false);
    expect(result.canAccessClinical).toBe(false);
    expect(result.homeRoute).toBe('/doctor');
  });

  it('non-participant with no other role still lands on /dashboard, not "/"', () => {
    const result = deriveUserRole(
      staff({
        user_capabilities: caps({ is_participant: false }),
      })
    );

    expect(result.homeRoute).toBe('/dashboard');
  });

  it('can_view_submissions capability alone makes someone a coach even with zero scopes', () => {
    const result = deriveUserRole(
      staff({
        user_capabilities: caps({ can_view_submissions: true }),
        coach_scopes: [],
      })
    );

    expect(result.isCoach).toBe(true);
    expect(result.canAccessAdmin).toBe(true);
  });

  it('null user_capabilities row falls back to all-false capability derivation', () => {
    const result = deriveUserRole(staff({ user_capabilities: null }));

    expect(result.hasCapabilitiesRow).toBe(false);
    expect(result.isSuperAdmin).toBe(false);
    expect(result.isOrgAdmin).toBe(false);
    expect(result.isParticipant).toBe(false);
    expect(result.canAccessAdmin).toBe(false);
  });
});
