import { describe, it, expect } from 'vitest';
import {
  groupRecipientsByLocation, isGroupFullyIncluded, isEveryoneIncluded,
  toggleDoctorExclusion, toggleGroupExclusion, toggleAllExclusion,
  deriveIncludedCount, buildSendingSummary, deriveExclusionIds,
  type RecipientLocationGroup,
} from './leadWeekBlastRecipients';
import type { LeadWeekBlastRecipient } from '@/types/leadWeekBlasts';

function r(staff_id: string, name: string, location_name: string | null): LeadWeekBlastRecipient {
  return { staff_id, name, location_name };
}

const mixedCohort: LeadWeekBlastRecipient[] = [
  r('d1', 'Dr. Adams', 'Downtown'),
  r('d2', 'Dr. Baker', 'Downtown'),
  r('d3', 'Dr. Chen', 'Uptown'),
  r('d4', 'Dr. Diaz', null),
];

describe('groupRecipientsByLocation', () => {
  it('groups doctors under their location name', () => {
    const groups = groupRecipientsByLocation(mixedCohort);
    const downtown = groups.find((g) => g.label === 'Downtown');
    expect(downtown?.doctors.map((d) => d.staff_id)).toEqual(['d1', 'd2']);
  });

  it('puts location-less doctors under a Roaming group', () => {
    const groups = groupRecipientsByLocation(mixedCohort);
    const roaming = groups.find((g) => g.label === 'Roaming');
    expect(roaming?.doctors.map((d) => d.staff_id)).toEqual(['d4']);
  });

  it('lists named locations alphabetically with Roaming last', () => {
    const groups = groupRecipientsByLocation(mixedCohort);
    expect(groups.map((g) => g.label)).toEqual(['Downtown', 'Uptown', 'Roaming']);
  });

  it('handles a roaming-only cohort with a single Roaming group', () => {
    const groups = groupRecipientsByLocation([r('d1', 'Dr. Adams', null), r('d2', 'Dr. Baker', null)]);
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe('Roaming');
    expect(groups[0].doctors).toHaveLength(2);
  });

  it('handles a single-location cohort with no Roaming group', () => {
    const groups = groupRecipientsByLocation([r('d1', 'Dr. Adams', 'Downtown'), r('d2', 'Dr. Baker', 'Downtown')]);
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe('Downtown');
  });

  it('returns no groups for an empty cohort', () => {
    expect(groupRecipientsByLocation([])).toEqual([]);
  });
});

describe('isGroupFullyIncluded / isEveryoneIncluded', () => {
  const groups = groupRecipientsByLocation(mixedCohort);
  const downtown = groups.find((g) => g.label === 'Downtown')!;

  it('reads true when the excluded set is empty (fresh open)', () => {
    expect(isGroupFullyIncluded(new Set(), downtown)).toBe(true);
    expect(isEveryoneIncluded(new Set(), mixedCohort)).toBe(true);
  });

  it('reads false for a group once any member is excluded', () => {
    expect(isGroupFullyIncluded(new Set(['d1']), downtown)).toBe(false);
  });

  it('reads false for everyone once any single doctor is excluded', () => {
    expect(isEveryoneIncluded(new Set(['d4']), mixedCohort)).toBe(false);
  });

  it('reads false for everyone once every doctor is excluded', () => {
    const allIds = new Set(mixedCohort.map((d) => d.staff_id));
    expect(isEveryoneIncluded(allIds, mixedCohort)).toBe(false);
  });
});

describe('toggleDoctorExclusion', () => {
  it('excludes a doctor who was included', () => {
    const next = toggleDoctorExclusion(new Set(), 'd1');
    expect(next.has('d1')).toBe(true);
  });

  it('re-includes a doctor who was excluded', () => {
    const next = toggleDoctorExclusion(new Set(['d1']), 'd1');
    expect(next.has('d1')).toBe(false);
  });

  it('does not mutate the set it was given', () => {
    const original = new Set<string>();
    toggleDoctorExclusion(original, 'd1');
    expect(original.has('d1')).toBe(false);
  });
});

describe('toggleGroupExclusion', () => {
  const groups = groupRecipientsByLocation(mixedCohort);
  const downtown = groups.find((g) => g.label === 'Downtown')!;

  it('excludes every doctor in the group when the group is fully included', () => {
    const next = toggleGroupExclusion(new Set(), downtown);
    expect(next.has('d1')).toBe(true);
    expect(next.has('d2')).toBe(true);
    expect(next.has('d3')).toBe(false); // other group untouched
  });

  it('re-includes every doctor in the group when any member was excluded', () => {
    const next = toggleGroupExclusion(new Set(['d1', 'd2']), downtown);
    expect(next.has('d1')).toBe(false);
    expect(next.has('d2')).toBe(false);
  });

  it('re-includes the whole group even if only one member was excluded', () => {
    const next = toggleGroupExclusion(new Set(['d1']), downtown);
    expect(next.has('d1')).toBe(false);
    expect(next.has('d2')).toBe(false);
  });
});

describe('toggleAllExclusion', () => {
  it('excludes everyone when everyone is currently included', () => {
    const next = toggleAllExclusion(new Set(), mixedCohort);
    expect(next.size).toBe(mixedCohort.length);
  });

  it('includes everyone again when anyone is currently excluded', () => {
    const next = toggleAllExclusion(new Set(['d4']), mixedCohort);
    expect(next.size).toBe(0);
  });

  it('includes everyone again from an all-excluded state', () => {
    const allIds = new Set(mixedCohort.map((d) => d.staff_id));
    const next = toggleAllExclusion(allIds, mixedCohort);
    expect(next.size).toBe(0);
  });
});

describe('deriveIncludedCount', () => {
  it('subtracts exclusions from the total', () => {
    expect(deriveIncludedCount(10, 3)).toBe(7);
  });

  it('never reads negative even with malformed inputs', () => {
    expect(deriveIncludedCount(2, 5)).toBe(0);
  });

  it('is the full total when nothing is excluded', () => {
    expect(deriveIncludedCount(4, 0)).toBe(4);
  });
});

describe('buildSendingSummary', () => {
  it('reports N of M with plural doctors', () => {
    expect(buildSendingSummary(5, 2)).toBe('Sending to 3 of 5 doctors');
  });

  it('uses the singular for a total of exactly one', () => {
    expect(buildSendingSummary(1, 0)).toBe('Sending to 1 of 1 doctor');
  });

  it('reports zero included when everyone is excluded', () => {
    expect(buildSendingSummary(4, 4)).toBe('Sending to 0 of 4 doctors');
  });
});

describe('deriveExclusionIds', () => {
  it('returns an empty array for an empty set', () => {
    expect(deriveExclusionIds(new Set())).toEqual([]);
  });

  it('returns every excluded id', () => {
    expect(deriveExclusionIds(new Set(['d1', 'd4']))).toEqual(['d1', 'd4']);
  });
});
