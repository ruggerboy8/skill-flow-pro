import { describe, expect, it } from 'vitest';
import { getDashboardMoment } from './dashboardMoment';
import type { SubmissionGates } from '@/lib/submissionStatus';

function gates(overrides: Partial<SubmissionGates> = {}): SubmissionGates {
  return {
    isPastConfidenceDeadline: false,
    isPastPerformanceDeadline: false,
    isPerformanceOpen: false,
    ...overrides,
  };
}

describe('getDashboardMoment', () => {
  it('defaults to midweek with no locations at all', () => {
    expect(getDashboardMoment([])).toBe('midweek');
    expect(getDashboardMoment(new Map())).toBe('midweek');
  });

  it('is midweek when some locations are past performance deadline and some are not', () => {
    const list = [
      gates({ isPastConfidenceDeadline: true, isPastPerformanceDeadline: true }),
      gates({ isPastConfidenceDeadline: true, isPastPerformanceDeadline: false }),
    ];
    expect(getDashboardMoment(list)).toBe('midweek');
  });

  it('is wrapup when every location is past its performance deadline', () => {
    const list = [
      gates({ isPastConfidenceDeadline: true, isPastPerformanceDeadline: true }),
      gates({ isPastConfidenceDeadline: true, isPastPerformanceDeadline: true }),
    ];
    expect(getDashboardMoment(list)).toBe('wrapup');
  });

  it('is midweek when no location has passed its performance deadline yet (early week)', () => {
    const list = [
      gates({ isPastConfidenceDeadline: false, isPastPerformanceDeadline: false }),
      gates({ isPastConfidenceDeadline: false, isPastPerformanceDeadline: false }),
    ];
    expect(getDashboardMoment(list)).toBe('midweek');
  });

  it('stays midweek for a location past its confidence deadline but not its performance deadline', () => {
    const list = [
      gates({ isPastConfidenceDeadline: true, isPastPerformanceDeadline: false }),
    ];
    expect(getDashboardMoment(list)).toBe('midweek');
  });

  it('accepts a Map, the shape RegionalDashboard actually builds', () => {
    const map = new Map<string, SubmissionGates>([
      ['loc-1', gates({ isPastConfidenceDeadline: true, isPastPerformanceDeadline: true })],
      ['loc-2', gates({ isPastConfidenceDeadline: true, isPastPerformanceDeadline: true })],
    ]);
    expect(getDashboardMoment(map)).toBe('wrapup');
  });
});
