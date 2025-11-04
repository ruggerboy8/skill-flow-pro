/**
 * Phase 2: NeedScore v1 - Signal Calculations
 * 
 * Computes C (confidence need), R (recency), E (eval boost), D (domain under-rep).
 * Combines into final 0..1 score with why-tags.
 */

import { ConfidenceSample, EvalCompetency, ProMove, DomainCoverage, EngineConfig } from './types';

type SignalParts = { C: number; R: number; E: number; D: number };
export type WhyTag = keyof SignalParts;

/**
 * Compute recency score: 0 if within cooldown, linear 0→1 from cooldown to horizon.
 */
export function computeRecencyScore(
  weeksSince: number,
  horizonH: number,
  cooldown: number
): number {
  if (weeksSince <= cooldown) return 0;
  
  const start = cooldown;
  const end = Math.max(horizonH, start + 1);
  
  if (weeksSince >= end) return 1;
  
  return (weeksSince - start) / (end - start);
}

/**
 * Compute trimmed mean, excluding top/bottom trimPct percentiles.
 */
export function trimmedMean(values: number[], trimPct: number): number {
  if (values.length === 0) return 0;
  
  const sorted = [...values].sort((a, b) => a - b);
  const k = Math.floor(values.length * trimPct);
  const trimmed = sorted.slice(k, sorted.length - k);
  
  if (trimmed.length === 0) return 0;
  
  const sum = trimmed.reduce((s, v) => s + v, 0);
  return sum / trimmed.length;
}

/**
 * Empirical Bayes smoothing: shrink sample mean toward prior.
 */
export function ebSmooth(mean: number, n: number, prior: number, k: number): number {
  return ((n * mean) + (k * prior)) / (n + k);
}

/**
 * Compute confidence need (1 - confidence).
 * 
 * Phase 2: Simplified binning - treats all samples equally.
 * Phase 3 TODO: Weight by recency (0-6w×3, 7-12w×2, 13-18w×1).
 */
export function computeConfidenceNeed(
  moveId: number,
  samples: ConfidenceSample[],
  cfg: EngineConfig
): number {
  const moveSamples = samples.filter(s => s.proMoveId === moveId);
  
  if (moveSamples.length === 0) {
    // No data: return prior need (1 - prior confidence)
    return 1 - cfg.ebPrior;
  }
  
  // Collect all confidence values weighted by sample size
  const allValues: number[] = [];
  let totalN = 0;
  
  for (const s of moveSamples) {
    const weight = Math.max(1, Math.round(s.n));
    for (let i = 0; i < weight; i++) {
      allValues.push(s.avg);
    }
    totalN += weight;
  }
  
  // Compute trimmed mean and EB smooth
  const rawMean = trimmedMean(allValues, cfg.trimPct);
  const smoothed = ebSmooth(rawMean, totalN, cfg.ebPrior, cfg.ebK);
  
  // Need = 1 - confidence
  return Math.max(0, Math.min(1, 1 - smoothed));
}

/**
 * Compute eval boost based on competency deficit.
 * 
 * Phase 2: Single competency with weight 1.0.
 * Phase 3 TODO: Support competencyWeights: Record<number, number>.
 */
export function computeEvalBoost(
  move: ProMove,
  evals: EvalCompetency[]
): number {
  const evalScore = evals.find(e => e.competencyId === move.competencyId);
  
  if (!evalScore) return 0;
  
  // Deficit = 1 - score (where 1 is excellent, 0 is poor)
  const deficit = Math.max(0, 1 - evalScore.score01);
  
  return Math.max(0, Math.min(1, deficit));
}

/**
 * Compute domain under-representation nudge.
 * 
 * Returns 0..1 lift if move's domain is under-represented in last 8 weeks.
 */
export function computeDomainUnderRep(
  move: ProMove,
  coverage8w: DomainCoverage[]
): number {
  if (coverage8w.length === 0) return 0;
  
  const totalAppearances = coverage8w.reduce((sum, d) => sum + d.appearances, 0);
  
  if (totalAppearances === 0) return 0;
  
  const avgPerDomain = totalAppearances / coverage8w.length;
  const domainData = coverage8w.find(d => d.domainId === move.domainId);
  
  if (!domainData) return 0;
  
  if (domainData.appearances >= avgPerDomain) return 0;
  
  const deficit = (avgPerDomain - domainData.appearances) / Math.max(1, avgPerDomain);
  
  return Math.max(0, Math.min(1, deficit));
}

/**
 * Combine signal parts into final NeedScore with E contribution cap.
 */
export function combineNeedScore(parts: SignalParts, cfg: EngineConfig): number {
  const { C, R, E, D } = parts;
  const { weights, evalCap } = cfg;
  
  // Calculate raw weighted sum
  const eTerm = weights.E * E;
  const nonE = (weights.C * C) + (weights.R * R) + (weights.D * D);
  
  // Cap E contribution to evalCap (default 0.25)
  const cappedETerm = Math.min(eTerm, evalCap);
  const raw = nonE + cappedETerm;
  
  return Math.max(0, Math.min(1, raw));
}

/**
 * Identify top 2 score drivers by weighted contribution.
 */
export function topDrivers(parts: SignalParts, cfg: EngineConfig): WhyTag[] {
  const entries: [WhyTag, number][] = [
    ['C', cfg.weights.C * parts.C],
    ['R', cfg.weights.R * parts.R],
    ['E', cfg.weights.E * parts.E],
    ['D', cfg.weights.D * parts.D],
  ];
  
  entries.sort((a, b) => b[1] - a[1]);
  
  return entries.slice(0, 2).map(e => e[0]);
}
