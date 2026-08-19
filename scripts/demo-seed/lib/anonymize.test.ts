import { describe, it, expect } from 'vitest';
import {
  assignCast,
  selectParticipant,
  selectCoach,
  selectAdmin,
  fullName,
  containsAnySourceIdentity,
  buildDemoStaffDraft,
  assignLocationRoundRobin,
  type SourceStaffRow,
  type PersonaCandidate,
} from './anonymize';
import { CAST, type CastMember } from '../cast';

const cast: CastMember[] = [
  { firstName: 'Jamie', lastName: 'Ellison', email: 'demo-staff@bluebird.demo', loginRole: 'participant' },
  { firstName: 'Morgan', lastName: 'Castillo', email: 'demo-coach@bluebird.demo', loginRole: 'coach' },
  { firstName: 'Devon', lastName: 'Ashworth', email: 'demo-admin@bluebird.demo', loginRole: 'admin' },
  { firstName: 'Priya', lastName: 'Sundaram', email: 'priya@bluebird.demo' },
  { firstName: 'Lucas', lastName: 'Ferreira', email: 'lucas@bluebird.demo' },
];

function candidate(id: string, overrides: Partial<PersonaCandidate> = {}): PersonaCandidate {
  return { id, roleId: 1, isCoach: false, lastActivity: '2026-08-01', ...overrides };
}

describe('selectParticipant', () => {
  it('picks the eligible candidate with the most recent activity', () => {
    const candidates = [
      candidate('a', { lastActivity: '2026-07-01' }),
      candidate('b', { lastActivity: '2026-08-10' }),
      candidate('c', { lastActivity: '2026-07-20' }),
    ];
    expect(selectParticipant(candidates)).toBe('b');
  });

  it('excludes candidates with no role_id', () => {
    const candidates = [
      candidate('a', { roleId: null, lastActivity: '2026-08-10' }), // most recent but no role
      candidate('b', { lastActivity: '2026-07-01' }),
    ];
    expect(selectParticipant(candidates)).toBe('b');
  });

  it('excludes candidates with no assignment history', () => {
    const candidates = [
      candidate('a', { lastActivity: null }),
      candidate('b', { lastActivity: '2026-07-01' }),
    ];
    expect(selectParticipant(candidates)).toBe('b');
  });

  it('breaks ties deterministically by id', () => {
    const candidates = [
      candidate('bbb', { lastActivity: '2026-08-10' }),
      candidate('aaa', { lastActivity: '2026-08-10' }),
    ];
    expect(selectParticipant(candidates)).toBe('aaa');
  });

  it('hard-fails with a clear message when no candidate has both a role and history', () => {
    const candidates = [
      candidate('a', { roleId: null }),
      candidate('b', { lastActivity: null }),
    ];
    expect(() => selectParticipant(candidates)).toThrow(/no source staff member is suitable/i);
  });

  it('hard-fails on an empty roster', () => {
    expect(() => selectParticipant([])).toThrow();
  });
});

describe('selectCoach', () => {
  it('prefers a candidate who is already a coach, over a more "generic" candidate', () => {
    const candidates = [candidate('a'), candidate('b', { isCoach: true })];
    expect(selectCoach(candidates, [])).toBe('b');
  });

  it('excludes ids already claimed by another persona', () => {
    const candidates = [candidate('a', { isCoach: true }), candidate('b', { isCoach: true })];
    expect(selectCoach(candidates, ['a'])).toBe('b');
  });

  it('falls back to anyone with a role_id when nobody is already a coach', () => {
    const candidates = [candidate('a', { roleId: null }), candidate('b')];
    expect(selectCoach(candidates, [])).toBe('b');
  });

  it('falls back to whoever is left when nobody has a role_id either', () => {
    const candidates = [candidate('a', { roleId: null })];
    expect(selectCoach(candidates, [])).toBe('a');
  });

  it('throws when every candidate is excluded', () => {
    const candidates = [candidate('a')];
    expect(() => selectCoach(candidates, ['a'])).toThrow(/demo-coach/);
  });
});

describe('selectAdmin', () => {
  it('prefers a candidate with a role_id', () => {
    const candidates = [candidate('a', { roleId: null }), candidate('b')];
    expect(selectAdmin(candidates, [])).toBe('b');
  });

  it('excludes ids already claimed by other personas', () => {
    const candidates = [candidate('a'), candidate('b'), candidate('c')];
    expect(selectAdmin(candidates, ['a', 'b'])).toBe('c');
  });

  it('throws when every candidate is excluded', () => {
    const candidates = [candidate('a')];
    expect(() => selectAdmin(candidates, ['a'])).toThrow(/demo-admin/);
  });
});

