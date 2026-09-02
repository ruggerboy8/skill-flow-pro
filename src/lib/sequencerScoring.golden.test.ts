/**
 * TST-4 characterization ("golden fixture") test.
 *
 * The reference implementation below is a VERBATIM copy of the scoreCandidate
 * closure, the preview re-score and the tie-break comparator as they existed
 * inline in supabase/functions/sequencer-rank/index.ts before the extraction
 * (commit f8758827 / branch point). The constants are re-declared locally on
 * purpose: importing them from the extracted module would let a change to a
 * constant move BOTH sides of the comparison and slip through.
 *
 * If this test fails, the extracted module no longer produces the same
 * recommendations the deployed edge function produced. That is a behavior
 * change, not a test problem.
 */
import { describe, expect, it } from 'vitest';
import {
  classifyConfidence,
  compareScoredMoves,
  scoreCandidate,
  scoreCandidateWithAdvancedState,
  type LastSelectedRecord,
} from '../../supabase/functions/_shared/sequencerScoring.ts';
import {
  FIXTURE_CONFIDENCE_HISTORY,
  FIXTURE_CONFIG,
  FIXTURE_DOMAIN_COVERAGE,
  FIXTURE_EVALS,
  FIXTURE_INPUTS,
  FIXTURE_LAST_SELECTED,
  FIXTURE_LOW_COUNTS,
  FIXTURE_MOVES,
  FIXTURE_WEIGHTS,
  PREVIEW_DATE,
  REFERENCE_DATE,
} from './sequencerScoringFixture.ts';

// ---------------------------------------------------------------------------
// Reference implementation (verbatim pre-extraction copy). Do not "clean up".
// ---------------------------------------------------------------------------

const MIN_SAMPLES = 12;
const BETA_PRIOR_A = 3;
const BETA_PRIOR_B = 3;
const TRICKLE_LONG = 24;
const TRICKLE_WEIGHT = 0.20;
const LOW_CONF_THRESHOLD = 0.30;
const STALE_WEEKS = 6;

const confidenceHistory = FIXTURE_CONFIDENCE_HISTORY;
const individualLowCounts = FIXTURE_LOW_COUNTS;
const evals = FIXTURE_EVALS;
const lastSelected = FIXTURE_LAST_SELECTED;
const domainCoverage = FIXTURE_DOMAIN_COVERAGE;
const weights = FIXTURE_WEIGHTS;
const config = FIXTURE_CONFIG;

