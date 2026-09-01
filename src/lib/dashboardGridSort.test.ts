import { describe, it, expect } from 'vitest';
import { severityComparator, severityBand, type GridSortEntry } from './dashboardGridSort';

function entry(overrides: Partial<GridSortEntry> = {}): GridSortEntry {
  return {
    tier: 'neutral',
    owedStaffCount: 8,
    submissionRate: 100,
    nextDeadlineAt: null,
    pendingCount: 0,
    ...overrides,
  };
}

const noon = new Date('2026-09-01T12:00:00Z');
const later = new Date('2026-09-01T17:00:00Z');

describe('severityBand', () => {
  it('puts red first, then watch, then at-risk pending, then on-track, then no-assignments last', () => {
    expect(severityBand(entry({ tier: 'red', submissionRate: 40 }))).toBe(0);
    expect(severityBand(entry({ tier: 'watch', submissionRate: 70 }))).toBe(1);
    expect(severityBand(entry({ nextDeadlineAt: noon, pendingCount: 3 }))).toBe(2);
    expect(severityBand(entry({ tier: 'good', submissionRate: 90 }))).toBe(3);
    expect(severityBand(entry({ nextDeadlineAt: noon, pendingCount: 0 }))).toBe(3);
    expect(severityBand(entry({ owedStaffCount: 0 }))).toBe(4);
  });

  it('a no-assignments location is band 4 even if its tier somehow reads alarmed', () => {
    expect(severityBand(entry({ owedStaffCount: 0, tier: 'red', submissionRate: 0 }))).toBe(4);
  });
});

describe('severityComparator', () => {
  it('orders bands: red, watch, at-risk, on-track, no-assignments', () => {
    const red = entry({ tier: 'red', submissionRate: 40 });
    const watch = entry({ tier: 'watch', submissionRate: 70 });
    const atRisk = entry({ nextDeadlineAt: noon, pendingCount: 3 });
    const onTrack = entry({ tier: 'good', submissionRate: 90 });
    const noWork = entry({ owedStaffCount: 0 });

    const sorted = [noWork, onTrack, atRisk, watch, red].sort(severityComparator);
    expect(sorted).toEqual([red, watch, atRisk, onTrack, noWork]);
  });

  it('within red/watch, worst rate first', () => {
    const worse = entry({ tier: 'red', submissionRate: 20 });
    const bad = entry({ tier: 'red', submissionRate: 50 });
    expect([bad, worse].sort(severityComparator)).toEqual([worse, bad]);
  });

  it('within at-risk, soonest deadline first, then most pending', () => {
    const soonFew = entry({ nextDeadlineAt: noon, pendingCount: 1 });
    const soonMany = entry({ nextDeadlineAt: noon, pendingCount: 5 });
    const lateMany = entry({ nextDeadlineAt: later, pendingCount: 9 });
    expect([lateMany, soonFew, soonMany].sort(severityComparator))
      .toEqual([soonMany, soonFew, lateMany]);
  });

  it('a struggling post-deadline location outranks a pre-deadline one with many pending', () => {
    // The Tuesday-morning regression this replaces: a healthy Michigan card
    // (early deadline) must not outrank a struggling Texas one.
    const struggling = entry({ tier: 'watch', submissionRate: 65 });
    const earlyDeadlineHealthy = entry({ nextDeadlineAt: noon, pendingCount: 6 });
    expect([earlyDeadlineHealthy, struggling].sort(severityComparator))
      .toEqual([struggling, earlyDeadlineHealthy]);
  });

  it('a post-deadline 86% (on-track) sorts above a clean 100%', () => {
    const barely = entry({ tier: 'good', submissionRate: 86 });
    const clean = entry({ tier: 'good', submissionRate: 100 });
    expect([clean, barely].sort(severityComparator)).toEqual([barely, clean]);
  });
});
