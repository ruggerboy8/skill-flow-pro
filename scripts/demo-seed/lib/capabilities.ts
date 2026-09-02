/**
 * user_capabilities row construction for demo staff.
 *
 * The app has been CAPS-ONLY since 2026-07-25 (simplification roadmap 1.3):
 * src/hooks/deriveUserRole.ts reads permissions exclusively from
 * user_capabilities (+ coach_scopes for the coach persona), never from the
 * legacy staff.is_* flags. A staff row without a capabilities row renders as
 * a permissionless user -- demo-staff would not even count as a participant.
 *
 * The formula here mirrors the 2026-07-24 backfill migration
 * (supabase/migrations/20260724120000_backfill_user_capabilities.sql)
 * EXACTLY, applied to the demo staff draft's flags instead of a live row.
 * Since buildDemoStaffDraft pins is_super_admin to false for every copied
 * row, no demo row can ever come out of this with platform-admin anything.
 */

export interface CapabilitySourceFlags {
  is_participant: boolean;
  participation_start_at: string | null;
  is_coach: boolean;
  is_org_admin: boolean;
  is_super_admin: boolean;
}

export interface UserCapabilityRow {
  staff_id: string;
  is_participant: boolean;
  participation_start_at: string | null;
  can_view_submissions: boolean;
  can_submit_evals: boolean;
  can_review_evals: boolean;
  can_invite_users: boolean;
  can_manage_library: boolean;
  can_manage_locations: boolean;
  can_manage_users: boolean;
  can_manage_assignments: boolean;
  is_org_admin: boolean;
  is_platform_admin: boolean;
}

export function buildCapabilityRow(staffId: string, flags: CapabilitySourceFlags): UserCapabilityRow {
  const coachLevel = flags.is_coach || flags.is_org_admin || flags.is_super_admin;
  const adminLevel = flags.is_org_admin || flags.is_super_admin;

  return {
    staff_id: staffId,
    is_participant: flags.is_participant,
    participation_start_at: flags.participation_start_at,
    can_view_submissions: coachLevel,
    can_submit_evals: coachLevel,
    can_review_evals: adminLevel,
    can_invite_users: adminLevel,
    can_manage_library: flags.is_super_admin,
    can_manage_locations: adminLevel,
    can_manage_users: adminLevel,
    can_manage_assignments: adminLevel,
    is_org_admin: flags.is_org_admin,
    is_platform_admin: flags.is_super_admin,
  };
}
