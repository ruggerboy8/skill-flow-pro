import { describe, it, expect } from 'vitest';
import { calculateSubmissionStats, calculateCutoffDate, type SubmissionWindow } from './submissionRateCalc';

const NOW = new Date('2026-08-15T12:00:00Z');

function win(overrides: Partial<SubmissionWindow> = {}): SubmissionWindow {
  return {
    week_of: '2026-08-10',
    metric: 'confidence',
    status: 'missing',
    on_time: null,
    due_at: '2026-08-11T00:00:00Z',
    ...overrides,
  };
}

describe('calculateSubmissionStats', () => {
  it('a window whose deadline has not passed and was never submitted is excluded entirely (not even "missing")', () => {
    const windows = [win({ due_at: '2026-08-20T00:00:00Z', status: 'missing' })]; // future deadline
    const result = calculateSubmissionStats(windows, NOW);
    expect(result.totalExpected).toBe(0);
    expect(result.hasData).toBe(false);
  });

  it('a window whose deadline has already passed and was not submitted counts as missing', () => {
    const windows = [win({ due_at: '2026-08-10T00:00:00Z', status: 'missing' })]; // past deadline
    const result = calculateSubmissionStats(windows, NOW);
    expect(result.totalExpected).toBe(1);
    expect(result.completed).toBe(0);
    expect(result.missing).toBe(1);
  });

  it('a submission made before its own deadline is still counted even though the deadline has not passed yet', () => {
    // due_at is in the future relative to NOW, but it was already submitted early.
    const windows = [
      win({ due_at: '2026-08-20T00:00:00Z', status: 'submitted', on_time: true }),
    ];
    const result = calculateSubmissionStats(windows, NOW);
    expect(result.totalExpected).toBe(1);
    expect(result.completed).toBe(1);
    expect(result.onTime).toBe(1);
  });

  it('exactly at the deadline instant counts as past-due (boundary is inclusive)', () => {
    const windows = [win({ due_at: NOW.toISOString(), status: 'missing' })];
    const result = calculateSubmissionStats(windows, NOW);
    expect(result.totalExpected).toBe(1);
    expect(result.missing).toBe(1);
  });

  it('a late submission counts toward completed but not onTime', () => {
    const windows = [
      win({ due_at: '2026-08-10T00:00:00Z', status: 'submitted', on_time: false }),
    ];
    const result = calculateSubmissionStats(windows, NOW);
    expect(result.completed).toBe(1);
    expect(result.onTime).toBe(0);
    expect(result.late).toBe(1);
  });

  it('confidence and performance for the same week are counted as separate expected slots', () => {
    const windows = [
      win({ metric: 'confidence', due_at: '2026-08-10T00:00:00Z', status: 'submitted', on_time: true }),
      win({ metric: 'performance', due_at: '2026-08-10T00:00:00Z', status: 'missing' }),
    ];
    const result = calculateSubmissionStats(windows, NOW);
    expect(result.totalExpected).toBe(2);
    expect(result.completed).toBe(1);
    expect(result.completionRate).toBe(50);
  });

  it('computes completion and on-time rates as percentages of the countable total', () => {
    const windows = [
      win({ week_of: '2026-08-03', metric: 'confidence', due_at: '2026-08-04T00:00:00Z', status: 'submitted', on_time: true }),
      win({ week_of: '2026-08-03', metric: 'performance', due_at: '2026-08-11T00:00:00Z', status: 'submitted', on_time: false }),
      win({ week_of: '2026-08-10', metric: 'confidence', due_at: '2026-08-11T00:00:00Z', status: 'missing' }),
    ];
    const result = calculateSubmissionStats(windows, NOW);
    expect(result.totalExpected).toBe(3);
    expect(result.completed).toBe(2);
    expect(result.onTime).toBe(1);
    expect(result.completionRate).toBeCloseTo((2 / 3) * 100);
    expect(result.onTimeRate).toBeCloseTo((1 / 3) * 100);
  });

  it('with no windows at all, rates are 0 and hasData is false rather than NaN', () => {
    const result = calculateSubmissionStats([], NOW);
    expect(result.hasData).toBe(false);
    expect(result.completionRate).toBe(0);
    expect(result.onTimeRate).toBe(0);
  });
});

describe('calculateCutoffDate', () => {
  it('returns null for the "all" filter', () => {
    expect(calculateCutoffDate('all')).toBeNull();
  });

  it('3weeks and 6weeks return YYYY-MM-DD strings 21 and 42 days back respectively', () => {
    const threeWeeks = calculateCutoffDate('3weeks');
    const sixWeeks = calculateCutoffDate('6weeks');
    expect(threeWeeks).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(sixWeeks).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(new Date(sixWeeks!).getTime()).toBeLessThan(new Date(threeWeeks!).getTime());
  });

  it('is timezone-safe: does not shift a day early for a negative-UTC viewer (COR-1)', () => {
    // Midnight Central time, 6 hours ahead in UTC. toISOString().split('T')[0]
    // on this instant would have read back the previous calendar day.
    const now = new Date('2026-08-12T05:00:00Z'); // Wed Aug 12 00:00 CDT
    expect(calculateCutoffDate('3weeks', now)).toBe('2026-07-22');
    expect(calculateCutoffDate('6weeks', now)).toBe('2026-07-01');
  });

  it('is DST-safe across a spring-forward transition', () => {
    const now = new Date('2026-03-15T12:00:00Z'); // after the Mar 8 transition
    expect(calculateCutoffDate('3weeks', now)).toBe('2026-02-22');
  });
});
