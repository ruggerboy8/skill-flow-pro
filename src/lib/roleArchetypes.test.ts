import { describe, it, expect } from 'vitest';
import { isAssignableRoleOption, getArchetype, DISPLAY_ONLY_ROLE_ARCHETYPES } from './roleArchetypes';

// role-picker-trap ticket (2026-09): invite/edit-user flows must never offer
// "Lead Dental Assistant" (archetype_code = 'lead_dental_assistant') as a
// selectable role, because the weekly planner never builds assignments for
// it. A staff member created with that role_id gets zero weekly Pro Moves
// forever. The correct config is the base role + staff.is_lead = true.

describe('isAssignableRoleOption', () => {
  it('excludes the lead_dental_assistant archetype', () => {
    expect(isAssignableRoleOption({ archetype_code: 'lead_dental_assistant' })).toBe(false);
  });

  it('excludes every archetype listed in DISPLAY_ONLY_ROLE_ARCHETYPES', () => {
    for (const code of DISPLAY_ONLY_ROLE_ARCHETYPES) {
      expect(isAssignableRoleOption({ archetype_code: code })).toBe(false);
    }
  });

  it('includes an ordinary role like dental_assistant', () => {
    expect(isAssignableRoleOption({ archetype_code: 'dental_assistant' })).toBe(true);
  });

  it('includes other non-lead archetypes (doctor, front_desk, etc.)', () => {
    expect(isAssignableRoleOption({ archetype_code: 'doctor' })).toBe(true);
    expect(isAssignableRoleOption({ archetype_code: 'front_desk' })).toBe(true);
    expect(isAssignableRoleOption({ archetype_code: 'practice_manager' })).toBe(true);
    expect(isAssignableRoleOption({ archetype_code: 'treatment_coordinator' })).toBe(true);
    expect(isAssignableRoleOption({ archetype_code: 'hygienist' })).toBe(true);
  });

  it('treats a missing archetype_code as assignable rather than hiding it', () => {
    expect(isAssignableRoleOption({ archetype_code: null })).toBe(true);
    expect(isAssignableRoleOption({ archetype_code: undefined })).toBe(true);
    expect(isAssignableRoleOption({})).toBe(true);
  });

  it('filters a mixed roles list down to only assignable options', () => {
    const roles = [
      { role_id: 2, archetype_code: 'dental_assistant' },
      { role_id: 11, archetype_code: 'lead_dental_assistant' },
      { role_id: 12, archetype_code: 'lead_dental_assistant' },
      { role_id: 4, archetype_code: 'doctor' },
    ];
    expect(roles.filter(isAssignableRoleOption).map((r) => r.role_id)).toEqual([2, 4]);
  });
});

describe('getArchetype (sanity check the archetype backing this rule stays intact)', () => {
  it('lead_dental_assistant has no planner tab, which is why it must not be an assignable role_id', () => {
    expect(getArchetype('lead_dental_assistant')?.hasPlannerTab).toBe(false);
  });
});
