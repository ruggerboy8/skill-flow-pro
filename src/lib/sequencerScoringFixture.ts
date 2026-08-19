/**
 * Shared fixture for the sequencer scoring tests (TST-4).
 *
 * A realistic-shaped but fully deterministic candidate set: 10 pro moves
 * across 4 domains and 5 competencies, with confidence histories that exercise
 * the trim window, the sample-size shrink, the eval cap, the domain-coverage
 * cap and every primary-reason branch.
 */
import type {
  CandidateMove,
  ConfidencePoint,
  DomainCoverageRecord,
  EvalScore,
  LastSelectedRecord,
  LowConfidenceCounts,
  ScoringConfig,
  ScoringInputs,
  ScoringWeights,
} from '../../supabase/functions/_shared/sequencerScoring.ts';

export const REFERENCE_DATE = '2026-08-17';
export const PREVIEW_DATE = '2026-08-24';

/** The "balanced" preset weights, already summing to 1.0. */
export const FIXTURE_WEIGHTS: ScoringWeights = {
  C: 0.50,
  R: 0.22,
  E: 0.13,
  D: 0.05,
  B: 0.10,
};

/** The edge function's default config values. */
export const FIXTURE_CONFIG: ScoringConfig = {
  cooldownWeeks: 4,
  recencyHorizonWeeks: 16,
  ebPrior: 0.70,
  ebK: 20,
  trimPct: 0.05,
  evalCap: 0.25,
};

export const FIXTURE_MOVES: CandidateMove[] = [
  { id: 101, competencyId: 1, domainId: 1, curriculumPriority: 0.9 },
  { id: 102, competencyId: 1, domainId: 1, curriculumPriority: null },
  { id: 103, competencyId: 2, domainId: 2, curriculumPriority: 0.2 },
  // curriculumPriority arrives from Postgres numeric as a string on some paths
  { id: 104, competencyId: 2, domainId: 2, curriculumPriority: '0.55' },
  { id: 105, competencyId: 3, domainId: 3, curriculumPriority: 0.5 },
  { id: 106, competencyId: 3, domainId: 3, curriculumPriority: 0.75 },
  { id: 107, competencyId: 4, domainId: 1, curriculumPriority: 0.1 },
  { id: 108, competencyId: 4, domainId: 4, curriculumPriority: 1 },
  { id: 109, competencyId: 5, domainId: 2, curriculumPriority: 0.35 },
  { id: 110, competencyId: 5, domainId: 4, curriculumPriority: null },
];

/** Deterministic ISO Monday, `weeksBack` weeks before REFERENCE_DATE. */
function weekStart(weeksBack: number): string {
  const d = new Date(REFERENCE_DATE);
  d.setDate(d.getDate() - weeksBack * 7);
  return d.toISOString().split('T')[0];
}

function history(
  proMoveId: number,
  avgs: number[],
  ns: number[]
): ConfidencePoint[] {
  return avgs.map((avg, i) => ({
    proMoveId,
    weekStart: weekStart(avgs.length - i),
    avg,
    n: ns[i],
  }));
}

