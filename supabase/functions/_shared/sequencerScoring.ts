/**
 * Pure scoring math for the sequencer-rank edge function.
 *
 * This module deliberately has ZERO Deno and ZERO Supabase dependencies. It
 * takes already-fetched data as plain arguments so that both the Deno edge
 * function (via a relative `../_shared/sequencerScoring.ts` import) and Vitest
 * running under Node can import it.
 *
 * Extracted verbatim from supabase/functions/sequencer-rank/index.ts in TST-4.
 * Behavior-preserving: no constant, formula or tie-break was changed.
 */

// Collective Weakness constants
export const LOW_CUTOFF = 2; // 1-4 scale: <=2 is "low confidence"
export const MIN_SAMPLES = 12; // Minimum staff-weeks to trust signals
export const BETA_PRIOR_A = 3; // Beta prior for low-rate EB
export const BETA_PRIOR_B = 3;

// Recency constants
export const RECENCY_HORIZON = 16; // Fixed horizon
export const TRICKLE_LONG = 24; // Long-tail bonus threshold
export const TRICKLE_WEIGHT = 0.20; // Long-tail contribution weight

// Primary reason thresholds
export const LOW_CONF_THRESHOLD = 0.30;
export const STALE_WEEKS = 6;

export const NEVER_SELECTED_WEEKS = 999;

export interface ScoringWeights {
  C: number;
  R: number;
  E: number;
  D: number;
  B: number;
}

export interface ScoringConfig {
  cooldownWeeks: number;
  recencyHorizonWeeks: number;
  ebPrior: number;
  ebK: number;
  trimPct: number;
  evalCap: number;
}

export interface CandidateMove {
  id: number;
  competencyId: number;
  domainId: number;
  curriculumPriority: number | string | null;
}

export interface ConfidencePoint {
  proMoveId: number;
  weekStart: string;
  avg: number;
  n: number;
}

export interface LowConfidenceCounts {
  lowCount: number;
  totalCount: number;
}

export interface EvalScore {
  competencyId: number;
  score?: number | null;
}

export interface LastSelectedRecord {
  proMoveId: number;
  weekStart: string;
}

export interface DomainCoverageRecord {
  domainId: number;
  appearances: number;
}

export interface ScoringInputs {
  confidenceHistory: ConfidencePoint[];
  individualLowCounts: Map<number, LowConfidenceCounts>;
  evals: EvalScore[];
  lastSelected: LastSelectedRecord[];
  domainCoverage: DomainCoverageRecord[];
  weights: ScoringWeights;
  config: ScoringConfig;
}

export type PrimaryReasonCode = 'LOW_CONF' | 'RETEST' | 'NEVER' | 'STALE' | 'TIE';

export interface CandidateScore {
  C: number;
  R: number;
  E: number;
  D: number;
  B: number;
  eContrib: number;
  final: number;
  drivers: string[];
  weeksSince: number;
  T: number;
  lowConfShare: number | null;
  avgConfLast: number | null;
  retestDue: boolean;
  primaryReasonCode: PrimaryReasonCode;
  primaryReasonValue: number | null;
}

export interface ConfidenceStatus {
  status: 'critical' | 'watch' | 'ok';
  severity?: number;
  n2w?: number;
  recentMeans?: number[];
}

/** Classify a move's confidence signal for UI badges. */
export function classifyConfidence(
  confEB: number,
  recent: { avg: number; n: number }[]
): ConfidenceStatus {
  const lastTwo = recent.slice(-2);
  const n2w = lastTwo.reduce((s, r) => s + (r?.n || 0), 0);
  const recentMeans = lastTwo.map(r => r?.avg ?? 0);

  const isCritical = confEB <= 0.20 && n2w >= 10;
  if (isCritical) {
    const severity = Math.max(0, Math.min(1, (0.25 - confEB) / 0.25));
    return { status: 'critical', severity, n2w, recentMeans };
  }

  const anyVeryLow = lastTwo.some(r => (r?.avg ?? 1) <= 0.20 && (r?.n ?? 0) >= 5);
  const isWatch = confEB <= 0.30 || anyVeryLow;
  if (isWatch) return { status: 'watch', n2w, recentMeans };

  return { status: 'ok', n2w, recentMeans };
}

/** Whole weeks between a move's last selection and the reference date. */
export function computeWeeksSince(
  referenceDate: string,
  lastSelectedWeekStart: string | null | undefined
): number {
  if (!lastSelectedWeekStart) return NEVER_SELECTED_WEEKS;
  return Math.floor(
    (new Date(referenceDate).getTime() - new Date(lastSelectedWeekStart).getTime()) /
      (7 * 24 * 60 * 60 * 1000)
  );
}

/** R component: linear ramp after the cooldown plus the long-trickle tail. */
export function computeRecency(
  weeksSince: number,
  cooldownWeeks: number,
  recencyHorizonWeeks: number
): number {
  const horizon = recencyHorizonWeeks === 0 ? 12 : recencyHorizonWeeks;
  const cooldown = cooldownWeeks;

  // Base recency (linear post-cooldown)
  let R = weeksSince <= cooldown ? 0
        : weeksSince >= horizon  ? 1
        : (weeksSince - cooldown) / (horizon - cooldown);

  // Long-trickle tail (ancient moves get a small bonus)
  const R_long = Math.min(weeksSince / TRICKLE_LONG, 1) * TRICKLE_WEIGHT;
  R = Math.min(R + R_long, 1); // Cap at 1

  return R;
}

