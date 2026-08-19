/**
 * TST-4 component tests for the extracted sequencer scoring module.
 *
 * Each block pins one scoring component at its boundary so that a change to a
 * constant, a comparison operator or a formula fails loudly. These are
 * characterization tests: they describe what the code does today, not what it
 * arguably should do.
 */
import { describe, expect, it } from 'vitest';
import {
  BETA_PRIOR_A,
  BETA_PRIOR_B,
  LOW_CONF_THRESHOLD,
  MIN_SAMPLES,
  RECENCY_HORIZON,
  STALE_WEEKS,
  TRICKLE_LONG,
  TRICKLE_WEIGHT,
  classifyConfidence,
  combineComponents,
  compareScoredMoves,
  computeRecency,
  computeWeeksSince,
  scoreCandidate,
  type CandidateMove,
  type ConfidencePoint,
  type ScoringConfig,
  type ScoringInputs,
  type ScoringWeights,
} from '../../supabase/functions/_shared/sequencerScoring.ts';

const REF = '2026-08-17';

const BASE_WEIGHTS: ScoringWeights = { C: 0.50, R: 0.22, E: 0.13, D: 0.05, B: 0.10 };
const BASE_CONFIG: ScoringConfig = {
  cooldownWeeks: 4,
  recencyHorizonWeeks: 16,
  ebPrior: 0.70,
  ebK: 20,
  trimPct: 0.05,
  evalCap: 0.25,
};

const MOVE: CandidateMove = { id: 1, competencyId: 10, domainId: 20, curriculumPriority: 0.5 };

function makeInputs(overrides: Partial<ScoringInputs> = {}): ScoringInputs {
  return {
    confidenceHistory: [],
    individualLowCounts: new Map(),
    evals: [],
    lastSelected: [],
    domainCoverage: [],
    weights: BASE_WEIGHTS,
    config: BASE_CONFIG,
    ...overrides,
  };
}

/** n weekly points for move 1, all with the given average and sample size. */
function points(avgs: number[], n = 1): ConfidencePoint[] {
  return avgs.map((avg, i) => ({ proMoveId: 1, weekStart: `w${i}`, avg, n }));
}

// ---------------------------------------------------------------------------

describe('constants', () => {
  it('pins the values the deployed scoring depends on', () => {
    expect(MIN_SAMPLES).toBe(12);
    expect(BETA_PRIOR_A).toBe(3);
    expect(BETA_PRIOR_B).toBe(3);
    expect(RECENCY_HORIZON).toBe(16);
    expect(TRICKLE_LONG).toBe(24);
    expect(TRICKLE_WEIGHT).toBe(0.20);
    expect(LOW_CONF_THRESHOLD).toBe(0.30);
    expect(STALE_WEEKS).toBe(6);
  });
});

describe('C component: trimmed mean window', () => {
  // avgConfLast is sampleMean * 3 + 1, so it reads the trimmed mean directly.
  const sampleMeanOf = (inputs: ScoringInputs) =>
    (scoreCandidate(MOVE, REF, inputs).avgConfLast! - 1) / 3;

  it('does not trim below 20 weekly points at trimPct 0.05', () => {
    // floor(19 * 0.05) === 0, so all 19 points count including both extremes.
    const avgs = [0.0, ...Array(17).fill(0.2), 1.0];
    const mean = sampleMeanOf(makeInputs({ confidenceHistory: points(avgs) }));
    expect(mean).toBeCloseTo((0 + 3.4 + 1) / 19, 12);
  });

  it('trims one point from EACH end at exactly 20 weekly points', () => {
    // floor(20 * 0.05) === 1, so the single highest and single lowest are
    // dropped. The three wrong answers are all distinguishable here:
    // no trim 0.23, drop-top-only 0.18947..., drop-bottom-only 0.24210...
    const avgs = [0.0, ...Array(18).fill(0.2), 1.0];
    const mean = sampleMeanOf(makeInputs({ confidenceHistory: points(avgs) }));
    expect(mean).toBeCloseTo(0.2, 12);
  });

  it('refuses to trim when trimming would empty the sample', () => {
    // 2 points, trimPct 0.9: trimCount 1, but safeTrimCount clamps to 0.
    const inputs = makeInputs({
      confidenceHistory: points([0.2, 0.8]),
      config: { ...BASE_CONFIG, trimPct: 0.9 },
    });
    expect(sampleMeanOf(inputs)).toBeCloseTo(0.5, 12);
  });

  it('keeps the middle value when the safe trim still allows one per side', () => {
    // 3 points, trimPct 0.5: trimCount 1, safeTrimCount min(1, 1) = 1.
    const inputs = makeInputs({
      confidenceHistory: points([0.1, 0.4, 0.9]),
      config: { ...BASE_CONFIG, trimPct: 0.5 },
    });
    expect(sampleMeanOf(inputs)).toBeCloseTo(0.4, 12);
  });
});

