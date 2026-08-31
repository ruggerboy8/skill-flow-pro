import { describe, expect, it } from 'vitest';

import { mergeAssignmentEras } from './mergeAssignmentEras';

function row(role_id: number, week_start_date: string, display_order: number, id?: string) {
  return { role_id, week_start_date, display_order, id: id ?? `${role_id}-${week_start_date}-${display_order}` };
}

describe('mergeAssignmentEras', () => {
  it('keeps both eras when they cover different weeks', () => {
    const loc = [row(2, '2026-01-05', 1), row(2, '2026-01-05', 2)];
    const org = [row(2, '2026-03-02', 1), row(3, '2026-03-02', 1)];
    const result = mergeAssignmentEras(loc, org, '2026-08-17');
    expect(result.merged).toHaveLength(4);
    expect(result.locationKept).toBe(2);
    expect(result.orgKept).toBe(2);
    expect(result.droppedFuture).toBe(0);
    expect(result.droppedOverlap).toBe(0);
  });

  it('drops org-level rows for a (role, week) the location era already covers', () => {
    const loc = [row(2, '2026-01-05', 1, 'loc-a')];
    const org = [
      row(2, '2026-01-05', 1, 'org-a'), // same role+week -> dropped
      row(2, '2026-01-05', 4, 'org-b'), // same role+week, different slot -> still dropped
      row(3, '2026-01-05', 1, 'org-c'), // different role -> kept
    ];
    const result = mergeAssignmentEras(loc, org, '2026-08-17');
    expect(result.merged.map((r) => r.id)).toEqual(['loc-a', 'org-c']);
    expect(result.droppedOverlap).toBe(2);
  });

  it('drops rows after the cap Monday from both eras', () => {
    const loc = [row(2, '2026-08-24', 1, 'loc-future')];
    const org = [row(2, '2026-08-17', 1, 'org-current'), row(2, '2026-08-24', 1, 'org-future')];
    const result = mergeAssignmentEras(loc, org, '2026-08-17');
    expect(result.merged.map((r) => r.id)).toEqual(['org-current']);
    expect(result.droppedFuture).toBe(2);
  });

  it('keeps a row landing exactly on the cap Monday', () => {
    const org = [row(2, '2026-08-17', 1, 'org-current')];
    const result = mergeAssignmentEras([], org, '2026-08-17');
    expect(result.merged).toHaveLength(1);
  });

  it('sorts deterministically: week, role, display_order', () => {
    const loc = [row(4, '2026-02-02', 2, 'd'), row(4, '2026-02-02', 1, 'c')];
    const org = [row(2, '2026-03-02', 1, 'e'), row(1, '2026-01-05', 1, 'a'), row(2, '2026-01-05', 1, 'b')];
    const result = mergeAssignmentEras(loc, org, '2026-08-17');
    expect(result.merged.map((r) => r.id)).toEqual(['a', 'b', 'c', 'd', 'e']);
    // Same inputs, shuffled -> same output.
    const shuffled = mergeAssignmentEras([...loc].reverse(), [...org].reverse(), '2026-08-17');
    expect(shuffled.merged.map((r) => r.id)).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('works with an empty location era (a source location fully on org-level assignments)', () => {
    const org = [row(2, '2026-06-01', 1, 'x'), row(2, '2026-06-08', 1, 'y')];
    const result = mergeAssignmentEras([], org, '2026-08-17');
    expect(result.merged.map((r) => r.id)).toEqual(['x', 'y']);
    expect(result.locationKept).toBe(0);
    expect(result.orgKept).toBe(2);
  });
});
