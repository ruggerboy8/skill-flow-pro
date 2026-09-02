import { describe, it, expect } from 'vitest';
import {
  pickAllowedColumns,
  assertNoFreeTextLeak,
  STAFF_COPY_ALLOWLIST,
  STAFF_FREE_TEXT_COLUMNS,
  WEEKLY_ASSIGNMENTS_COPY_ALLOWLIST,
  WEEKLY_ASSIGNMENTS_FREE_TEXT_COLUMNS,
  WEEKLY_SCORES_COPY_ALLOWLIST,
  WEEKLY_SCORES_FREE_TEXT_COLUMNS,
} from './columnAllowlist';

describe('pickAllowedColumns', () => {
  it('keeps only the listed keys', () => {
    const row = { id: '1', name: 'Real Person', email: 'real@alcan.example', role_id: 4 };
    const picked = pickAllowedColumns(row, ['role_id']);
    expect(picked).toEqual({ role_id: 4 });
    expect(picked).not.toHaveProperty('name');
    expect(picked).not.toHaveProperty('email');
  });

  it('drops keys that are not present on the source row instead of inserting undefined', () => {
    const row = { role_id: 4 };
    const picked = pickAllowedColumns(row as { role_id: number; hire_date?: string }, [
      'role_id',
      'hire_date',
    ]);
    expect(Object.keys(picked)).toEqual(['role_id']);
  });

  it('returns an empty object for an empty allowlist', () => {
    const row = { name: 'Real Person' };
    expect(pickAllowedColumns(row, [])).toEqual({});
  });
});

describe('assertNoFreeTextLeak', () => {
  it('does not throw when the lists are disjoint', () => {
    expect(() => assertNoFreeTextLeak(['role_id', 'hire_date'], ['name', 'email'])).not.toThrow();
  });

  it('throws and names the offending column when a free-text column leaks into the allowlist', () => {
    expect(() => assertNoFreeTextLeak(['role_id', 'email'], ['email'])).toThrow(/email/);
  });

  it('throws with every offending column named when there is more than one', () => {
    expect(() => assertNoFreeTextLeak(['name', 'email', 'role_id'], ['name', 'email'])).toThrow(
      /name.*email|email.*name/,
    );
  });
});

// Regression guard: this is the invariant the spec asks for -- "copy only an
// explicit allowlist of columns; null out anything free-text" -- applied to
// the actual allowlists the seed script uses, not just to synthetic
// examples above. If a future edit adds a free-text column to any of these
// exported allowlists, this test fails.
describe('the real allowlists never include a free-text column', () => {
  it('staff', () => {
    expect(() => assertNoFreeTextLeak(STAFF_COPY_ALLOWLIST, STAFF_FREE_TEXT_COLUMNS)).not.toThrow();
  });

  it('weekly_assignments', () => {
    expect(() =>
      assertNoFreeTextLeak(WEEKLY_ASSIGNMENTS_COPY_ALLOWLIST, WEEKLY_ASSIGNMENTS_FREE_TEXT_COLUMNS),
    ).not.toThrow();
  });

  it('weekly_scores', () => {
    expect(() =>
      assertNoFreeTextLeak(WEEKLY_SCORES_COPY_ALLOWLIST, WEEKLY_SCORES_FREE_TEXT_COLUMNS),
    ).not.toThrow();
  });

  it('name and email are on the staff free-text list (identity must never be "just" free text)', () => {
    expect(STAFF_FREE_TEXT_COLUMNS).toContain('name');
    expect(STAFF_FREE_TEXT_COLUMNS).toContain('email');
  });
});
