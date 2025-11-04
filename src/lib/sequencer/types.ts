/**
 * Phase 2: Org Sequencer Types
 * 
 * All IDs are numeric (matching database schema).
 * Single competency per move (Phase 3 will add multi-competency weights).
 */

export type RoleId = 1 | 2; // 1=DFI, 2=RDA

/**
 * Pro Move with single competency.
 * Phase 3 TODO: Add competencyWeights: Record<number, number> for multi-competency support.
 */
export interface ProMove {
  id: number;           // action_id from pro_moves table
  name: string;         // action_statement
  domainId: number;     // via pro_moves.competency_id → competencies.domain_id
  competencyId: number; // single competency for Phase 2
  isActive: boolean;    // active flag
}

/**
 * Confidence sample from org-wide history (last 18 weeks).
 */
export interface ConfidenceSample {
  proMoveId: number;    // action_id
  weekStart: string;    // YYYY-MM-DD (Monday in org timezone)
  avg: number;          // 0..1 average confidence score
  n: number;            // number of ratings in this week
}

/**
 * Evaluation competency score (quarterly snapshot).
 */
export interface EvalCompetency {
  competencyId: number;
  score01: number;        // 0..1 (1 = excellent, 0 = poor)
  effectiveDate: string;  // ISO date of quarterly eval
}

/**
 * Last time a pro move was scheduled (org-wide).
 */
export interface LastSelected {
  proMoveId: number;      // action_id
  weekStart: string;      // YYYY-MM-DD (Monday in org timezone)
}

/**
 * Domain appearance tracking over a window (e.g., last 8 weeks).
 */
export interface DomainCoverage {
  domainId: number;
  weeksCounted: number;   // window size, e.g., 8
  appearances: number;    // times this domain appeared in window
}

/**
 * Org-wide inputs for a single role.
 * Phase 3 TODO: Add manager boost data, better confidence binning.
 */
export interface OrgInputs {
  orgId: number;                          // organization ID
  role: RoleId;                           // 1=DFI, 2=RDA
  timezone: string;                       // e.g., "America/Chicago"
  eligibleMoves: ProMove[];               // active moves for this role
  confidenceHistory: ConfidenceSample[];  // last 18 weeks org-wide
  evals: EvalCompetency[];                // latest quarterly snapshot
  lastSelected: LastSelected[];           // org-wide schedule history
  domainCoverage8w: DomainCoverage[];     // last 8 weeks domain tracking
  now: Date;                              // effective timestamp
}

/**
 * Engine configuration for NeedScore v1.
 */
export interface EngineConfig {
  cooldownWeeks: number;                  // minimum weeks before re-selection (default: 2)
  coverageWindowWeeks: number;            // coverage tracking window (default: 4)
  diversityMinDomainsPerWeek: number;     // minimum domains per week (default: 2)
  recencyHorizonWeeks: number;            // if 0, compute from eligible count
  weights: {
    C: number;  // confidence need weight (default: 0.65)
    R: number;  // recency weight (default: 0.15)
    E: number;  // eval boost weight (default: 0.15)
    D: number;  // domain under-rep weight (default: 0.05)
  };
  ebPrior: number;      // empirical bayes prior (default: 0.70)
  ebK: number;          // empirical bayes strength (default: 20)
  trimPct: number;      // trim percentage for outliers (default: 0.05)
  evalCap: number;      // max E contribution to final score (default: 0.25)
}

/**
 * A selected pro move with score and explanation.
 */
export interface Pick {
  proMoveId: number;
  name: string;
  domainId: number;
  finalScore: number;             // 0..1 combined score
  drivers: ('C'|'R'|'E'|'D')[];   // top 2 score contributors
}

/**
 * Weekly plan with 3 selected moves.
 */
export interface WeekPlan {
  weekStart: string;  // YYYY-MM-DD (Monday)
  picks: Pick[];      // length 3
}

/**
 * Two-week computation result: Next Week + Preview Week.
 */
export interface TwoWeekResult {
  next: WeekPlan;     // week starting Monday after effectiveDate
  preview: WeekPlan;  // week N+1
  logs: string[];     // constraint relaxations, tie-breaks, etc.
}