const originalScoreCandidate = (move: any, referenceDate: string) => {
  // C (Collective Weakness) - combines tail pain + mean deficit
  const confData = confidenceHistory.filter(h => h.proMoveId === move.id);
  let smoothedConf = config.ebPrior;
  let p_low = 0.5; // Default to neutral
  let C = 0.5; // Default to neutral
  let avgConfLast: number | null = null;
  let lowConfShare: number | null = null;

  if (confData.length > 0) {
    // PHASE 1 FIX: Add safety guard for trimming to prevent NaN
    const trimCount = Math.floor(confData.length * config.trimPct);
    // Safety: ensure at least 1 element remains after trimming
    const safeTrimCount = Math.min(trimCount, Math.floor((confData.length - 1) / 2));
    const sorted = confData.map(d => d.avg).sort((a, b) => a - b);
    const trimmed = sorted.slice(safeTrimCount, sorted.length - safeTrimCount);

    // Fallback if trimmed is empty (shouldn't happen with safeTrimCount, but guard anyway)
    const sampleMean = trimmed.length > 0
      ? trimmed.reduce((sum, v) => sum + v, 0) / trimmed.length
      : sorted.reduce((sum, v) => sum + v, 0) / sorted.length;
    const totalN = confData.reduce((sum, d) => sum + d.n, 0);

    // EB smoothed mean
    smoothedConf = (config.ebPrior * config.ebK + sampleMean * totalN) / (config.ebK + totalN);

    // Use full lookback window average for UI (convert 0-1 back to 1-4 scale)
    avgConfLast = sampleMean * 3 + 1; // Convert 0-1 to 1-4 scale

    // Calculate low-tail rate using individual confidence scores
    const individualCounts = individualLowCounts.get(move.id) || { lowCount: 0, totalCount: 0 };

    // Beta EB: (a + low_count) / (a + b + total_count)
    p_low = (BETA_PRIOR_A + individualCounts.lowCount) / (BETA_PRIOR_A + BETA_PRIOR_B + individualCounts.totalCount);
    lowConfShare = p_low; // Store for UI

    // Collective Weakness: 60% tail pain + 40% mean deficit
    const mean_deficit = 1 - smoothedConf;
    C = 0.6 * p_low + 0.4 * mean_deficit;

    // Sample-size adjustment: shrink toward neutral if n < MIN_SAMPLES
    if (totalN < MIN_SAMPLES) {
      const lambda = Math.max(0, Math.min(1, totalN / MIN_SAMPLES));
      C = lambda * C + (1 - lambda) * 0.5;
    }
  }

  // R (Recency) - Linear post-cooldown + long-trickle tail
  const lastSeenRecord = lastSelected.find(ls => ls.proMoveId === move.id);
  const weeksSince = lastSeenRecord
    ? Math.floor((new Date(referenceDate).getTime() - new Date(lastSeenRecord.weekStart).getTime()) / (7 * 24 * 60 * 60 * 1000))
    : 999;

  const horizon = config.recencyHorizonWeeks === 0 ? 12 : config.recencyHorizonWeeks;
  const cooldown = config.cooldownWeeks;

  // Base recency (linear post-cooldown)
  let R = weeksSince <= cooldown ? 0
        : weeksSince >= horizon  ? 1
        : (weeksSince - cooldown) / (horizon - cooldown);

  // Long-trickle tail (ancient moves get a small bonus)
  const R_long = Math.min(weeksSince / TRICKLE_LONG, 1) * TRICKLE_WEIGHT;
  R = Math.min(R + R_long, 1); // Cap at 1

  // PHASE 2: Retest logic removed - hardcode to disabled
  const retestDue = false;

  // E (Eval) - Deficit with capped contribution
  const evalRecord = evals.find((e: { competencyId: number; score?: number }) => e.competencyId === move.competencyId);
  const evalScore01 = evalRecord?.score; // 0..1 (1=good, undefined=no data)
  const E_raw = evalScore01 == null ? 0 : Math.max(0, 1 - evalScore01); // deficit
  const eContrib = Math.min(E_raw * weights.E, config.evalCap); // cap contribution

  // D (Domain)
  const domainRecord = domainCoverage.find(dc => dc.domainId === move.domainId);
  const appearances = domainRecord ? domainRecord.appearances : 0;
  const D = 1 - Math.min(appearances / 8, 1);

  // T (Retest Boost) - PHASE 2: Hardcoded to 0 (logic removed)
  const T = 0;

  // Determine primary reason (server-side)
  let primaryReasonCode: 'LOW_CONF' | 'RETEST' | 'NEVER' | 'STALE' | 'TIE' = 'TIE';
  let primaryReasonValue: number | null = null;

  // PHASE 2: Removed RETEST check since retestDue is always false
  if (lowConfShare !== null && lowConfShare >= LOW_CONF_THRESHOLD) {
    primaryReasonCode = 'LOW_CONF';
    primaryReasonValue = lowConfShare;
  } else if (weeksSince === 999) {
    primaryReasonCode = 'NEVER';
  } else if (weeksSince >= STALE_WEEKS) {
    primaryReasonCode = 'STALE';
    primaryReasonValue = weeksSince;
  }

  // B (Curriculum Priority) - tiebreaker from AI-generated importance score
  const B = move.curriculumPriority != null ? Number(move.curriculumPriority) : 0.50;

  const final = (C * weights.C) + (R * weights.R) + (D * weights.D) + eContrib + T + (B * weights.B);

  const components = [
    { key: 'C', value: C * weights.C },
    { key: 'R', value: R * weights.R },
    { key: 'E', value: eContrib },
    { key: 'D', value: D * weights.D },
    { key: 'T', value: T },
    { key: 'B', value: B * weights.B },
  ];
  components.sort((a, b) => b.value - a.value);
  const drivers = components.slice(0, 2).map(c => c.key);

  return {
    C, R, E: E_raw, D, B, eContrib, final, drivers, weeksSince, T,
    lowConfShare, avgConfLast, retestDue,
    primaryReasonCode, primaryReasonValue
  };
};

const originalSort = (a: any, b: any) => {
  // 1. Final score desc
  if (Math.abs(b.final - a.final) >= 0.0001) return b.final - a.final;
  // 2. Low confidence share desc (higher = more problematic)
  if ((b.lowConfShare || 0) !== (a.lowConfShare || 0)) return (b.lowConfShare || 0) - (a.lowConfShare || 0);
  // 3. Weeks since practiced desc (longer = higher priority)
  if (a.weeksSince !== b.weeksSince) return b.weeksSince - a.weeksSince;
  // 4. ID asc (deterministic)
  return a.id - b.id;
};

