export type RoleId = 1 | 2;

export interface ProMove {
  id: number;
  name: string;
  domainId: number;
  competencyId: number;
  active: boolean;
}

export interface ConfidenceSample {
  proMoveId: number;
  weekStart: string;
  avg01: number;
  n: number;
}

export interface EvalCompetency {
  staffId: string;
  competencyId: number;
  avgObserver01: number;
  evalCount: number;
}

export interface LastSelected {
  proMoveId: number;
  weekStart: string;
}

export interface DomainCoverage {
  domainId: number;
  weeksCounted: number;
  appearances: number;
}

export interface OrgInputs {
  eligibleMoves: ProMove[];
  confidenceHistory: ConfidenceSample[];
  evals: EvalCompetency[];
  lastSelected: LastSelected[];
  domainCoverage8w: DomainCoverage[];
  managerPriorities?: Map<number, number>;
}

export interface EngineConfig {
  cooldownWeeks: number;
  coverageWindowWeeks: number;
  diversityMinDomainsPerWeek: number;
  recencyHorizonWeeks: number;
  weights: {
    C: number;
    R: number;
    E: number;
    D: number;
    M?: number;
  };
  ebPrior: number;
  ebK: number;
  trimPct: number;
  evalCap: number;
}

export interface Pick {
  proMoveId: number;
  name: string;
  domainId: number;
  competencyId: number;
  score: number;
  drivers: {
    C: number;
    R: number;
    E: number;
    D: number;
    M?: number;
  };
}

export interface WeekPlan {
  weekStart: string;
  picks: Pick[];
  logs: string[];
}

export interface TwoWeekResult {
  next: WeekPlan;
  preview: WeekPlan;
  logs: string[];
}