describe('C component: Bayesian shrinkage toward the prior', () => {
  it('applies (prior*K + mean*N) / (K + N)', () => {
    // sampleMean 0.5, totalN 20, prior 0.70, K 20 -> smoothedConf 0.6
    // p_low with no individual counts -> (3 + 0) / (6 + 0) = 0.5
    // C = 0.6 * 0.5 + 0.4 * (1 - 0.6) = 0.46
    const inputs = makeInputs({ confidenceHistory: points([0.5], 20) });
    expect(scoreCandidate(MOVE, REF, inputs).C).toBeCloseTo(0.46, 12);
  });

  it('moves C toward the prior when K is raised', () => {
    const weak = makeInputs({
      confidenceHistory: points([0.5], 20),
      config: { ...BASE_CONFIG, ebK: 200 },
    });
    // smoothedConf = (0.7*200 + 0.5*20) / 220 = 0.681818...
    expect(scoreCandidate(MOVE, REF, weak).C).toBeCloseTo(0.6 * 0.5 + 0.4 * (1 - 150 / 220), 12);
  });

  it('defaults C to neutral 0.5 with no confidence history at all', () => {
    const s = scoreCandidate(MOVE, REF, makeInputs());
    expect(s.C).toBe(0.5);
    expect(s.lowConfShare).toBeNull();
    expect(s.avgConfLast).toBeNull();
  });
});

describe('C component: low-confidence Beta smoothing', () => {
  it('uses a Beta(3, 3) prior over the individual low-score share', () => {
    const inputs = makeInputs({
      confidenceHistory: points([0.5], 20),
      individualLowCounts: new Map([[1, { lowCount: 9, totalCount: 21 }]]),
    });
    expect(scoreCandidate(MOVE, REF, inputs).lowConfShare).toBeCloseTo(12 / 27, 12);
  });

  it('falls back to the bare prior (0.5) when a move has no individual counts', () => {
    const inputs = makeInputs({ confidenceHistory: points([0.5], 20) });
    expect(scoreCandidate(MOVE, REF, inputs).lowConfShare).toBeCloseTo(0.5, 12);
  });

  it('weights the tail 60 / 40 against the mean deficit', () => {
    const inputs = makeInputs({
      confidenceHistory: points([0.5], 20), // smoothedConf 0.6, deficit 0.4
      individualLowCounts: new Map([[1, { lowCount: 0, totalCount: 24 }]]), // p_low 3/30 = 0.1
    });
    expect(scoreCandidate(MOVE, REF, inputs).C).toBeCloseTo(0.6 * 0.1 + 0.4 * 0.4, 12);
  });
});

