import type { EngineConfig } from './sequencer-types.ts';

export const defaultEngineConfig: EngineConfig = {
  cooldownWeeks: 2,
  coverageWindowWeeks: 4,
  diversityMinDomainsPerWeek: 2,
  recencyHorizonWeeks: 0,
  
  weights: {
    C: 0.60,
    R: 0.15,
    E: 0.15,
    D: 0.05,
    M: 0.05,
  },
  
  ebPrior: 0.70,
  ebK: 20,
  trimPct: 0.05,
  evalCap: 0.25,
};