export const FIXTURE_CONFIDENCE_HISTORY: ConfidencePoint[] = [
  // 101: 22 weekly points -> trimCount = floor(22 * 0.05) = 1, so the trim
  // window actually bites (drops the lowest and highest weekly averages).
  ...history(
    101,
    [
      0.00, 0.10, 0.15, 0.20, 0.25, 0.30, 0.33, 0.35,
      0.40, 0.45, 0.50, 0.55, 0.60, 0.62, 0.65, 0.70,
      0.75, 0.80, 0.85, 0.90, 0.95, 1.00,
    ],
    [3, 4, 2, 5, 3, 4, 6, 2, 3, 5, 4, 3, 2, 6, 4, 3, 5, 2, 4, 3, 6, 5]
  ),
  // 102: 20 points -> trimCount = 1 as well, but a much lower mean.
  ...history(
    102,
    [
      0.00, 0.00, 0.05, 0.10, 0.10, 0.15, 0.20, 0.20,
      0.25, 0.30, 0.30, 0.33, 0.35, 0.35, 0.40, 0.45,
      0.50, 0.55, 0.60, 0.67,
    ],
    [4, 3, 5, 2, 6, 3, 4, 5, 2, 3, 4, 6, 3, 2, 5, 4, 3, 6, 2, 4]
  ),
  // 103: 10 points -> trimCount = 0, no trimming.
  ...history(
    103,
    [0.67, 0.70, 0.72, 0.75, 0.78, 0.80, 0.82, 0.85, 0.88, 0.90],
    [5, 4, 6, 3, 5, 4, 6, 3, 5, 4]
  ),
  // 104: 3 points, totalN = 5 -> below MIN_SAMPLES, shrinks toward 0.5.
  ...history(104, [0.20, 0.33, 0.40], [2, 2, 1]),
  // 105: single point, totalN = 11 -> just below MIN_SAMPLES.
  ...history(105, [0.45], [11]),
  // 106: single point, totalN = 12 -> exactly MIN_SAMPLES, no shrink.
  ...history(106, [0.45], [12]),
  // 107: two points, high confidence.
  ...history(107, [0.90, 1.00], [7, 8]),
  // 108: two points, rock bottom.
  ...history(108, [0.00, 0.05], [9, 9]),
  // 109 and 110 deliberately have NO confidence history at all.
];

export const FIXTURE_LOW_COUNTS = new Map<number, LowConfidenceCounts>([
  [101, { lowCount: 18, totalCount: 84 }],
  [102, { lowCount: 52, totalCount: 78 }],
  [103, { lowCount: 4, totalCount: 45 }],
  [104, { lowCount: 3, totalCount: 5 }],
  [105, { lowCount: 5, totalCount: 11 }],
  [106, { lowCount: 5, totalCount: 12 }],
  [107, { lowCount: 0, totalCount: 15 }],
  [108, { lowCount: 17, totalCount: 18 }],
  // 109 / 110 absent -> the { lowCount: 0, totalCount: 0 } default.
]);

export const FIXTURE_EVALS: EvalScore[] = [
  { competencyId: 1, score: 0.40 }, // deficit 0.60 -> under the cap
  { competencyId: 2, score: 0.95 }, // deficit 0.05 -> tiny contribution
  { competencyId: 3, score: 0.00 }, // deficit 1.00 -> hits the eval cap
  { competencyId: 5, score: 1.00 }, // deficit 0.00
  // competency 4 absent -> E_raw 0
];

export const FIXTURE_LAST_SELECTED: LastSelectedRecord[] = [
  { proMoveId: 101, weekStart: weekStart(0) },   // weeksSince 0, inside cooldown
  { proMoveId: 102, weekStart: weekStart(4) },   // weeksSince 4, exactly cooldown
  { proMoveId: 103, weekStart: weekStart(5) },   // weeksSince 5, first week past cooldown
  { proMoveId: 104, weekStart: weekStart(6) },   // weeksSince 6, STALE threshold
  { proMoveId: 105, weekStart: weekStart(15) },  // weeksSince 15, just under horizon
  { proMoveId: 106, weekStart: weekStart(16) },  // weeksSince 16, exactly horizon
  { proMoveId: 107, weekStart: weekStart(30) },  // weeksSince 30, past the trickle window
  // 108, 109, 110 never selected -> weeksSince 999
];

export const FIXTURE_DOMAIN_COVERAGE: DomainCoverageRecord[] = [
  { domainId: 1, appearances: 8 },  // saturated -> D = 0
  { domainId: 2, appearances: 3 },  // partial
  { domainId: 4, appearances: 12 }, // over the cap -> D clamped to 0
  // domain 3 absent -> appearances 0 -> D = 1
];

export const FIXTURE_INPUTS: ScoringInputs = {
  confidenceHistory: FIXTURE_CONFIDENCE_HISTORY,
  individualLowCounts: FIXTURE_LOW_COUNTS,
  evals: FIXTURE_EVALS,
  lastSelected: FIXTURE_LAST_SELECTED,
  domainCoverage: FIXTURE_DOMAIN_COVERAGE,
  weights: FIXTURE_WEIGHTS,
  config: FIXTURE_CONFIG,
};
