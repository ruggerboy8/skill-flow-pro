import { describe, it, expect } from 'vitest';
import {
  assignCast,
  fullName,
  containsAnySourceIdentity,
  buildDemoStaffDraft,
  assignLocationRoundRobin,
  type SourceStaffRow,
} from './anonymize';
import { CAST, type CastMember } from '../cast';

const cast: CastMember[] = [
  { firstName: 'Jamie', lastName: 'Ellison', email: 'demo-staff@bluebird.demo', loginRole: 'participant' },
  { firstName: 'Morgan', lastName: 'Castillo', email: 'demo-coach@bluebird.demo', loginRole: 'coach' },
  { firstName: 'Priya', lastName: 'Sundaram', email: 'priya@bluebird.demo' },
];

describe('assignCast', () => {
  it('is deterministic: the same source ids always map to the same cast members', () => {
    const source = [{ id: 'bbb' }, { id: 'aaa' }, { id: 'ccc' }];
    const first = assignCast(source, cast);
    const second = assignCast([...source].reverse(), cast); // input order should not matter
    expect(first).toEqual(second);
  });

  it('sorts by source id before zipping, so the mapping does not depend on array order', () => {
    const result = assignCast([{ id: 'aaa' }, { id: 'bbb' }], cast);
    expect(result[0]).toEqual({ sourceId: 'aaa', cast: cast[0] });
    expect(result[1]).toEqual({ sourceId: 'bbb', cast: cast[1] });
  });

  it('throws a descriptive error when the roster is bigger than the cast list', () => {
    const tooMany = Array.from({ length: 10 }, (_, i) => ({ id: `id-${i}` }));
    expect(() => assignCast(tooMany, cast)).toThrow(/cast\.ts/);
  });

  it('the real cast list in the repo has at least 12 entries', () => {
    expect(CAST.length).toBeGreaterThanOrEqual(12);
  });

  it('the real cast list has exactly one participant, one coach, and one admin login', () => {
    const byRole = CAST.filter((c) => c.loginRole).map((c) => c.loginRole);
    expect(byRole.sort()).toEqual(['admin', 'coach', 'participant']);
  });
});

describe('containsAnySourceIdentity', () => {
  const sourceNames = ['Kelly Acuna', 'Sam Rivera'];
  const sourceEmails = ['kelly.acuna@alcandental.example'];

  it('detects a real name embedded in text', () => {
    expect(containsAnySourceIdentity('Note: Kelly Acuna submitted late', sourceNames, sourceEmails)).toBe(
      true,
    );
  });

  it('detects a real email embedded in text', () => {
    expect(
      containsAnySourceIdentity('contact kelly.acuna@alcandental.example please', sourceNames, sourceEmails),
    ).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(containsAnySourceIdentity('KELLY ACUNA', sourceNames, sourceEmails)).toBe(true);
  });

  it('returns false for fictional cast text with no overlap', () => {
    expect(containsAnySourceIdentity('Jamie Ellison, demo-staff@bluebird.demo', sourceNames, sourceEmails)).toBe(
      false,
    );
  });
});

describe('buildDemoStaffDraft', () => {
  const source: SourceStaffRow = {
    id: 'src-1',
    name: 'Kelly Acuna',
    email: 'kelly.acuna@alcandental.example',
    role_id: 7,
    hire_date: '2022-03-01',
    is_coach: true,
    is_doctor: false,
    is_lead: true,
    is_office_manager: false,
    is_participant: true,
    participation_start_at: '2022-03-08',
  };

  it('never carries the source name or email through, regardless of allowlist bugs elsewhere', () => {
    const draft = buildDemoStaffDraft(source, cast[2], 'loc-1');
    expect(draft.name).not.toBe(source.name);
    expect(draft.email).not.toBe(source.email);
    expect(containsAnySourceIdentity(draft.name, [source.name], [source.email])).toBe(false);
    expect(containsAnySourceIdentity(draft.email, [source.name], [source.email])).toBe(false);
  });

  it('uses the cast name and email verbatim', () => {
    const draft = buildDemoStaffDraft(source, cast[2], 'loc-1');
    expect(draft.name).toBe(fullName(cast[2]));
    expect(draft.email).toBe(cast[2].email);
  });

  it('copies structural flags from the source row via the allowlist', () => {
    const draft = buildDemoStaffDraft(source, cast[2], 'loc-1');
    expect(draft.role_id).toBe(7);
    expect(draft.hire_date).toBe('2022-03-01');
    expect(draft.is_lead).toBe(true);
    expect(draft.is_coach).toBe(true);
  });

  it('never grants super admin, even when copying a coach/lead row', () => {
    const draft = buildDemoStaffDraft(source, cast[2], 'loc-1');
    expect(draft.is_super_admin).toBe(false);
  });

  it('forces is_participant true for the participant login regardless of the source flag', () => {
    const notAParticipant: SourceStaffRow = { ...source, is_participant: false };
    const draft = buildDemoStaffDraft(notAParticipant, cast[0], 'loc-1'); // cast[0] = participant login
    expect(draft.is_participant).toBe(true);
  });

  it('forces is_coach true and is_org_admin false for the coach login regardless of the source flags', () => {
    const notACoach: SourceStaffRow = { ...source, is_coach: false };
    const draft = buildDemoStaffDraft(notACoach, cast[1], 'loc-1'); // cast[1] = coach login
    expect(draft.is_coach).toBe(true);
    expect(draft.is_org_admin).toBe(false);
  });

  it('does not grant org admin or coach to a plain cast member with no loginRole', () => {
    const draft = buildDemoStaffDraft(source, cast[2], 'loc-1'); // cast[2] has no loginRole
    expect(draft.is_org_admin).toBe(false);
    // is_coach still reflects the copied source flag (true here) since no login override applies
    expect(draft.is_coach).toBe(true);
  });
});

describe('assignLocationRoundRobin', () => {
  it('spreads staff evenly across locations in round-robin order', () => {
    const staff = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }, { id: 'e' }];
    const locations = ['loc-1', 'loc-2', 'loc-3'];
    const map = assignLocationRoundRobin(staff, locations);
    expect(map.get('a')).toBe('loc-1');
    expect(map.get('b')).toBe('loc-2');
    expect(map.get('c')).toBe('loc-3');
    expect(map.get('d')).toBe('loc-1');
    expect(map.get('e')).toBe('loc-2');
  });

  it('is deterministic regardless of input array order', () => {
    const locations = ['loc-1', 'loc-2', 'loc-3'];
    const forward = assignLocationRoundRobin([{ id: 'a' }, { id: 'b' }, { id: 'c' }], locations);
    const shuffled = assignLocationRoundRobin([{ id: 'c' }, { id: 'a' }, { id: 'b' }], locations);
    expect(Object.fromEntries(forward)).toEqual(Object.fromEntries(shuffled));
  });

  it('throws when given no locations', () => {
    expect(() => assignLocationRoundRobin([{ id: 'a' }], [])).toThrow();
  });

  it('every location ends up with at least one staff member when staff >= locations', () => {
    const staff = Array.from({ length: 9 }, (_, i) => ({ id: `s-${i}` }));
    const locations = ['loc-1', 'loc-2', 'loc-3'];
    const map = assignLocationRoundRobin(staff, locations);
    const usedLocations = new Set(map.values());
    expect(usedLocations.size).toBe(3);
  });
});