/** Weighted sum of the components plus the top-two driver labels. */
export function combineComponents(
  parts: { C: number; R: number; D: number; B: number; eContrib: number; T: number },
  weights: ScoringWeights
): { final: number; drivers: string[] } {
  const final = (parts.C * weights.C) + (parts.R * weights.R) + (parts.D * weights.D) +
    parts.eContrib + parts.T + (parts.B * weights.B);

  const components = [
    { key: 'C', value: parts.C * weights.C },
    { key: 'R', value: parts.R * weights.R },
    { key: 'E', value: parts.eContrib },
    { key: 'D', value: parts.D * weights.D },
    { key: 'T', value: parts.T },
    { key: 'B', value: parts.B * weights.B },
  ];
  components.sort((a, b) => b.value - a.value);
  const drivers = components.slice(0, 2).map(c => c.key);

  return { final, drivers };
}

/** Score one candidate pro move against already-fetched history. */
export function scoreCandidate(
  move: CandidateMove,
  referenceDate: string,
  inputs: ScoringInputs
): CandidateScore {
  const {
    confidenceHistory,
    individualLowCounts,
    evals,
    lastSelected,
    domainCoverage,
    weights,
    config,
  } = inputs;

  // C (Collective Weakness) - combines tail pain + mean deficit
  const confData = confidenceHistory.filter(h => h.proMoveId === move.id);
  let smoothedConf = config.ebPrior;
  let p_low = 0.5; // Default to neutral
  let C = 0.5; // Default to neutral
  let avgConfLast: number | null = null;
  let lowConfShare: number | null = null;

  if (confData.length > 0) {
    // Safety guard for trimming to prevent NaN
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
    p_low = (BETA_PRIOR_A + individualCounts.lowCount) /
      (BETA_PRIOR_A + BETA_PRIOR_B + individualCounts.totalCount);
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
  const weeksSince = computeWeeksSince(referenceDate, lastSeenRecord?.weekStart);
  const R = computeRecency(weeksSince, config.cooldownWeeks, config.recencyHorizonWeeks);

  // PHASE 2: Retest logic removed - hardcode to disabled
  const retestDue = false;

  // E (Eval) - Deficit with capped contribution
  const evalRecord = evals.find(e => e.competencyId === move.competencyId);
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
  let primaryReasonCode: PrimaryReasonCode = 'TIE';
  let primaryReasonValue: number | null = null;

  // PHASE 2: Removed RETEST check since retestDue is always false
  if (lowConfShare !== null && lowConfShare >= LOW_CONF_THRESHOLD) {
    primaryReasonCode = 'LOW_CONF';
    primaryReasonValue = lowConfShare;
  } else if (weeksSince === NEVER_SELECTED_WEEKS) {
    primaryReasonCode = 'NEVER';
  } else if (weeksSince >= STALE_WEEKS) {
    primaryReasonCode = 'STALE';
    primaryReasonValue = weeksSince;
  }

  // B (Curriculum Priority) - tiebreaker from AI-generated importance score
  const B = move.curriculumPriority != null ? Number(move.curriculumPriority) : 0.50;

  const { final, drivers } = combineComponents({ C, R, D, B, eContrib, T }, weights);

  return {
    C, R, E: E_raw, D, B, eContrib, final, drivers, weeksSince, T,
    lowConfShare, avgConfLast, retestDue,
    primaryReasonCode, primaryReasonValue,
  };
}

/**
 * Re-score a candidate for the preview week, where the moves picked for the
 * current week have had their last-selected date advanced.
 */
export function scoreCandidateWithAdvancedState(
  move: CandidateMove,
  previewDate: string,
  advancedLastSelected: LastSelectedRecord[],
  inputs: ScoringInputs
): CandidateScore {
  const advancedRecord = advancedLastSelected.find(ls => ls.proMoveId === move.id);
  const weeksSince = computeWeeksSince(previewDate, advancedRecord?.weekStart);

  const base = scoreCandidate(move, previewDate, inputs);

  // Recalculate R with advanced state
  const R = computeRecency(
    weeksSince,
    inputs.config.cooldownWeeks,
    inputs.config.recencyHorizonWeeks
  );

  const { final } = combineComponents(
    { C: base.C, R, D: base.D, B: base.B, eContrib: base.eContrib, T: base.T },
    inputs.weights
  );

  return { ...base, R, final, weeksSince };
}

/**
 * Deterministic tie-breaks: finalScore -> lowConfShare -> lastPracticedWeeks
 * desc -> actionId asc.
 */
export function compareScoredMoves(
  a: { final: number; lowConfShare: number | null; weeksSince: number; id: number },
  b: { final: number; lowConfShare: number | null; weeksSince: number; id: number }
): number {
  // 1. Final score desc
  if (Math.abs(b.final - a.final) >= 0.0001) return b.final - a.final;
  // 2. Low confidence share desc (higher = more problematic)
  if ((b.lowConfShare || 0) !== (a.lowConfShare || 0)) return (b.lowConfShare || 0) - (a.lowConfShare || 0);
  // 3. Weeks since practiced desc (longer = higher priority)
  if (a.weeksSince !== b.weeksSince) return b.weeksSince - a.weeksSince;
  // 4. ID asc (deterministic)
  return a.id - b.id;
}
