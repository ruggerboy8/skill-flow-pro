import { describe, it, expect } from 'vitest';
import { buildRequiredCountResolver, type RequiredMoveAssignment } from './requiredMoves';

const ORG_A = 'org-a';
const ORG_B = 'org-b';
const LOC_1 = 'loc-1';
const LOC_2 = 'loc-2';
const orgMap = new Map([
  ['group-1', ORG_A],
  ['group-2', ORG_B],
]);

function assignment(overrides: Partial<RequiredMoveAssignment> = {}): RequiredMoveAssignment {
  return { role_id: 1, org_id: ORG_A, location_id: null, self_select: false, ...overrides };
}

describe('buildRequiredCountResolver', () => {
  it('counts org-scoped assignments for staff whose group belongs to that org', () => {
    const resolve = buildRequiredCountResolver(
      [assignment(), assignment(), assignment()],
      orgMap,
    );
    expect(resolve({ role_id: 1, location_id: LOC_1, group_id: 'group-1' })).toBe(3);
  });

  it('does not leak one org\'s assignments into another org\'s staff', () => {
    const resolve = buildRequiredCountResolver([assignment()], orgMap);
    expect(resolve({ role_id: 1, location_id: LOC_2, group_id: 'group-2' })).toBe(0);
  });

  it('matches on role: a different role owes nothing from these assignments', () => {
    const resolve = buildRequiredCountResolver([assignment()], orgMap);
    expect(resolve({ role_id: 2, location_id: LOC_1, group_id: 'group-1' })).toBe(0);
  });

  it('location-scoped assignments count only for that location', () => {
    const resolve = buildRequiredCountResolver(
      [assignment({ org_id: null, location_id: LOC_1 })],
      orgMap,
    );
    expect(resolve({ role_id: 1, location_id: LOC_1, group_id: 'group-1' })).toBe(1);
    expect(resolve({ role_id: 1, location_id: LOC_2, group_id: 'group-1' })).toBe(0);
  });

  it('platform-global assignments (no org, no location) count for everyone with the role', () => {
    const resolve = buildRequiredCountResolver(
      [assignment({ org_id: null, location_id: null })],
      orgMap,
    );
    expect(resolve({ role_id: 1, location_id: LOC_1, group_id: 'group-1' })).toBe(1);
    expect(resolve({ role_id: 1, location_id: LOC_2, group_id: 'group-2' })).toBe(1);
  });

  it('excludes self-select slots - checked in means every REQUIRED move is rated', () => {
    const resolve = buildRequiredCountResolver(
      [assignment(), assignment({ self_select: true })],
      orgMap,
    );
    expect(resolve({ role_id: 1, location_id: LOC_1, group_id: 'group-1' })).toBe(1);
  });

  it('returns 0 (owes nothing) when no assignments were published, the Avenue Dental case', () => {
    const resolve = buildRequiredCountResolver([], orgMap);
    expect(resolve({ role_id: 1, location_id: LOC_1, group_id: 'group-1' })).toBe(0);
  });

  it('a staff member whose group has no known org still matches location and global scopes', () => {
    const resolve = buildRequiredCountResolver(
      [
        assignment({ org_id: null, location_id: LOC_1 }),
        assignment({ org_id: null, location_id: null }),
        assignment(), // org-scoped, must NOT match an unknown org
      ],
      new Map(),
    );
    expect(resolve({ role_id: 1, location_id: LOC_1, group_id: 'group-x' })).toBe(2);
  });
});
