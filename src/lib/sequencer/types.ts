// Core types for the sequencer ranking system

export type RoleId = 1 | 2; // 1=DFI, 2=RDA

export interface RankRequest {
  roleId: RoleId;
  effectiveDate?: string; // ISO date, default = today in America/Chicago
  timezone?: string; // default "America/Chicago"
  weights?: { C: number; R: number; E: number; D: number };
  // Advanced options
  cooldownWeeks?: number; // default 2
  diversityMinDomainsPerWeek?: number; // default 2
  recencyHorizonWeeks?: number; // 0 = auto
  ebPrior?: number; // default 0.70
  ebK?: number; // default 20
  trimPct?: number; // default 0.05
  evalCap?: number; // default 0.25
}

export interface RankedRow {
  proMoveId: number;
  name: string;
  domainId: number;
  domainName: string;
  parts: { C: number; R: number; E: number; D: number }; // 0..1
  finalScore: number; // 0..1
  drivers: ('C' | 'R' | 'E' | 'D')[];
  lastSeen?: string; // "MM-DD-YYYY"
  weeksSinceSeen: number;
  confidenceN: number; // sum of 'n' used for EB smoothing
}

export interface RankResponse {
  timezone: string;
  weekStartNext: string; // "MM-DD-YYYY"
  weekStartPreview: string; // "MM-DD-YYYY"
  next: RankedRow[]; // exactly 3 rows
  preview: RankedRow[]; // exactly 3 rows
  ranked: RankedRow[]; // all candidates ranked
  logs: string[];
}

export interface EngineConfig {
  weights: { C: number; R: number; E: number; D: number };
  cooldownWeeks: number;
  diversityMinDomainsPerWeek: number;
  recencyHorizonWeeks: number;
  ebPrior: number;
  ebK: number;
  trimPct: number;
  evalCap: number;
}

export interface EligibleMove {
  id: number;
  name: string;
  competencyId: number;
  domainId: number;
  domainName: string;
}

export interface ConfidenceDataPoint {
  proMoveId: number;
  weekStart: string; // ISO date
  avg: number; // 0..1
  n: number;
}

export interface EvalScore {
  competencyId: number;
  score: number; // 0..1
}

export interface LastSelected {
  proMoveId: number;
  weekStart: string; // ISO date
}

export interface DomainCoverage {
  domainId: number;
  appearances: number;
}

export interface OrgInputs {
  eligibleMoves: EligibleMove[];
  confidenceHistory: ConfidenceDataPoint[];
  evals: EvalScore[];
  lastSelected: LastSelected[];
  domainCoverage: DomainCoverage[];
  effectiveDate: string; // ISO date
  timezone: string;
}

export interface ScoreBreakdown {
  C: number;
  R: number;
  E: number;
  D: number;
  final: number;
  drivers: ('C' | 'R' | 'E' | 'D')[];
}

export const DEFAULT_ENGINE_CONFIG: EngineConfig = {
  weights: { C: 0.65, R: 0.15, E: 0.15, D: 0.05 },
  cooldownWeeks: 2,
  diversityMinDomainsPerWeek: 2,
  recencyHorizonWeeks: 0, // 0 = auto
  ebPrior: 0.70,
  ebK: 20,
  trimPct: 0.05,
  evalCap: 0.25,
};
