// Core sequencer engine - scoring and week computation logic

import type {
  OrgInputs,
  EngineConfig,
  ScoreBreakdown,
  EligibleMove,
  RankedRow,
} from './types';
import { formatMmDdYyyy, formatWeeksSince } from './formatters';

interface ScoredMove extends EligibleMove {
  breakdown: ScoreBreakdown;
}

export function scoreCandidate(
  move: EligibleMove,
  inputs: OrgInputs,
  config: EngineConfig,
  referenceDate: string
): ScoreBreakdown {
  const { weights, ebPrior, ebK, trimPct, evalCap, recencyHorizonWeeks } = config;

  // C (Confidence): 1 - empirical Bayes smoothed confidence
  const confData = inputs.confidenceHistory.filter(h => h.proMoveId === move.id);
  let smoothedConf = ebPrior;
  if (confData.length > 0) {
    // Trim outliers
    const trimCount = Math.floor(confData.length * trimPct);
    const sorted = confData.map(d => d.avg).sort((a, b) => a - b);
    const trimmed = sorted.slice(trimCount, sorted.length - trimCount);
    
    const sampleMean = trimmed.reduce((sum, v) => sum + v, 0) / trimmed.length;
    const totalN = confData.reduce((sum, d) => d.n, 0);
    
    // Empirical Bayes: (prior * k + sample * n) / (k + n)
    smoothedConf = (ebPrior * ebK + sampleMean * totalN) / (ebK + totalN);
  }
  const C = 1 - smoothedConf;

  // R (Recency): exponential decay based on weeks since last seen
  const lastSeenRecord = inputs.lastSelected.find(ls => ls.proMoveId === move.id);
  const weeksSince = lastSeenRecord
    ? formatWeeksSince(lastSeenRecord.weekStart, referenceDate)
    : 999;
  
  const horizon = recencyHorizonWeeks === 0 ? 12 : recencyHorizonWeeks;
  const R = weeksSince >= horizon ? 1.0 : Math.exp(-weeksSince / horizon);

  // E (Eval): capped quarterly observer score
  const evalRecord = inputs.evals.find(e => e.competencyId === move.competencyId);
  const evalScore = evalRecord ? evalRecord.score : 0;
  const E = Math.min(evalScore, evalCap);

  // D (Domain): 1 - (appearances / 8) for last 8 weeks
  const domainRecord = inputs.domainCoverage.find(dc => dc.domainId === move.domainId);
  const appearances = domainRecord ? domainRecord.appearances : 0;
  const D = 1 - Math.min(appearances / 8, 1);

  // Final weighted sum
  const final = C * weights.C + R * weights.R + E * weights.E + D * weights.D;

  // Determine top 2 drivers
  const components = [
    { key: 'C' as const, value: C * weights.C },
    { key: 'R' as const, value: R * weights.R },
    { key: 'E' as const, value: E * weights.E },
    { key: 'D' as const, value: D * weights.D },
  ];
  components.sort((a, b) => b.value - a.value);
  const drivers = components.slice(0, 2).map(c => c.key);

  return { C, R, E, D, final, drivers };
}

export function computeWeek(
  candidates: EligibleMove[],
  inputs: OrgInputs,
  config: EngineConfig,
  weekStart: string,
  logs: string[]
): ScoredMove[] {
  const { cooldownWeeks, diversityMinDomainsPerWeek } = config;

  // Score all candidates
  const scored: ScoredMove[] = candidates.map(move => ({
    ...move,
    breakdown: scoreCandidate(move, inputs, config, weekStart),
  }));

  // Apply cooldown filter
  const eligible = scored.filter(move => {
    const lastSeenRecord = inputs.lastSelected.find(ls => ls.proMoveId === move.id);
    if (!lastSeenRecord) return true;
    
    const weeksSince = formatWeeksSince(lastSeenRecord.weekStart, weekStart);
    return weeksSince >= cooldownWeeks;
  });

  if (eligible.length < 3) {
    logs.push(`Warning: Only ${eligible.length} moves pass cooldown filter`);
  }

  // Sort by final score DESC, tie-breaker by proMoveId ASC
  eligible.sort((a, b) => {
    if (Math.abs(b.breakdown.final - a.breakdown.final) < 0.0001) {
      return a.id - b.id;
    }
    return b.breakdown.final - a.breakdown.final;
  });

  // Pick top 3 with diversity constraint
  const picks: ScoredMove[] = [];
  const usedDomains = new Set<number>();

  // Pick #1: highest score
  if (eligible.length > 0) {
    picks.push(eligible[0]);
    usedDomains.add(eligible[0].domainId);
  }

  // Pick #2 and #3: enforce diversity
  for (let i = 1; i < eligible.length && picks.length < 3; i++) {
    const candidate = eligible[i];
    
    // If we need more domain diversity, skip same-domain candidates
    if (usedDomains.size < diversityMinDomainsPerWeek && usedDomains.has(candidate.domainId)) {
      continue;
    }
    
    picks.push(candidate);
    usedDomains.add(candidate.domainId);
  }

  // If we still need picks and ran out with diversity constraint, relax it
  if (picks.length < 3) {
    logs.push(`Relaxing diversity constraint: only ${usedDomains.size} domains available`);
    for (let i = 1; i < eligible.length && picks.length < 3; i++) {
      if (!picks.find(p => p.id === eligible[i].id)) {
        picks.push(eligible[i]);
      }
    }
  }

  return picks;
}

