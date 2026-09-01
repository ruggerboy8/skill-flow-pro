import { describe, it, expect } from 'vitest';
import { buildRequiredAssignmentsResolver, type RequiredMoveAssignment } from './requiredMoves';

const ORG_A = 'org-a';
const ORG_B = 'org-b';
const LOC_1 = 'loc-1';
const LOC_2 = 'loc-2';
const orgMap = new Map([
  ['group-1', ORG_A],
  ['group-2', ORG_B],
]);

let nextId = 0;
function assignment(overrides: Partial<RequiredMoveAssignment> = {}): RequiredMoveAssignment {
  return { id: `a${++nextId}`, role_id: 1, org_id: ORG_A, location_id: null, ...overrides };
}

describe('buildRequiredAssignmentsResolver', () => {
  it('returns the assignment keys, in weekly_scores "assign:<id>" format', () => {
    const resolve = buildRequiredAssignmentsResolver([assignment({ id: 'abc' })], orgMap);
    const set = resolve({ role_id: 1, location_id: LOC_1, group_id: 'group-1' });
    expect([...set]).toEqual(['assign:abc']);
  });

  it('counts org-scoped assignments for staff whose group belongs to that org', () => {
    const resolve = buildRequiredAssignmentsResolver(
      [assignment(), assignment(), assignment()],
      orgMap,
    );
    expect(resolve({ role_id: 1, location_id: LOC_1, group_id: 'group-1' }).size).toBe(3);
  });

  it('does not leak one org\'s assignments into another org\'s staff', () => {
    const resolve = buildRequiredAssignmentsResolver([assignment()], orgMap);
    expect(resolve({ role_id: 1, location_id: LOC_2, group_id: 'group-2' }).size).toBe(0);
  });

  it('matches on role: a different role owes nothing from these assignments', () => {
    const resolve = buildRequiredAssignmentsResolver([assignment()], orgMap);
    expect(resolve({ role_id: 2, location_id: LOC_1, group_id: 'group-1' }).size).toBe(0);
  });

  it('location-scoped assignments count only for that location', () => {
    const resolve = buildRequiredAssignmentsResolver(
      [assignment({ org_id: null, location_id: LOC_1 })],
      orgMap,
    );
    expect(resolve({ role_id: 1, location_id: LOC_1, group_id: 'group-1' }).size).toBe(1);
    expect(resolve({ role_id: 1, location_id: LOC_2, group_id: 'group-1' }).size).toBe(0);
  });

  it('platform-global assignments (no org, no location) count for everyone with the role', () => {
    const resolve = buildRequiredAssignmentsResolver(
      [assignment({ org_id: null, location_id: null })],
      orgMap,
    );
    expect(resolve({ role_id: 1, location_id: LOC_1, group_id: 'group-1' }).size).toBe(1);
    expect(resolve({ role_id: 1, location_id: LOC_2, group_id: 'group-2' }).size).toBe(1);
  });

  it('returns an empty set (owes nothing) when no assignments were published, the Avenue Dental case', () => {
    const resolve = buildRequiredAssignmentsResolver([], orgMap);
    expect(resolve({ role_id: 1, location_id: LOC_1, group_id: 'group-1' }).size).toBe(0);
  });

  it('a staff member whose group has no known org still matches location and global scopes', () => {
    const resolve = buildRequiredAssignmentsResolver(
      [
        assignment({ org_id: null, location_id: LOC_1 }),
        assignment({ org_id: null, location_id: null }),
        assignment(), // org-scoped, must NOT match an unknown org
      ],
      new Map(),
    );
    expect(resolve({ role_id: 1, location_id: LOC_1, group_id: 'group-x' }).size).toBe(2);
  });

  it('numeric ids stringify into the same key format', () => {
    const resolve = buildRequiredAssignmentsResolver([assignment({ id: 42 })], orgMap);
    const set = resolve({ role_id: 1, location_id: LOC_1, group_id: 'group-1' });
    expect(set.has('assign:42')).toBe(true);
  });
});