describe('C component: sample-size shrink to neutral', () => {
  it('does not shrink at exactly MIN_SAMPLES observations', () => {
    // totalN 12: smoothedConf = (14 + 6) / 32 = 0.625, deficit 0.375
    const inputs = makeInputs({ confidenceHistory: points([0.5], 12) });
    expect(scoreCandidate(MOVE, REF, inputs).C).toBeCloseTo(0.6 * 0.5 + 0.4 * 0.375, 12);
  });

  it('shrinks toward 0.5 with lambda = N / MIN_SAMPLES one observation below', () => {
    const inputs = makeInputs({ confidenceHistory: points([0.5], 11) });
    expect(scoreCandidate(MOVE, REF, inputs).C).toBeCloseTo(0.4526881720430107, 12);
  });

  it('collapses almost entirely to neutral with a single observation', () => {
    const inputs = makeInputs({ confidenceHistory: points([0.0], 1) });
    // lambda = 1/12, so C is dominated by the 0.5 neutral term
    expect(scoreCandidate(MOVE, REF, inputs).C).toBeGreaterThan(0.49);
    expect(scoreCandidate(MOVE, REF, inputs).C).toBeLessThan(0.51);
  });
});

describe('R component: recency decay and long trickle', () => {
  it('is flat at zero base inside the cooldown', () => {
    expect(computeRecency(0, 4, 16)).toBeCloseTo(0, 12);
    // At exactly the cooldown the base is still 0; only the trickle contributes.
    expect(computeRecency(4, 4, 16)).toBeCloseTo((4 / 24) * 0.2, 12);
  });

  it('ramps linearly on the first week past the cooldown', () => {
    expect(computeRecency(5, 4, 16)).toBeCloseTo(1 / 12 + (5 / 24) * 0.2, 12);
    expect(computeRecency(10, 4, 16)).toBeCloseTo(6 / 12 + (10 / 24) * 0.2, 12);
  });

  it('saturates at 1 at and beyond the horizon', () => {
    expect(computeRecency(16, 4, 16)).toBe(1);
    expect(computeRecency(999, 4, 16)).toBe(1);
  });

  it('is already capped at 1 one week before the horizon, because of the trickle', () => {
    // Characterization, not endorsement: base + trickle reaches 1.0 at week 15
    // with the default cooldown 4 / horizon 16, so the last stretch of the
    // linear ramp is unreachable.
    expect(computeRecency(14, 4, 16)).toBeCloseTo(10 / 12 + (14 / 24) * 0.2, 12);
    expect(computeRecency(14, 4, 16)).toBeLessThan(1);
    expect(computeRecency(15, 4, 16)).toBe(1);
  });

  it('substitutes a 12 week horizon when the configured horizon is 0', () => {
    expect(computeRecency(8, 4, 0)).toBeCloseTo(0.5 + (8 / 24) * 0.2, 12);
    expect(computeRecency(12, 4, 0)).toBe(1);
  });

  it('caps the long-trickle bonus at TRICKLE_LONG weeks', () => {
    // Cooldown and horizon pushed out so only the trickle term is live.
    expect(computeRecency(12, 100, 200)).toBeCloseTo(0.1, 12);
    expect(computeRecency(24, 100, 200)).toBeCloseTo(0.2, 12);
    expect(computeRecency(48, 100, 200)).toBeCloseTo(0.2, 12);
  });
});

describe('weeks since last selection', () => {
  it('returns 999 for a move that was never selected', () => {
    expect(computeWeeksSince(REF, null)).toBe(999);
    expect(computeWeeksSince(REF, undefined)).toBe(999);
  });

  it('floors partial weeks', () => {
    expect(computeWeeksSince('2026-08-17', '2026-08-03')).toBe(2);
    expect(computeWeeksSince('2026-08-16', '2026-08-03')).toBe(1);
  });
});

