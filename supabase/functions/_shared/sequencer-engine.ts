import type { OrgInputs, EngineConfig, WeekPlan, Pick } from './sequencer-types.ts';

export function computeWeek(
  inputs: OrgInputs,
  config: EngineConfig,
  weekStart: string
): WeekPlan {
  const logs: string[] = [];
  const candidates: Pick[] = [];

  // Build eligibility map (recency)
  const lastSelectedMap = new Map(inputs.lastSelected.map(ls => [ls.proMoveId, ls.weekStart]));
  
  // Score all eligible moves
  for (const move of inputs.eligibleMoves) {
    const lastWeek = lastSelectedMap.get(move.id);
    const weeksSince = lastWeek ? weeksBetween(lastWeek, weekStart) : 999;
    
    if (weeksSince < config.cooldownWeeks) {
      logs.push(`Cooldown: ${move.name} (last seen ${weeksSince}w ago)`);
      continue;
    }

    // Confidence signal (C)
    const confSamples = inputs.confidenceHistory.filter(c => c.proMoveId === move.id);
    const confAvg = confSamples.length > 0
      ? confSamples.reduce((sum, c) => sum + c.avg01, 0) / confSamples.length
      : config.ebPrior;
    const C = 1 - confAvg;

    // Recency signal (R)
    const horizon = config.recencyHorizonWeeks || Math.max(12, inputs.eligibleMoves.length / 3);
    const R = Math.min(1, weeksSince / horizon);

    // Eval signal (E)
    const evalSamples = inputs.evals.filter(e => e.competencyId === move.competencyId);
    const evalAvg = evalSamples.length > 0
      ? evalSamples.reduce((sum, e) => sum + e.avgObserver01, 0) / evalSamples.length
      : 0.70;
    const E = Math.min(1 - evalAvg, config.evalCap);

    // Domain diversity signal (D)
    const domainCov = inputs.domainCoverage8w.find(d => d.domainId === move.domainId);
    const D = domainCov ? 1 - (domainCov.appearances / domainCov.weeksCounted) : 0.5;

    // Manager priority signal (M)
    const M = inputs.managerPriorities?.get(move.id) ? 1 : 0;

    const score =
      C * config.weights.C +
      R * config.weights.R +
      E * config.weights.E +
      D * config.weights.D +
      (config.weights.M ? M * config.weights.M : 0);

    candidates.push({
      proMoveId: move.id,
      name: move.name,
      domainId: move.domainId,
      competencyId: move.competencyId,
      score,
      drivers: { C, R, E, D, M },
    });
  }

  // Sort by score descending
  candidates.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

  // Pick top 3 with diversity constraint
  const picked: Pick[] = [];
  const usedDomains = new Set<number>();

  for (const candidate of candidates) {
    if (picked.length >= 3) break;
    
    if (picked.length < config.diversityMinDomainsPerWeek - 1 || usedDomains.has(candidate.domainId) || usedDomains.size >= config.diversityMinDomainsPerWeek) {
      picked.push(candidate);
      usedDomains.add(candidate.domainId);
    }
  }

  if (picked.length < 3) {
    logs.push('RELAXED: diversity constraint to complete picks');
    for (const candidate of candidates) {
      if (picked.length >= 3) break;
      if (!picked.find(p => p.proMoveId === candidate.proMoveId)) {
        picked.push(candidate);
      }
    }
  }

  return {
    weekStart,
    picks: picked,
    logs,
  };
}

export function advanceInputsForPreview(inputs: OrgInputs, next: WeekPlan): OrgInputs {
  const clone = {
    ...inputs,
    lastSelected: [...inputs.lastSelected],
    domainCoverage8w: [...inputs.domainCoverage8w],
  };

  // Update lastSelected
  const lastMap = new Map(clone.lastSelected.map(ls => [ls.proMoveId, ls]));
  for (const p of next.picks) {
    lastMap.set(p.proMoveId, { proMoveId: p.proMoveId, weekStart: next.weekStart });
  }
  clone.lastSelected = Array.from(lastMap.values());

  // Update domain coverage
  const covMap = new Map(clone.domainCoverage8w.map(d => [d.domainId, { ...d }]));
  const counted = new Set<number>();
  for (const p of next.picks) {
    const d = covMap.get(p.domainId);
    if (d && !counted.has(p.domainId)) {
      d.appearances = Math.min(d.weeksCounted + 1, d.appearances + 1);
      counted.add(p.domainId);
    }
  }
  for (const d of covMap.values()) {
    d.weeksCounted = Math.min(8, d.weeksCounted + 1);
  }
  clone.domainCoverage8w = Array.from(covMap.values());

  return clone;
}

export function computeTwoWeeks(inputs: OrgInputs, config: EngineConfig) {
  const logs: string[] = [];
  
  // Compute next week
  const nextMondayDate = new Date(inputs.effectiveDate);
  nextMondayDate.setDate(nextMondayDate.getDate() + ((1 + 7 - nextMondayDate.getDay()) % 7));
  const nextWeekStart = nextMondayDate.toISOString().split('T')[0];
  
  const next = computeWeek(inputs, config, nextWeekStart);
  logs.push(...next.logs);
  
  // Advance state and compute preview
  const previewInputs = advanceInputsForPreview(inputs, next);
  const previewMondayDate = new Date(nextMondayDate);
  previewMondayDate.setDate(previewMondayDate.getDate() + 7);
  const previewWeekStart = previewMondayDate.toISOString().split('T')[0];
  
  const preview = computeWeek(previewInputs, config, previewWeekStart);
  logs.push(...preview.logs);
  
  return { next, preview, logs };
}

function weeksBetween(start: string, end: string): number {
  const d1 = new Date(start);
  const d2 = new Date(end);
  return Math.floor((d2.getTime() - d1.getTime()) / (7 * 24 * 60 * 60 * 1000));
}