describe('assignCast', () => {
  it('is deterministic: the same source roster always maps to the same cast members', () => {
    const source = [candidate('bbb'), candidate('aaa'), candidate('ccc')];
    const first = assignCast(source, cast);
    const second = assignCast([...source].reverse(), cast); // input order should not matter
    expect(first).toEqual(second);
  });

  it('assigns the participant/coach/admin logins by suitability, not by id sort order', () => {
    const candidates = [
      candidate('zzz-best-participant', { lastActivity: '2026-08-10' }),
      candidate('aaa-worse-participant', { lastActivity: '2026-01-01' }),
      candidate('mmm-the-coach', { isCoach: true }),
    ];
    const result = assignCast(candidates, cast);
    const bySourceId = new Map(result.map((r) => [r.sourceId, r.cast]));
    // The most recently active candidate gets the participant login, even
    // though its id sorts last -- the old (fixed) behavior would have
    // picked 'aaa-worse-participant' purely because it sorts first.
    expect(bySourceId.get('zzz-best-participant')?.loginRole).toBe('participant');
    expect(bySourceId.get('mmm-the-coach')?.loginRole).toBe('coach');
  });

  it('zips every remaining source staff member with the remaining (non-login) cast, sorted by id', () => {
    // 5 otherwise-identical candidates: 3 get claimed as the participant/
    // coach/admin logins (deterministically, by tie-break on id), leaving
    // 2 "remaining" ones to zip with the 2 non-login cast members.
    const candidates = [
      candidate('eee'),
      candidate('ddd'),
      candidate('ccc'),
      candidate('bbb'),
      candidate('aaa'),
    ];
    const result = assignCast(candidates, cast);
    const remaining = result.filter((r) => !r.cast.loginRole);
    expect(remaining.map((r) => r.sourceId)).toEqual(['ddd', 'eee']);
  });

  it('never assigns the same cast member to two different source staff', () => {
    const candidates = [candidate('a'), candidate('b'), candidate('c'), candidate('d')];
    const result = assignCast(candidates, cast);
    const emails = result.map((r) => r.cast.email);
    expect(new Set(emails).size).toBe(emails.length);
  });

  it('throws a descriptive error when the roster is bigger than the cast list', () => {
    const tooMany = Array.from({ length: 10 }, (_, i) => candidate(`id-${i}`));
    expect(() => assignCast(tooMany, cast)).toThrow(/cast\.ts/);
  });

  it('the real cast list in the repo has at least 12 entries', () => {
    expect(CAST.length).toBeGreaterThanOrEqual(12);
  });

  it('the real cast list has exactly one participant, one coach, and one admin login', () => {
    const byRole = CAST.filter((c) => c.loginRole).map((c) => c.loginRole);
    expect(byRole.sort()).toEqual(['admin', 'coach', 'participant']);
  });

  it('a realistic roster (mixed roles, one real coach, varied activity) resolves without throwing', () => {
    const candidates = [
      candidate('s1', { roleId: 2, lastActivity: '2026-08-03' }),
      candidate('s2', { roleId: 2, isCoach: true, lastActivity: '2026-07-27' }),
      candidate('s3', { roleId: null, lastActivity: null }),
      candidate('s4', { roleId: 1, lastActivity: '2026-08-10' }),
      candidate('s5', { roleId: 3, lastActivity: null }),
    ];
    const result = assignCast(candidates, [...cast, { firstName: 'Naomi', lastName: 'Whitfield', email: 'naomi@bluebird.demo' }]);
    expect(result).toHaveLength(5);
    const participant = result.find((r) => r.cast.loginRole === 'participant');
    expect(participant?.sourceId).toBe('s4'); // most recent activity among role-holders
    const coach = result.find((r) => r.cast.loginRole === 'coach');
    expect(coach?.sourceId).toBe('s2'); // the real coach
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
    const draft = buildDemoStaffDraft(source, cast[3], 'loc-1');
    expect(draft.name).not.toBe(source.name);
    expect(draft.email).not.toBe(source.email);
    expect(containsAnySourceIdentity(draft.name, [source.name], [source.email])).toBe(false);
    expect(containsAnySourceIdentity(draft.email, [source.name], [source.email])).toBe(false);
  });

  it('uses the cast name and email verbatim', () => {
    const draft = buildDemoStaffDraft(source, cast[3], 'loc-1');
    expect(draft.name).toBe(fullName(cast[3]));
    expect(draft.email).toBe(cast[3].email);
  });

  it('copies structural flags from the source row via the allowlist', () => {
    const draft = buildDemoStaffDraft(source, cast[3], 'loc-1');
    expect(draft.role_id).toBe(7);
    expect(draft.hire_date).toBe('2022-03-01');
    expect(draft.is_lead).toBe(true);
    expect(draft.is_coach).toBe(true);
  });

  it('never grants super admin, even when copying a coach/lead row', () => {
    const draft = buildDemoStaffDraft(source, cast[3], 'loc-1');
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
    const draft = buildDemoStaffDraft(source, cast[3], 'loc-1'); // cast[3] has no loginRole
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