describe('E component: eval deficit cap', () => {
  const withEval = (score: number | null | undefined, wE: number, evalCap: number) =>
    scoreCandidate(
      MOVE,
      REF,
      makeInputs({
        evals: score === undefined ? [] : [{ competencyId: 10, score }],
        weights: { ...BASE_WEIGHTS, E: wE },
        config: { ...BASE_CONFIG, evalCap },
      })
    );

  it('treats a missing or null eval score as no deficit', () => {
    expect(withEval(undefined, 0.5, 0.25).E).toBe(0);
    expect(withEval(undefined, 0.5, 0.25).eContrib).toBe(0);
    expect(withEval(null, 0.5, 0.25).E).toBe(0);
  });

  it('turns the eval score into a deficit (1 - score)', () => {
    expect(withEval(0.4, 0.5, 0.25).E).toBeCloseTo(0.6, 12);
    expect(withEval(1.0, 0.5, 0.25).E).toBe(0);
  });

  it('never lets the deficit go negative', () => {
    expect(withEval(1.5, 0.5, 0.25).E).toBe(0);
  });

  it('caps the weighted contribution at evalCap', () => {
    expect(withEval(0.5, 0.5, 0.25).eContrib).toBeCloseTo(0.25, 12); // exactly at the cap
    expect(withEval(0.4, 0.5, 0.25).eContrib).toBeCloseTo(0.25, 12); // would be 0.30, capped
    expect(withEval(0.6, 0.5, 0.25).eContrib).toBeCloseTo(0.20, 12); // under the cap
  });

  it('leaves the raw deficit uncapped even when the contribution is capped', () => {
    const s = withEval(0.0, 0.5, 0.25);
    expect(s.E).toBe(1);
    expect(s.eContrib).toBeCloseTo(0.25, 12);
  });
});

describe('D component: domain coverage', () => {
  const withCoverage = (appearances: number | null) =>
    scoreCandidate(
      MOVE,
      REF,
      makeInputs({
        domainCoverage: appearances === null ? [] : [{ domainId: 20, appearances }],
      })
    ).D;

  it('gives a full 1.0 to a domain with no recent appearances', () => {
    expect(withCoverage(null)).toBe(1);
    expect(withCoverage(0)).toBe(1);
  });

  it('decays linearly over an 8 week window', () => {
    expect(withCoverage(2)).toBeCloseTo(0.75, 12);
    expect(withCoverage(4)).toBeCloseTo(0.5, 12);
    expect(withCoverage(6)).toBeCloseTo(0.25, 12);
  });

  it('clamps at 0 from 8 appearances onward', () => {
    expect(withCoverage(8)).toBe(0);
    expect(withCoverage(20)).toBe(0);
  });

  it('ignores coverage recorded against another domain', () => {
    const D = scoreCandidate(
      MOVE,
      REF,
      makeInputs({ domainCoverage: [{ domainId: 99, appearances: 8 }] })
    ).D;
    expect(D).toBe(1);
  });
});

describe('B component: curriculum priority', () => {
  it('defaults to 0.5 when unset', () => {
    expect(scoreCandidate({ ...MOVE, curriculumPriority: null }, REF, makeInputs()).B).toBe(0.5);
  });

  it('coerces a numeric string, as Postgres numerics arrive', () => {
    expect(scoreCandidate({ ...MOVE, curriculumPriority: '0.75' }, REF, makeInputs()).B).toBe(0.75);
  });

  it('treats an explicit 0 as 0, not as missing', () => {
    expect(scoreCandidate({ ...MOVE, curriculumPriority: 0 }, REF, makeInputs()).B).toBe(0);
  });
});