export function computeNextAndPreview(
  inputs: OrgInputs,
  config: EngineConfig
): { next: RankedRow[]; preview: RankedRow[]; logs: string[] } {
  const logs: string[] = [];

  // Compute Next week
  const nextDate = inputs.effectiveDate;
  const nextPicks = computeWeek(inputs.eligibleMoves, inputs, config, nextDate, logs);

  // Format Next as RankedRow
  const next: RankedRow[] = nextPicks.map(pick => {
    const lastSeenRecord = inputs.lastSelected.find(ls => ls.proMoveId === pick.id);
    const confidenceN = inputs.confidenceHistory
      .filter(h => h.proMoveId === pick.id)
      .reduce((sum, h) => sum + h.n, 0);

    return {
      proMoveId: pick.id,
      name: pick.name,
      domainId: pick.domainId,
      domainName: pick.domainName,
      parts: {
        C: pick.breakdown.C,
        R: pick.breakdown.R,
        E: pick.breakdown.E,
        D: pick.breakdown.D,
      },
      finalScore: pick.breakdown.final,
      drivers: pick.breakdown.drivers,
      lastSeen: lastSeenRecord ? formatMmDdYyyy(lastSeenRecord.weekStart) : undefined,
      weeksSinceSeen: lastSeenRecord ? formatWeeksSince(lastSeenRecord.weekStart, nextDate) : 999,
      confidenceN,
    };
  });

  // Clone inputs and advance state for Preview
  const previewDate = new Date(inputs.effectiveDate);
  previewDate.setDate(previewDate.getDate() + 7);
  const previewDateStr = previewDate.toISOString().split('T')[0];

  const advancedInputs: OrgInputs = {
    ...inputs,
    effectiveDate: previewDateStr,
    lastSelected: [
      ...inputs.lastSelected.filter(ls => !nextPicks.find(p => p.id === ls.proMoveId)),
      ...nextPicks.map(pick => ({ proMoveId: pick.id, weekStart: nextDate })),
    ],
  };

  // Compute Preview week
  const previewPicks = computeWeek(advancedInputs.eligibleMoves, advancedInputs, config, previewDateStr, logs);

  // Format Preview as RankedRow
  const preview: RankedRow[] = previewPicks.map(pick => {
    const lastSeenRecord = advancedInputs.lastSelected.find(ls => ls.proMoveId === pick.id);
    const confidenceN = advancedInputs.confidenceHistory
      .filter(h => h.proMoveId === pick.id)
      .reduce((sum, h) => sum + h.n, 0);

    return {
      proMoveId: pick.id,
      name: pick.name,
      domainId: pick.domainId,
      domainName: pick.domainName,
      parts: {
        C: pick.breakdown.C,
        R: pick.breakdown.R,
        E: pick.breakdown.E,
        D: pick.breakdown.D,
      },
      finalScore: pick.breakdown.final,
      drivers: pick.breakdown.drivers,
      lastSeen: lastSeenRecord ? formatMmDdYyyy(lastSeenRecord.weekStart) : undefined,
      weeksSinceSeen: lastSeenRecord ? formatWeeksSince(lastSeenRecord.weekStart, previewDateStr) : 999,
      confidenceN,
    };
  });

  return { next, preview, logs };
}

export function buildRankedList(
  candidates: EligibleMove[],
  inputs: OrgInputs,
  config: EngineConfig
): RankedRow[] {
  const scored: ScoredMove[] = candidates.map(move => ({
    ...move,
    breakdown: scoreCandidate(move, inputs, config, inputs.effectiveDate),
  }));

  // Sort by final score DESC, tie-breaker by proMoveId ASC
  scored.sort((a, b) => {
    if (Math.abs(b.breakdown.final - a.breakdown.final) < 0.0001) {
      return a.id - b.id;
    }
    return b.breakdown.final - a.breakdown.final;
  });

  return scored.map(move => {
    const lastSeenRecord = inputs.lastSelected.find(ls => ls.proMoveId === move.id);
    const confidenceN = inputs.confidenceHistory
      .filter(h => h.proMoveId === move.id)
      .reduce((sum, h) => sum + h.n, 0);

    return {
      proMoveId: move.id,
      name: move.name,
      domainId: move.domainId,
      domainName: move.domainName,
      parts: {
        C: move.breakdown.C,
        R: move.breakdown.R,
        E: move.breakdown.E,
        D: move.breakdown.D,
      },
      finalScore: move.breakdown.final,
      drivers: move.breakdown.drivers,
      lastSeen: lastSeenRecord ? formatMmDdYyyy(lastSeenRecord.weekStart) : undefined,
      weeksSinceSeen: lastSeenRecord ? formatWeeksSince(lastSeenRecord.weekStart, inputs.effectiveDate) : 999,
      confidenceN,
    };
  });
}
