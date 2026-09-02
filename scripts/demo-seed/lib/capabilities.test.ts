import { describe, expect, it } from 'vitest';
import { buildCapabilityRow, type CapabilitySourceFlags } from './capabilities';

const base: CapabilitySourceFlags = {
  is_participant: false,
  participation_start_at: null,
  is_coach: false,
  is_org_admin: false,
  is_super_admin: false,
};

describe('buildCapabilityRow', () => {
  it('plain participant: participant flag only, no permissions', () => {
    const row = buildCapabilityRow('id-1', {
      ...base,
      is_participant: true,
      participation_start_at: '2025-07-21T00:00:00Z',
    });
    expect(row).toEqual({
      staff_id: 'id-1',
      is_participant: true,
      participation_start_at: '2025-07-21T00:00:00Z',
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
    });
  });

  it('coach login: submissions + evals, nothing admin-level', () => {
    const row = buildCapabilityRow('id-2', { ...base, is_coach: true });
    expect(row.can_view_submissions).toBe(true);
    expect(row.can_submit_evals).toBe(true);
    expect(row.can_review_evals).toBe(false);
    expect(row.can_manage_users).toBe(false);
    expect(row.is_org_admin).toBe(false);
    expect(row.is_platform_admin).toBe(false);
  });

  it('admin login: org-admin implies every org-level capability, never platform admin', () => {
    const row = buildCapabilityRow('id-3', { ...base, is_org_admin: true });
    expect(row.is_org_admin).toBe(true);
    expect(row.can_view_submissions).toBe(true);
    expect(row.can_submit_evals).toBe(true);
    expect(row.can_review_evals).toBe(true);
    expect(row.can_invite_users).toBe(true);
    expect(row.can_manage_locations).toBe(true);
    expect(row.can_manage_users).toBe(true);
    expect(row.can_manage_assignments).toBe(true);
    // can_manage_library is super-admin only in the backfill formula.
    expect(row.can_manage_library).toBe(false);
    expect(row.is_platform_admin).toBe(false);
  });

  it('never grants platform admin or library management while is_super_admin is false', () => {
    // buildDemoStaffDraft pins is_super_admin false for every copied row, so
    // every real invocation goes through this branch.
    for (const flags of [
      base,
      { ...base, is_participant: true },
      { ...base, is_coach: true },
      { ...base, is_org_admin: true },
      { ...base, is_coach: true, is_org_admin: true, is_participant: true },
    ]) {
      const row = buildCapabilityRow('id-x', flags);
      expect(row.is_platform_admin).toBe(false);
      expect(row.can_manage_library).toBe(false);
    }
  });

  it('mirrors the backfill formula when is_super_admin is true (formula fidelity)', () => {
    const row = buildCapabilityRow('id-4', { ...base, is_super_admin: true });
    expect(row.can_view_submissions).toBe(true);
    expect(row.can_submit_evals).toBe(true);
    expect(row.can_review_evals).toBe(true);
    expect(row.can_manage_library).toBe(true);
    expect(row.is_platform_admin).toBe(true);
    expect(row.is_org_admin).toBe(false);
  });
});
