import { describe, it, expect } from 'vitest';
import { pickMostRecentVisibleEvalId, type EvalPeriodCandidate } from './useCraftAtlas';

describe('pickMostRecentVisibleEvalId', () => {
  it('picks the eval with the latest program_year', () => {
    const candidates: EvalPeriodCandidate[] = [
      { eval_id: 'old', visible: true, program_year: 2025, quarter: 'Q4' },
      { eval_id: 'new', visible: true, program_year: 2026, quarter: 'Q1' },
    ];
    expect(pickMostRecentVisibleEvalId(candidates)).toBe('new');
  });

  it('within the same program_year, picks the latest quarter', () => {
    const candidates: EvalPeriodCandidate[] = [
      { eval_id: 'q1', visible: true, program_year: 2026, quarter: 'Q1' },
      { eval_id: 'q3', visible: true, program_year: 2026, quarter: 'Q3' },
      { eval_id: 'q2', visible: true, program_year: 2026, quarter: 'Q2' },
    ];
    expect(pickMostRecentVisibleEvalId(candidates)).toBe('q3');
  });

  it('ignores updated_at-style ordering — a later-opened older eval must not win', () => {
    // Regression guard for the stale-Atlas bug: the caller must never sort by
    // a timestamp field here. This test only exercises the period-based
    // comparison since pickMostRecentVisibleEvalId doesn't accept a timestamp
    // at all, but documents the intent: order given here (older eval last)
    // must not influence the result.
    const candidates: EvalPeriodCandidate[] = [
      { eval_id: 'q2-2026', visible: true, program_year: 2026, quarter: 'Q2' },
      { eval_id: 'q4-2025', visible: true, program_year: 2025, quarter: 'Q4' },
    ];
    expect(pickMostRecentVisibleEvalId(candidates)).toBe('q2-2026');
  });

  it('skips non-visible evaluations even if they are the most recent period', () => {
    const candidates: EvalPeriodCandidate[] = [
      { eval_id: 'hidden', visible: false, program_year: 2026, quarter: 'Q3' },
      { eval_id: 'visible', visible: true, program_year: 2026, quarter: 'Q2' },
    ];
    expect(pickMostRecentVisibleEvalId(candidates)).toBe('visible');
  });

  it('treats Baseline (quarter null) as older than any numbered quarter in the same year', () => {
    const candidates: EvalPeriodCandidate[] = [
      { eval_id: 'baseline', visible: true, program_year: 2026, quarter: null },
      { eval_id: 'q1', visible: true, program_year: 2026, quarter: 'Q1' },
    ];
    expect(pickMostRecentVisibleEvalId(candidates)).toBe('q1');
  });

  it('returns null when there are no visible candidates', () => {
    const candidates: EvalPeriodCandidate[] = [
      { eval_id: 'hidden', visible: false, program_year: 2026, quarter: 'Q1' },
    ];
    expect(pickMostRecentVisibleEvalId(candidates)).toBeNull();
  });

  it('returns null for an empty list', () => {
    expect(pickMostRecentVisibleEvalId([])).toBeNull();
  });
});