describe('primary reason code selection', () => {
  const reasonFor = (opts: {
    lowCount?: number;
    totalCount?: number;
    hasHistory?: boolean;
    lastSelectedWeeksAgo?: number | null;
  }) => {
    const { lowCount = 0, totalCount = 0, hasHistory = true, lastSelectedWeeksAgo = null } = opts;
    const d = new Date(REF);
    if (lastSelectedWeeksAgo !== null) d.setDate(d.getDate() - lastSelectedWeeksAgo * 7);
    return scoreCandidate(
      MOVE,
      REF,
      makeInputs({
        confidenceHistory: hasHistory ? points([0.5], 20) : [],
        individualLowCounts: new Map([[1, { lowCount, totalCount }]]),
        lastSelected:
          lastSelectedWeeksAgo === null
            ? []
            : [{ proMoveId: 1, weekStart: d.toISOString().split('T')[0] }],
      })
    );
  };

  it('reports LOW_CONF at exactly the 0.30 threshold', () => {
    // (3 + 3) / (6 + 14) = 0.30
    const s = reasonFor({ lowCount: 3, totalCount: 14, lastSelectedWeeksAgo: 0 });
    expect(s.lowConfShare).toBeCloseTo(0.30, 12);
    expect(s.primaryReasonCode).toBe('LOW_CONF');
    expect(s.primaryReasonValue).toBeCloseTo(0.30, 12);
  });

  it('does not report LOW_CONF just below the threshold', () => {
    // (3 + 3) / (6 + 15) = 0.2857...
    const s = reasonFor({ lowCount: 3, totalCount: 15, lastSelectedWeeksAgo: 0 });
    expect(s.lowConfShare).toBeLessThan(LOW_CONF_THRESHOLD);
    expect(s.primaryReasonCode).toBe('TIE');
  });

  it('reports NEVER for a move with no selection history', () => {
    const s = reasonFor({ lowCount: 0, totalCount: 100, lastSelectedWeeksAgo: null });
    expect(s.weeksSince).toBe(999);
    expect(s.primaryReasonCode).toBe('NEVER');
    expect(s.primaryReasonValue).toBeNull();
  });

  it('reports STALE from exactly STALE_WEEKS onward, TIE below it', () => {
    expect(reasonFor({ totalCount: 100, lastSelectedWeeksAgo: 5 }).primaryReasonCode).toBe('TIE');
    const stale = reasonFor({ totalCount: 100, lastSelectedWeeksAgo: 6 });
    expect(stale.primaryReasonCode).toBe('STALE');
    expect(stale.primaryReasonValue).toBe(6);
  });

  it('lets LOW_CONF win over NEVER and STALE', () => {
    expect(reasonFor({ lowCount: 50, totalCount: 60, lastSelectedWeeksAgo: null }).primaryReasonCode)
      .toBe('LOW_CONF');
    expect(reasonFor({ lowCount: 50, totalCount: 60, lastSelectedWeeksAgo: 30 }).primaryReasonCode)
      .toBe('LOW_CONF');
  });

  it('cannot report LOW_CONF when there is no confidence history to share', () => {
    const s = reasonFor({ lowCount: 50, totalCount: 60, hasHistory: false, lastSelectedWeeksAgo: 1 });
    expect(s.lowConfShare).toBeNull();
    expect(s.primaryReasonCode).toBe('TIE');
  });
});

describe('retest component (removed in phase 2)', () => {
  it('is permanently zero and never flags a retest', () => {
    const s = scoreCandidate(MOVE, REF, makeInputs());
    expect(s.T).toBe(0);
    expect(s.retestDue).toBe(false);
    expect(s.primaryReasonCode).not.toBe('RETEST');
  });
});

describe('combineComponents', () => {
  it('sums the weighted components, with E already weighted and capped', () => {
    const { final } = combineComponents(
      { C: 0.4, R: 0.5, D: 1, B: 0.5, eContrib: 0.07, T: 0 },
      BASE_WEIGHTS
    );
    expect(final).toBeCloseTo(0.4 * 0.5 + 0.5 * 0.22 + 1 * 0.05 + 0.07 + 0 + 0.5 * 0.1, 12);
  });

  it('names the two largest weighted contributions as drivers', () => {
    const { drivers } = combineComponents(
      { C: 1, R: 1, D: 1, B: 0, eContrib: 0.9, T: 0 },
      BASE_WEIGHTS
    );
    // C*0.5 = 0.50, eContrib = 0.90, R*0.22 = 0.22, D*0.05 = 0.05
    expect(drivers).toEqual(['E', 'C']);
  });

  it('breaks driver ties in declaration order C, R, E, D, T, B', () => {
    const { drivers } = combineComponents(
      { C: 0, R: 0, D: 0, B: 0, eContrib: 0, T: 0 },
      BASE_WEIGHTS
    );
    expect(drivers).toEqual(['C', 'R']);
  });
});

