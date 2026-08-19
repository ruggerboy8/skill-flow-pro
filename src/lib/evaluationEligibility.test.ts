import { describe, it, expect, afterEach } from 'vitest';
import {
  getPeriodStartDate,
  isEligibleByHireDate,
  computeEligibleStaffIds,
} from './evaluationEligibility';
import type { EvaluationPeriod } from '@/types/analytics';

describe('getPeriodStartDate', () => {
  it('Baseline anchors to Jan 1 of the given year', () => {
    const period: EvaluationPeriod = { type: 'Baseline', year: 2026 };
    expect(getPeriodStartDate(period)).toEqual(new Date(2026, 0, 1));
  });

  it('Q1 starts January 1', () => {
    expect(getPeriodStartDate({ type: 'Quarterly', quarter: 'Q1', year: 2026 })).toEqual(
      new Date(2026, 0, 1)
    );
  });

  it('Q2 starts April 1', () => {
    expect(getPeriodStartDate({ type: 'Quarterly', quarter: 'Q2', year: 2026 })).toEqual(
      new Date(2026, 3, 1)
    );
  });

  it('Q3 starts July 1', () => {
    expect(getPeriodStartDate({ type: 'Quarterly', quarter: 'Q3', year: 2026 })).toEqual(
      new Date(2026, 6, 1)
    );
  });

  it('Q4 starts October 1', () => {
    expect(getPeriodStartDate({ type: 'Quarterly', quarter: 'Q4', year: 2026 })).toEqual(
      new Date(2026, 9, 1)
    );
  });
});

describe('isEligibleByHireDate', () => {
  const q2_2026: EvaluationPeriod = { type: 'Quarterly', quarter: 'Q2', year: 2026 };

  it('hired the day before the period starts is eligible', () => {
    expect(isEligibleByHireDate(new Date(2026, 2, 31), q2_2026)).toBe(true);
  });

  it('hired exactly on the period start date is NOT eligible (must be hired BEFORE)', () => {
    expect(isEligibleByHireDate(new Date(2026, 3, 1), q2_2026)).toBe(false);
  });

  it('hired the day after the period starts is not eligible', () => {
    expect(isEligibleByHireDate(new Date(2026, 3, 2), q2_2026)).toBe(false);
  });

  it('accepts an ISO string hire date and correctly classifies dates well clear of the boundary', () => {
    expect(isEligibleByHireDate('2026-03-25', q2_2026)).toBe(true);
    expect(isEligibleByHireDate('2026-04-08', q2_2026)).toBe(false);
  });

  describe('date-only string on the exact boundary (COR-1)', () => {
    // `staff.hire_date` comes back from Postgres as a date-only string
    // ("2026-04-01"). new Date("2026-04-01") parses that as UTC midnight,
    // while periodStart is built with the local-time constructor, so on the
    // exact boundary day the old code's answer flipped depending on the
    // viewer's timezone offset from UTC. isEligibleByHireDate now parses
    // date-only strings as a plain calendar date instead, so the result no
    // longer depends on the viewer's timezone. These tests pin the correct
    // answer and also prove it under two different viewer timezones.
    const originalTz = process.env.TZ;

    afterEach(() => {
      if (originalTz === undefined) {
        delete process.env.TZ;
      } else {
        process.env.TZ = originalTz;
      }
    });

    it('hired exactly on the period start date is NOT eligible, viewed from UTC-12', () => {
      process.env.TZ = 'Etc/GMT+12'; // POSIX-style: this is UTC-12
      expect(isEligibleByHireDate('2026-04-01', q2_2026)).toBe(false);
    });

    it('hired exactly on the period start date is NOT eligible, viewed from UTC+14', () => {
      process.env.TZ = 'Pacific/Kiritimati'; // UTC+14
      expect(isEligibleByHireDate('2026-04-01', q2_2026)).toBe(false);
    });

    it('hired the day before the boundary is eligible, viewed from UTC-12', () => {
      process.env.TZ = 'Etc/GMT+12';
      expect(isEligibleByHireDate('2026-03-31', q2_2026)).toBe(true);
    });

    it('hired the day before the boundary is eligible, viewed from UTC+14', () => {
      process.env.TZ = 'Pacific/Kiritimati';
      expect(isEligibleByHireDate('2026-03-31', q2_2026)).toBe(true);
    });
  });
});

describe('computeEligibleStaffIds', () => {
  const q2_2026: EvaluationPeriod = { type: 'Quarterly', quarter: 'Q2', year: 2026 };

  it('includes staff hired before the period start (tenure rule)', () => {
    const staff = [{ id: 's1', hire_date: '2026-01-01' }];
    const result = computeEligibleStaffIds(staff, new Set(), q2_2026);
    expect(result.has('s1')).toBe(true);
  });

  it('excludes staff hired after the period start when they have no eval', () => {
    const staff = [{ id: 's1', hire_date: '2026-04-08' }];
    const result = computeEligibleStaffIds(staff, new Set(), q2_2026);
    expect(result.has('s1')).toBe(false);
  });

  it('still counts a too-new hire as eligible if they were explicitly evaluated', () => {
    const staff = [{ id: 's1', hire_date: '2026-04-08' }];
    const result = computeEligibleStaffIds(staff, new Set(['s1']), q2_2026);
    expect(result.has('s1')).toBe(true);
  });

  it('union does not add evaluated ids for staff outside the roster (no phantom inflation of new roster members)', () => {
    const staff = [{ id: 's1', hire_date: '2026-01-01' }];
    const result = computeEligibleStaffIds(staff, new Set(['ghost-id']), q2_2026);
    expect(result.has('s1')).toBe(true);
    expect(result.has('ghost-id')).toBe(true); // union is unconditional by design
    expect(result.size).toBe(2);
  });

  it('denominator is never inflated beyond union of tenure-eligible and evaluated staff', () => {
    const staff = [
      { id: 's1', hire_date: '2026-01-01' }, // eligible by tenure
      { id: 's2', hire_date: '2026-05-01' }, // too new, not evaluated
    ];
    const result = computeEligibleStaffIds(staff, new Set(), q2_2026);
    expect(result.size).toBe(1);
    expect(result.has('s1')).toBe(true);
    expect(result.has('s2')).toBe(false);
  });
});
