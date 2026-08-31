import { describe, it, expect } from 'vitest';
import { findScoredSlotsBlockingSave, type ExistingAssignmentSlot } from './assignmentScoreGuard';

describe('findScoredSlotsBlockingSave', () => {
  it('returns an empty array when no existing rows are present', () => {
    expect(findScoredSlotsBlockingSave([], new Set())).toEqual([]);
  });

  it('returns an empty array when existing rows have no scores', () => {
    const rows: ExistingAssignmentSlot[] = [
      { id: 'a1', display_order: 1 },
      { id: 'a2', display_order: 2 },
    ];
    expect(findScoredSlotsBlockingSave(rows, new Set())).toEqual([]);
  });

  it('blocks a single scored slot', () => {
    const rows: ExistingAssignmentSlot[] = [
      { id: 'a1', display_order: 1 },
      { id: 'a2', display_order: 2 },
      { id: 'a3', display_order: 3 },
    ];
    const scored = new Set(['assign:a2']);
    expect(findScoredSlotsBlockingSave(rows, scored)).toEqual([2]);
  });

  it('blocks multiple scored slots, sorted ascending', () => {
    const rows: ExistingAssignmentSlot[] = [
      { id: 'a1', display_order: 1 },
      { id: 'a2', display_order: 2 },
      { id: 'a3', display_order: 3 },
    ];
    const scored = new Set(['assign:a3', 'assign:a1']);
    expect(findScoredSlotsBlockingSave(rows, scored)).toEqual([1, 3]);
  });

  it('ignores scored assignment ids that do not correspond to any existing row', () => {
    const rows: ExistingAssignmentSlot[] = [{ id: 'a1', display_order: 1 }];
    const scored = new Set(['assign:some-other-id']);
    expect(findScoredSlotsBlockingSave(rows, scored)).toEqual([]);
  });

  it('never duplicates a display_order even if the same slot id appears more than once', () => {
    const rows: ExistingAssignmentSlot[] = [
      { id: 'a1', display_order: 1 },
      { id: 'a1', display_order: 1 },
    ];
    const scored = new Set(['assign:a1']);
    expect(findScoredSlotsBlockingSave(rows, scored)).toEqual([1]);
  });
});