describe('tie-break ordering', () => {
  const row = (over: Partial<{ final: number; lowConfShare: number | null; weeksSince: number; id: number }>) => ({
    final: 0.5,
    lowConfShare: 0.2,
    weeksSince: 5,
    id: 1,
    ...over,
  });

  it('orders by final score descending when the gap is at least 0.0001', () => {
    expect(compareScoredMoves(row({ final: 0.5 }), row({ final: 0.5002 }))).toBeGreaterThan(0);
    expect(compareScoredMoves(row({ final: 0.5002 }), row({ final: 0.5 }))).toBeLessThan(0);
  });

  it('treats scores closer than 0.0001 as tied and falls through', () => {
    const a = row({ final: 0.50000, lowConfShare: 0.1 });
    const b = row({ final: 0.50005, lowConfShare: 0.9 });
    // b wins on lowConfShare even though a and b are numerically not equal
    expect(compareScoredMoves(a, b)).toBeGreaterThan(0);
  });

  it('prefers the higher low-confidence share next', () => {
    expect(compareScoredMoves(row({ lowConfShare: 0.1 }), row({ lowConfShare: 0.4 })))
      .toBeGreaterThan(0);
  });

  it('treats a null low-confidence share as 0', () => {
    expect(compareScoredMoves(row({ lowConfShare: null }), row({ lowConfShare: 0.4 })))
      .toBeGreaterThan(0);
    // null and 0 both fold to 0, so they tie and fall through to id.
    expect(compareScoredMoves(row({ lowConfShare: null }), row({ lowConfShare: 0 }))).toBe(0);
  });

  it('then prefers the move unseen for longer', () => {
    expect(compareScoredMoves(row({ weeksSince: 3 }), row({ weeksSince: 9 }))).toBeGreaterThan(0);
  });

  it('finally falls back to ascending id for determinism', () => {
    expect(compareScoredMoves(row({ id: 7 }), row({ id: 2 }))).toBeGreaterThan(0);
    expect(compareScoredMoves(row({ id: 2 }), row({ id: 7 }))).toBeLessThan(0);
    expect(compareScoredMoves(row({ id: 2 }), row({ id: 2 }))).toBe(0);
  });
});

describe('classifyConfidence', () => {
  it('flags critical only when the value is at or under 0.20 with 10+ recent samples', () => {
    const r = classifyConfidence(0.20, [{ avg: 0.2, n: 5 }, { avg: 0.2, n: 5 }]);
    expect(r.status).toBe('critical');
    expect(r.severity).toBeCloseTo((0.25 - 0.20) / 0.25, 12);
  });

  it('drops to watch when the recent sample count is under 10', () => {
    expect(classifyConfidence(0.20, [{ avg: 0.2, n: 4 }, { avg: 0.2, n: 5 }]).status).toBe('watch');
  });

  it('flags watch at exactly 0.30 and ok just above it', () => {
    expect(classifyConfidence(0.30, [{ avg: 0.9, n: 5 }]).status).toBe('watch');
    expect(classifyConfidence(0.3001, [{ avg: 0.9, n: 5 }]).status).toBe('ok');
  });

  it('flags watch on a very low recent week even when the overall value is fine', () => {
    expect(classifyConfidence(0.9, [{ avg: 0.9, n: 5 }, { avg: 0.20, n: 5 }]).status).toBe('watch');
    // Same low average but too few responses to count.
    expect(classifyConfidence(0.9, [{ avg: 0.9, n: 5 }, { avg: 0.20, n: 4 }]).status).toBe('ok');
  });

  it('only looks at the last two weeks', () => {
    const r = classifyConfidence(0.9, [
      { avg: 0.0, n: 50 },
      { avg: 0.9, n: 3 },
      { avg: 0.9, n: 4 },
    ]);
    expect(r.status).toBe('ok');
    expect(r.n2w).toBe(7);
    expect(r.recentMeans).toEqual([0.9, 0.9]);
  });

  it('returns ok with zeroed counts when there is no history', () => {
    const r = classifyConfidence(0.9, []);
    expect(r.status).toBe('ok');
    expect(r.n2w).toBe(0);
    expect(r.recentMeans).toEqual([]);
  });
});
