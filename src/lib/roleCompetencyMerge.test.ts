import { describe, it, expect } from 'vitest';
import { mergeLeadCompetencies, MergeableCompetency } from './roleCompetencyMerge';

type Move = { action_id: number };
type Comp = MergeableCompetency<Move>;

const BASE_ROLE = 1;
const LEAD_ROLE = 2;

function comp(
  id: number,
  roleId: number | null,
  title: string,
  actionIds: number[]
): Comp {
  return {
    competency_id: id,
    role_id: roleId,
    title,
    proMoves: actionIds.map((action_id) => ({ action_id })),
  };
}

describe('mergeLeadCompetencies', () => {
  it('merges lead pro moves into a same-named base competency', () => {
    const result = mergeLeadCompetencies(
      [
        comp(1, BASE_ROLE, 'Patient Communication', [10, 11]),
        comp(2, LEAD_ROLE, 'Patient Communication', [11, 12]),
      ],
      BASE_ROLE
    );

    expect(result).toHaveLength(1);
    const actionIds = result[0].proMoves.map((m) => m.action_id);
    expect(actionIds).toEqual([10, 11, 12]); // deduped, 12 folded in
  });

  it('matches titles case-insensitively and ignores whitespace', () => {
    const result = mergeLeadCompetencies(
      [
        comp(1, BASE_ROLE, 'Patient Communication', [10]),
        comp(2, LEAD_ROLE, '  patient communication  ', [11]),
      ],
      BASE_ROLE
    );

    expect(result).toHaveLength(1);
    expect(result[0].proMoves.map((m) => m.action_id)).toEqual([10, 11]);
  });

  it('keeps lead-exclusive competencies (no base match) as their own entry', () => {
    const result = mergeLeadCompetencies(
      [
        comp(1, BASE_ROLE, 'Patient Communication', [10]),
        comp(2, LEAD_ROLE, 'Team Leadership', [20]),
      ],
      BASE_ROLE
    );

    expect(result).toHaveLength(2);
    expect(result.map((c) => c.title)).toEqual([
      'Patient Communication',
      'Team Leadership',
    ]);
  });

  it('drops competencies with zero pro moves after merge', () => {
    const result = mergeLeadCompetencies(
      [
        comp(1, BASE_ROLE, 'Patient Communication', [10]),
        comp(2, BASE_ROLE, 'Empty Skill', []),
      ],
      BASE_ROLE
    );

    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Patient Communication');
  });

  it('strips role_id from the output', () => {
    const result = mergeLeadCompetencies(
      [comp(1, BASE_ROLE, 'Patient Communication', [10])],
      BASE_ROLE
    );

    expect(result[0]).not.toHaveProperty('role_id');
  });

  it('handles baseRoleId being null', () => {
    const result = mergeLeadCompetencies(
      [
        comp(1, null, 'Patient Communication', [10]),
        comp(2, LEAD_ROLE, 'Patient Communication', [11]),
      ],
      null
    );

    expect(result).toHaveLength(1);
    expect(result[0].proMoves.map((m) => m.action_id)).toEqual([10, 11]);
  });

  it('handles baseRoleId being undefined (no merge, just filter empties)', () => {
    const result = mergeLeadCompetencies(
      [
        comp(1, BASE_ROLE, 'Patient Communication', [10]),
        comp(2, LEAD_ROLE, 'Team Leadership', [20]),
        comp(3, BASE_ROLE, 'Empty', []),
      ],
      undefined
    );

    // undefined baseRoleId means nothing matches as base, so nothing merges,
    // but empty competencies still get filtered out
    expect(result).toHaveLength(2);
  });

  it('returns empty array when given empty input', () => {
    expect(mergeLeadCompetencies([], BASE_ROLE)).toEqual([]);
  });
});
