import { describe, it, expect } from 'vitest';
import {
  tallyQuarterWindows,
  sumQuarterTallies,
  quarterCompletionRates,
  type QuarterTally,
} from './quarterAccountability';
import type { SubmissionWindow } from './submissionRateCalc';

const NOW = new Date('2026-08-15T12:00:00Z');

function win(overrides: Partial<SubmissionWindow> = {}): SubmissionWindow {
  return {
    week_of: '2026-05-10',
    metric: 'confidence',
    status: 'missing',
    on_time: null,
    due_at: '2026-05-11T00:00:00Z',
    ...overrides,
  };
}

describe('tallyQuarterWindows', () => {
  it('counts every window individually, not per week+metric (unlike calculateSubmissionStats)', () => {
    const windows = [
      win({ week_of: '2026-05-10', metric: 'confidence', due_at: '2026-05-11T00:00:00Z', status: 'submitted', on_time: true }),
      win({ week_of: '2026-05-10', metric: 'confidence', due_at: '2026-05-11T00:00:00Z', status: 'submitted', on_time: true }),
    ];
    const result = tallyQuarterWindows(windows, '2026-06-30', NOW);
    expect(result.expected).toBe(2);
    expect(result.completed).toBe(2);
  });

  it('excludes windows not yet due', () => {
    const windows = [win({ due_at: '2026-09-01T00:00:00Z', status: 'missing' })];
    const result = tallyQuarterWindows(windows, '2026-06-30', NOW);
    expect(result.expected).toBe(0);
  });

  it('excludes windows outside the target quarter even if already due', () => {
    // due in the past relative to NOW, but week_of falls after the quarter end
    const windows = [win({ week_of: '2026-07-15', due_at: '2026-08-01T00:00:00Z', status: 'missing' })];
    const result = tallyQuarterWindows(windows, '2026-06-30', NOW);
    expect(result.expected).toBe(0);
  });

  it('counts a past-due, unsubmitted window as expected but not completed', () => {
    const windows = [win({ status: 'missing' })];
    const result = tallyQuarterWindows(windows, '2026-06-30', NOW);
    expect(result.expected).toBe(1);
    expect(result.completed).toBe(0);
    expect(result.onTime).toBe(0);
  });

  it('counts a late submission as completed but not on time', () => {
    const windows = [win({ status: 'submitted', on_time: false })];
    const result = tallyQuarterWindows(windows, '2026-06-30', NOW);
    expect(result.completed).toBe(1);
    expect(result.onTime).toBe(0);
  });

  it('counts an on-time submission as both completed and on time', () => {
    const windows = [win({ status: 'submitted', on_time: true })];
    const result = tallyQuarterWindows(windows, '2026-06-30', NOW);
    expect(result.completed).toBe(1);
    expect(result.onTime).toBe(1);
  });

  it('treats the due_at-vs-now boundary as inclusive: due exactly at "now" counts as past-due', () => {
    // Regression pin: an earlier version of this check used `<` instead of
    // `<=`, which every other test here couldn't distinguish because none
    // used due_at === now exactly. Frozen `now` (not `new Date()`) is what
    // makes this deterministic.
    const windows = [win({ due_at: NOW.toISOString(), status: 'missing' })];
    const result = tallyQuarterWindows(windows, '2026-06-30', NOW);
    expect(result.expected).toBe(1);
  });

  it('treats the quarter-end boundary as inclusive', () => {
    const windows = [win({ week_of: '2026-06-30', due_at: '2026-07-01T00:00:00Z', status: 'missing' })];
    const result = tallyQuarterWindows(windows, '2026-06-30', NOW);
    expect(result.expected).toBe(1);
  });

  it('returns all zeros for an empty window list', () => {
    expect(tallyQuarterWindows([], '2026-06-30', NOW)).toEqual({ expected: 0, completed: 0, onTime: 0 });
  });
});

describe('sumQuarterTallies', () => {
  it('sums each field across multiple staff tallies', () => {
    const tallies: QuarterTally[] = [
      { expected: 6, completed: 5, onTime: 4 },
      { expected: 3, completed: 3, onTime: 2 },
    ];
    expect(sumQuarterTallies(tallies)).toEqual({ expected: 9, completed: 8, onTime: 6 });
  });

  it('returns all zeros for an empty list (no staff)', () => {
    expect(sumQuarterTallies([])).toEqual({ expected: 0, completed: 0, onTime: 0 });
  });
});

describe('quarterCompletionRates', () => {
  it('returns null rates instead of NaN/0 when nothing was expected', () => {
    expect(quarterCompletionRates({ expected: 0, completed: 0, onTime: 0 })).toEqual({
      completionRate: null,
      onTimeRate: null,
    });
  });

  it('rounds completion and on-time rate to whole percentages', () => {
    const result = quarterCompletionRates({ expected: 3, completed: 2, onTime: 1 });
    expect(result.completionRate).toBe(67); // 2/3 -> 66.67 -> 67
    expect(result.onTimeRate).toBe(33); // 1/3 -> 33.33 -> 33
  });

  it('reports 100% when everything expected was completed on time', () => {
    const result = quarterCompletionRates({ expected: 4, completed: 4, onTime: 4 });
    expect(result).toEqual({ completionRate: 100, onTimeRate: 100 });
  });
});
