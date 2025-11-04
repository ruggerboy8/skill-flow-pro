/**
 * Phase 2: Org Sequencer Engine
 * 
 * Selection algorithm with constraints:
 * - Cooldown ≥2 weeks
 * - Diversity ≥2 domains per week
 * - Coverage ≥1×/4 weeks (org-wide, log-only in Phase 2)
 * 
 * Deterministic tie-breaking: E > R > weeksSinceSeen > lower ID
 */

import {
  EngineConfig,
  OrgInputs,
  Pick,
  TwoWeekResult,
  WeekPlan,
  ProMove,
} from './types';
import {
  computeRecencyScore,
  computeConfidenceNeed,
  computeEvalBoost,
  computeDomainUnderRep,
  combineNeedScore,
  topDrivers,
} from './needScore';
import { startOfNextWeekMonday, addWeeks, toISODate, weeksBetween } from './time';

type SignalParts = { C: number; R: number; E: number; D: number };

interface Eligibility {
  weeksSinceSeen: number;
  lastSeenIso?: string;
}

interface ScoredCandidate {
  move: ProMove;
  score: number;
  drivers: string[];
  parts: SignalParts;
  eligibility: Eligibility;
}

/**
 * Build eligibility map: weeks since each move was last selected.
 */
function buildEligibilityMap(inputs: OrgInputs, weekStartIso: string): Map<number, Eligibility> {
  const map = new Map<number, Eligibility>();
  
  for (const move of inputs.eligibleMoves) {
    const lastEntry = inputs.lastSelected.find(ls => ls.proMoveId === move.id);
    
    if (!lastEntry) {
      map.set(move.id, { weeksSinceSeen: Number.POSITIVE_INFINITY });
      continue;
    }
    
    const weeks = weeksBetween(lastEntry.weekStart, weekStartIso, inputs.timezone);
    map.set(move.id, {
      weeksSinceSeen: weeks,
      lastSeenIso: lastEntry.weekStart,
    });
  }
  
  return map;
}

/**
 * Compute recency horizon H based on eligible move count.
 */
function computeHorizon(cfg: EngineConfig, eligibleCount: number): number {
  if (cfg.recencyHorizonWeeks > 0) return cfg.recencyHorizonWeeks;
  
  const base = Math.ceil(eligibleCount / 3);
  return Math.max(cfg.cooldownWeeks + 3, Math.ceil(base * 1.25));
}

/**
 * Score a single move using all signals (C, R, E, D).
 */
function scoreMove(
  move: ProMove,
  inputs: OrgInputs,
  cfg: EngineConfig,
  eligibility: Eligibility
): { final: number; drivers: string[]; parts: SignalParts } {
  // C: Confidence need
  const C = computeConfidenceNeed(move.id, inputs.confidenceHistory, cfg);
  
  // R: Recency
  const H = computeHorizon(cfg, inputs.eligibleMoves.length);
  const R = computeRecencyScore(eligibility.weeksSinceSeen, H, cfg.cooldownWeeks);
  
  // E: Eval boost
  const E = computeEvalBoost(move, inputs.evals);
  
  // D: Domain under-representation
  const D = computeDomainUnderRep(move, inputs.domainCoverage8w);
  
  const parts = { C, R, E, D };
  const final = combineNeedScore(parts, cfg);
  const drivers = topDrivers(parts, cfg);
  
  return { final, drivers, parts };
}

/**
 * Score all candidates for a given week.
 */
function scoreAllCandidates(
  inputs: OrgInputs,
  cfg: EngineConfig,
  weekStartIso: string
): ScoredCandidate[] {
  const eligMap = buildEligibilityMap(inputs, weekStartIso);
  
  return inputs.eligibleMoves.map(move => {
    const eligibility = eligMap.get(move.id) || { weeksSinceSeen: Number.POSITIVE_INFINITY };
    const scored = scoreMove(move, inputs, cfg, eligibility);
    
    return {
      move,
      score: scored.final,
      drivers: scored.drivers,
      parts: scored.parts,
      eligibility,
    };
  });
}

/**
 * Deterministic tie-breaker: weighted E (capped) > weighted R > weeksSinceSeen > lower ID.
 */
function compareCandidates(a: ScoredCandidate, b: ScoredCandidate, cfg: EngineConfig): number {
  // Primary: higher score
  if (a.score !== b.score) return b.score - a.score;
  
  // Tie-break 1: higher weighted & capped E contribution
  const eA = Math.min(a.parts.E * cfg.weights.E, cfg.evalCap);
  const eB = Math.min(b.parts.E * cfg.weights.E, cfg.evalCap);
  if (eA !== eB) return eB - eA;
  
  // Tie-break 2: higher weighted R contribution
  const rA = a.parts.R * cfg.weights.R;
  const rB = b.parts.R * cfg.weights.R;
  if (rA !== rB) return rB - rA;
  
  // Tie-break 3: larger weeksSinceSeen (older)
  const wsA = a.eligibility.weeksSinceSeen;
  const wsB = b.eligibility.weeksSinceSeen;
  if (wsA !== wsB) return wsB - wsA;
  
  // Tie-break 4: lower ID (stable)
  return a.move.id - b.move.id;
}

/**
 * Select 3 moves with constraints: cooldown ≥2w, diversity ≥2 domains.
 */