const originalScoreWithAdvanced = (
  move: any,
  previewDateStr: string,
  advancedLastSelected: LastSelectedRecord[]
) => {
  const advancedRecord = advancedLastSelected.find(ls => ls.proMoveId === move.id);
  const weeksSince = advancedRecord
    ? Math.floor((new Date(previewDateStr).getTime() - new Date(advancedRecord.weekStart).getTime()) / (7 * 24 * 60 * 60 * 1000))
    : 999;

  const base = originalScoreCandidate(move, previewDateStr);

  // Recalculate R with advanced state
  const horizon = config.recencyHorizonWeeks === 0 ? 12 : config.recencyHorizonWeeks;
  const cooldown = config.cooldownWeeks;
  let R = weeksSince <= cooldown ? 0
        : weeksSince >= horizon  ? 1
        : (weeksSince - cooldown) / (horizon - cooldown);
  const R_long = Math.min(weeksSince / TRICKLE_LONG, 1) * TRICKLE_WEIGHT;
  R = Math.min(R + R_long, 1);

  const final = (base.C * weights.C) + (R * weights.R) + (base.D * weights.D) + base.eContrib + base.T + (base.B * weights.B);

  return { ...base, R, final, weeksSince };
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

/**
 * COR-6 added `confEB` to the returned score. It is a newly EXPOSED value (the
 * `smoothedConf` the pre-extraction code already computed internally), not a
 * new input to any formula, so it is dropped before comparing against the
 * pre-extraction reference implementation. Every scoring number below is still
 * compared field for field.
 */
function withoutConfEB<T extends { confEB?: number }>(score: T) {
  const { confEB: _confEB, ...rest } = score;
  return rest;
}

describe('sequencer scoring: golden fixture (pre- vs post-extraction)', () => {
  it('produces identical per-move scores for every candidate', () => {
    for (const move of FIXTURE_MOVES) {
      const before = originalScoreCandidate(move, REFERENCE_DATE);
      const after = scoreCandidate(move, REFERENCE_DATE, FIXTURE_INPUTS);
      expect(withoutConfEB(after), `move ${move.id}`).toEqual(before);
    }
  });

  it('produces an identical ranked order', () => {
    const before = FIXTURE_MOVES
      .map(m => ({ ...m, ...originalScoreCandidate(m, REFERENCE_DATE) }))
      .sort(originalSort);
    const after = FIXTURE_MOVES
      .map(m => ({ ...m, ...scoreCandidate(m, REFERENCE_DATE, FIXTURE_INPUTS) }))
      .sort(compareScoredMoves);

    expect(after.map(m => m.id)).toEqual(before.map(m => m.id));
    expect(after.map(withoutConfEB)).toEqual(before);
  });

  it('produces identical preview-week scores with advanced last-selected state', () => {
    // Mirrors the edge function: the current week's picks get their
    // last-selected week advanced to the effective date before re-scoring.
    const picks = FIXTURE_MOVES
      .map(m => ({ ...m, ...scoreCandidate(m, REFERENCE_DATE, FIXTURE_INPUTS) }))
      .sort(compareScoredMoves)
      .filter(m => m.weeksSince >= FIXTURE_CONFIG.cooldownWeeks)
      .slice(0, 6);

    const advancedLastSelected: LastSelectedRecord[] = FIXTURE_LAST_SELECTED
      .filter(ls => !picks.find(p => p.id === ls.proMoveId))
      .concat(picks.map(p => ({ proMoveId: p.id, weekStart: REFERENCE_DATE })));

    for (const move of FIXTURE_MOVES) {
      const before = originalScoreWithAdvanced(move, PREVIEW_DATE, advancedLastSelected);
      const after = scoreCandidateWithAdvancedState(
        move,
        PREVIEW_DATE,
        advancedLastSelected,
        FIXTURE_INPUTS
      );
      expect(withoutConfEB(after), `preview move ${move.id}`).toEqual(before);
    }
  });

  /**
   * Independent pin. The reference implementation above and the extracted
   * module could in principle both be changed together; these literals were
   * captured from the ORIGINAL inline code and are not derived from either
   * side at run time.
   */
  it('pins the ranked order and integer scores to captured values', () => {
    const ranked = FIXTURE_MOVES
      .map(m => ({ ...m, ...scoreCandidate(m, REFERENCE_DATE, FIXTURE_INPUTS) }))
      .sort(compareScoredMoves);

    expect(
      ranked.map(m => ({
        id: m.id,
        score: Math.round(m.final * 100),
        final: Number(m.final.toFixed(6)),
        reason: m.primaryReasonCode,
      }))
    ).toEqual([
      { id: 108, score: 69, final: 0.693947, reason: 'LOW_CONF' },
      { id: 106, score: 69, final: 0.687083, reason: 'LOW_CONF' },
      { id: 105, score: 67, final: 0.671509, reason: 'LOW_CONF' },
      { id: 109, score: 54, final: 0.53625, reason: 'NEVER' },
      { id: 110, score: 52, final: 0.52, reason: 'NEVER' },
      { id: 102, score: 46, final: 0.45703, reason: 'LOW_CONF' },
      { id: 104, score: 39, final: 0.385932, reason: 'LOW_CONF' },
      { id: 101, score: 33, final: 0.327077, reason: 'TIE' },
      { id: 107, score: 31, final: 0.311429, reason: 'STALE' },
      { id: 103, score: 17, final: 0.17438, reason: 'TIE' },
    ]);
  });
});

/**
 * COR-6 characterization of the confidence badge the edge function puts on
 * every response row. `formatRow` in supabase/functions/sequencer-rank/index.ts
 * builds `status` exactly this way, so this test is the closest thing to an
 * end-to-end pin on what a coach sees.
 *
 * The "before (wrong)" column is what the deployed function returns today,
 * captured on this fixture before the fix. It classified on `C` (collective
 * weakness, HIGH is bad) through a function that expects EB confidence (LOW is
 * bad), so the badge was inverted.
 */
describe('COR-6: response-row confidence status for the golden fixture', () => {
  const statusFor = (moveId: number, value: number) =>
    classifyConfidence(
      value,
      FIXTURE_CONFIDENCE_HISTORY.filter(h => h.proMoveId === moveId)
    ).status;

  it('pins the corrected status for every fixture move', () => {
    const rows = FIXTURE_MOVES.map(move => {
      const scored = scoreCandidate(move, REFERENCE_DATE, FIXTURE_INPUTS);
      return { id: move.id, status: statusFor(move.id, scored.confEB) };
    });

    // after (correct): classified on confEB
    expect(rows).toEqual([
      { id: 101, status: 'ok' },      // before (wrong): ok
      { id: 102, status: 'ok' },      // before (wrong): ok
      { id: 103, status: 'ok' },      // before (wrong): watch   <- FLIPPED
      { id: 104, status: 'ok' },      // before (wrong): ok
      { id: 105, status: 'ok' },      // before (wrong): ok
      { id: 106, status: 'ok' },      // before (wrong): ok
      { id: 107, status: 'ok' },      // before (wrong): critical <- FLIPPED
      { id: 108, status: 'watch' },   // before (wrong): watch
      { id: 109, status: 'ok' },      // before (wrong): ok
      { id: 110, status: 'ok' },      // before (wrong): ok
    ]);
  });

  it('reproduces the old inverted statuses when C is passed instead', () => {
    // Guard against a silent regression to the old wiring: if someone puts
    // `m.C` back, these are the badges that come out, and the pin above fails.
    const rows = FIXTURE_MOVES.map(move => {
      const scored = scoreCandidate(move, REFERENCE_DATE, FIXTURE_INPUTS);
      return { id: move.id, status: statusFor(move.id, scored.C) };
    });

    expect(rows).toEqual([
      { id: 101, status: 'ok' },
      { id: 102, status: 'ok' },
      { id: 103, status: 'watch' },
      { id: 104, status: 'ok' },
      { id: 105, status: 'ok' },
      { id: 106, status: 'ok' },
      { id: 107, status: 'critical' },
      { id: 108, status: 'watch' },
      { id: 109, status: 'ok' },
      { id: 110, status: 'ok' },
    ]);
  });

  it('shows the flip on the two moves that changed', () => {
    // 107: weekly confidence averages of 0.90 and 1.00 (near 4 of 4) with 15
    // responses across the last two weeks. The team understands this one, and
    // it was the loudest CRITICAL on the board.
    const m107 = scoreCandidate(FIXTURE_MOVES[6], REFERENCE_DATE, FIXTURE_INPUTS);
    expect(FIXTURE_MOVES[6].id).toBe(107);
    expect(m107.confEB).toBeGreaterThan(0.30);
    expect(statusFor(107, m107.C)).toBe('critical');
    expect(statusFor(107, m107.confEB)).toBe('ok');

    // 103: also high confidence (confEB ~0.76), previously badged Watch.
    const m103 = scoreCandidate(FIXTURE_MOVES[2], REFERENCE_DATE, FIXTURE_INPUTS);
    expect(FIXTURE_MOVES[2].id).toBe(103);
    expect(m103.confEB).toBeGreaterThan(0.30);
    expect(statusFor(103, m103.C)).toBe('watch');
    expect(statusFor(103, m103.confEB)).toBe('ok');
  });
});
