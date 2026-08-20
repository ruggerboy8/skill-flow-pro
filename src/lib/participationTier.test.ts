import { describe, expect, it } from 'vitest';
import { participationTier, passesSmallTeamGuard, tierColorTokens } from './participationTier';

describe('participationTier', () => {
  it('never returns red or watch before a deadline has passed', () => {
    expect(
      participationTier({ rate: 0, missedCount: 50, teamSize: 50, anyDeadlinePassed: false }),
    ).toBe('neutral');
    expect(
      participationTier({ rate: 100, missedCount: 0, teamSize: 10, anyDeadlinePassed: false }),
    ).toBe('neutral');
  });

  describe('threshold edges (large team, guard always satisfied)', () => {
    const base = { missedCount: 10, teamSize: 20, anyDeadlinePassed: true };

    it('59.9% is red', () => {
      expect(participationTier({ ...base, rate: 59.9 })).toBe('red');
    });

    it('60% (the boundary) is watch, not red', () => {
      expect(participationTier({ ...base, rate: 60 })).toBe('watch');
    });

    it('84.9% is watch', () => {
      expect(participationTier({ ...base, rate: 84.9 })).toBe('watch');
    });

    it('85% (the boundary) is good', () => {
      expect(participationTier({ ...base, rate: 85 })).toBe('good');
    });
  });

  describe('display/logic rounding agreement (DASH-1a QA fix)', () => {
    // Callers must round the rate ONCE and feed that same rounded value to
    // both the tier decision and the displayed percentage, so a number
    // shown on screen can never disagree with its own color. These tests
    // exercise participationTier with the rounded value, the way
    // LocationHealthCard and RegionalDashboard now call it.
    const base = { missedCount: 10, teamSize: 20, anyDeadlinePassed: true };

    it('a raw rate of 59.5 rounds to a displayed 60%, which must not be red', () => {
      const displayRate = Math.round(59.5);
      expect(displayRate).toBe(60);
      expect(participationTier({ ...base, rate: displayRate })).toBe('watch');
    });

    it('a raw rate of 84.6 rounds to a displayed 85%, which must not be watch', () => {
      const displayRate = Math.round(84.6);
      expect(displayRate).toBe(85);
      expect(participationTier({ ...base, rate: displayRate })).toBe('good');
    });
  });

  describe('small-team guard', () => {
    it('a 3-person location with one absence stays non-red', () => {
      expect(
        participationTier({ rate: 59, missedCount: 1, teamSize: 3, anyDeadlinePassed: true }),
      ).toBe('watch');
    });

    it('a 5-person team with only 0-1 submissions goes red', () => {
      // 5 people, 1 submitted -> 4 missed
      expect(
        participationTier({ rate: 20, missedCount: 4, teamSize: 5, anyDeadlinePassed: true }),
      ).toBe('red');
      // 5 people, 0 submitted -> 5 missed
      expect(
        participationTier({ rate: 0, missedCount: 5, teamSize: 5, anyDeadlinePassed: true }),
      ).toBe('red');
    });

    it('a very small team (too small to ever hit 3 missed) with 0-1 submitted goes red', () => {
      // team of 2, both missing
      expect(
        participationTier({ rate: 0, missedCount: 2, teamSize: 2, anyDeadlinePassed: true }),
      ).toBe('red');
    });

    it('3+ missed satisfies the guard regardless of team size', () => {
      expect(
        participationTier({ rate: 50, missedCount: 3, teamSize: 10, anyDeadlinePassed: true }),
      ).toBe('red');
    });

    it('fewer than 3 missed in a team bigger than 5 does not satisfy the guard', () => {
      expect(
        participationTier({ rate: 50, missedCount: 2, teamSize: 10, anyDeadlinePassed: true }),
      ).toBe('watch');
    });

    it('a single late person out of many never triggers more than watch', () => {
      expect(
        participationTier({ rate: 40, missedCount: 1, teamSize: 40, anyDeadlinePassed: true }),
      ).toBe('watch');
    });
  });
});

describe('passesSmallTeamGuard', () => {
  it('passes at exactly 3 missed', () => {
    expect(passesSmallTeamGuard(3, 100)).toBe(true);
  });

  it('fails at 2 missed in a team of 3 (1 absence)', () => {
    expect(passesSmallTeamGuard(1, 3)).toBe(false);
  });

  it('passes for a team of 5 or fewer with 0 or 1 submitted', () => {
    expect(passesSmallTeamGuard(4, 5)).toBe(true); // 1 submitted
    expect(passesSmallTeamGuard(5, 5)).toBe(true); // 0 submitted
  });

  it('fails for a team of 5 or fewer with 2+ submitted and under 3 missed', () => {
    expect(passesSmallTeamGuard(1, 5)).toBe(false); // 4 submitted
  });

  it('fails for a team bigger than 5 with under 3 missed', () => {
    expect(passesSmallTeamGuard(2, 6)).toBe(false);
  });

  it('never passes for a team of 0 or fewer, even with missedCount 0 (DASH-1a QA fix)', () => {
    expect(passesSmallTeamGuard(0, 0)).toBe(false);
    expect(passesSmallTeamGuard(0, -1)).toBe(false);
    expect(passesSmallTeamGuard(5, 0)).toBe(false);
  });
});

describe('tierColorTokens', () => {
  it('returns status-missing tokens for red', () => {
    const tokens = tierColorTokens('red');
    expect(tokens?.text).toBe('hsl(var(--status-missing))');
    expect(tokens?.bg).toBe('hsl(var(--status-missing-bg))');
  });

  it('returns status-late tokens for watch', () => {
    const tokens = tierColorTokens('watch');
    expect(tokens?.text).toBe('hsl(var(--status-late))');
    expect(tokens?.bg).toBe('hsl(var(--status-late-bg))');
  });

  it('returns null for neutral and good (no special token)', () => {
    expect(tierColorTokens('neutral')).toBeNull();
    expect(tierColorTokens('good')).toBeNull();
  });
});