function pickThree(
  candidates: ScoredCandidate[],
  cfg: EngineConfig,
  logs: string[]
): Pick[] {
  const picks: Pick[] = [];
  const usedIds = new Set<number>();
  const usedDomains = new Set<number>();
  
  // Pre-filter by cooldown
  let pool = candidates.filter(c => c.eligibility.weeksSinceSeen >= cfg.cooldownWeeks);
  
  if (pool.length < 3) {
    logs.push(
      `⚠️ Relaxation (cooldown): Only ${pool.length} moves passed cooldown filter (≥${cfg.cooldownWeeks}w). Using all candidates.`
    );
    pool = candidates;
  }
  
  // Sort with deterministic tie-breaking
  pool.sort((a, b) => compareCandidates(a, b, cfg));
  
  const addPick = (c: ScoredCandidate, pickNum?: number) => {
    // Check for tie-break (next candidate has same score)
    const idx = pool.indexOf(c);
    if (idx > 0 && pool[idx - 1].score === c.score) {
      logs.push(`ℹ️ Tie-break applied for pick ${pickNum || picks.length + 1}: weighted E→R→weeksSince→id`);
    }
    
    picks.push({
      proMoveId: c.move.id,
      name: c.move.name,
      domainId: c.move.domainId,
      finalScore: c.score,
      drivers: c.drivers as ('C'|'R'|'E'|'D')[],
    });
    usedIds.add(c.move.id);
    usedDomains.add(c.move.domainId);
  };
  
  // Pick 1: Best overall
  if (pool.length > 0) {
    addPick(pool[0], 1);
  }
  
  // Pick 2: Prefer new domain for diversity
  const needDiversity = usedDomains.size < cfg.diversityMinDomainsPerWeek;
  const second = pool.find(c => !usedIds.has(c.move.id) && (!needDiversity || !usedDomains.has(c.move.domainId)));
  
  if (second) {
    addPick(second, 2);
  } else {
    const fallback = pool.find(c => !usedIds.has(c.move.id));
    if (fallback) {
      addPick(fallback, 2);
      if (needDiversity) {
        logs.push('⚠️ Relaxation (diversity): Could not satisfy diversity constraint for pick 2.');
      }
    }
  }
  
  // Pick 3: Ensure ≥2 domains total
  const stillNeedDiversity = usedDomains.size < cfg.diversityMinDomainsPerWeek;
  const third = pool.find(c => !usedIds.has(c.move.id) && (!stillNeedDiversity || !usedDomains.has(c.move.domainId)));
  
  if (third) {
    addPick(third, 3);
  } else {
    const fallback = pool.find(c => !usedIds.has(c.move.id));
    if (fallback) {
      addPick(fallback, 3);
      if (stillNeedDiversity) {
        logs.push('⚠️ Relaxation (diversity): Could not satisfy diversity constraint for pick 3.');
      }
    }
  }
  
  // Coverage constraint: Phase 2 log-only (relies on D-lift)
  if (usedDomains.size < cfg.diversityMinDomainsPerWeek) {
    logs.push(`ℹ️ Note: Week has only ${usedDomains.size} domains (target: ${cfg.diversityMinDomainsPerWeek}).`);
  }
  
  return picks;
}

/**
 * Compute one week's plan.
 */
export function computeWeek(
  inputs: OrgInputs,
  cfg: EngineConfig,
  weekStartIso: string,
  logs: string[]
): WeekPlan {
  const candidates = scoreAllCandidates(inputs, cfg, weekStartIso);
  const picks = pickThree(candidates, cfg, logs);
  
  return { weekStart: weekStartIso, picks };
}

/**
 * Main entry point: compute Next Week (N) and Preview (N+1).
 * 
 * Phase 2: Preview reuses same inputs (no state advancement).
 * Phase 3 TODO: Adapter will advance cooldowns/decays for preview.
 */
export async function computeNextAndPreview(
  inputs: OrgInputs,
  cfg: EngineConfig
): Promise<TwoWeekResult> {
  const logs: string[] = [];
  
  // Derive next Monday after effective date
  const nextMon = startOfNextWeekMonday(inputs.now, inputs.timezone);
  const weekStartIso = toISODate(nextMon, inputs.timezone);
  
  logs.push(`📅 Computing for role ${inputs.role} (${inputs.role === 1 ? 'DFI' : 'RDA'})`);
  logs.push(`🕐 Effective date: ${toISODate(inputs.now, inputs.timezone)} (${inputs.timezone})`);
  logs.push(`📍 Next week starts: ${weekStartIso}`);
  logs.push(`🎯 Eligible moves: ${inputs.eligibleMoves.length}`);
  
  // Compute Next Week
  const next = computeWeek(inputs, cfg, weekStartIso, logs);
  
  // Compute Preview (N+1)
  const previewMon = addWeeks(nextMon, 1, inputs.timezone);
  const previewStartIso = toISODate(previewMon, inputs.timezone);
  
  logs.push(`📍 Preview week starts: ${previewStartIso}`);
  logs.push('ℹ️ Phase 2: Preview uses same inputs (no state advancement).');
  
  const preview = computeWeek(inputs, cfg, previewStartIso, logs);
  
  return { next, preview, logs };
}
