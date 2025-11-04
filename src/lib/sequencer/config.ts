/**
 * Phase 2: Default Engine Configuration
 * 
 * NeedScore v1 weights and constraints.
 */

import { EngineConfig } from './types';

/**
 * Default configuration for org-wide sequencer.
 * 
 * Weights (sum to 1.00):
 * - C (confidence): 0.65 - Primary driver based on org-wide confidence gaps
 * - R (recency): 0.15 - Ensures moves cycle through over time
 * - E (eval boost): 0.15 - Targets competency deficits from quarterly evals
 * - D (domain diversity): 0.05 - Gentle nudge for under-represented domains
 * 
 * Constraints:
 * - Cooldown: 2 weeks minimum between selections
 * - Coverage: Ensure each move appears ≥1×/4 weeks (org-wide)
 * - Diversity: ≥2 domains per week
 * 
 * Empirical Bayes:
 * - Prior: 0.70 (70% confidence assumed for new moves)
 * - K: 20 (strength of prior)
 * - Trim: 5% (remove outliers from confidence averaging)
 * 
 * Eval Cap: E contribution capped at 0.25 of final score
 */
export const defaultEngineConfig: EngineConfig = {
  // Constraints
  cooldownWeeks: 2,
  coverageWindowWeeks: 4,
  diversityMinDomainsPerWeek: 2,
  recencyHorizonWeeks: 0, // 0 = compute dynamically from eligible count
  
  // Signal weights
  weights: {
    C: 0.65,  // Confidence need (primary driver)
    R: 0.15,  // Recency
    E: 0.15,  // Eval boost
    D: 0.05,  // Domain under-representation
  },
  
  // Empirical Bayes parameters
  ebPrior: 0.70,  // 70% confidence prior
  ebK: 20,        // Prior strength
  trimPct: 0.05,  // Trim 5% outliers
  
  // Eval boost cap
  evalCap: 0.25,  // E contribution limited to 25% of final score
};
