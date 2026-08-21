// Types for Eval Results V2 - Distribution-based metrics

export interface DistributionMetrics {
  nItems: number;
  obsTopBox: number;      // count of observer_score = 4
  obsBottomBox: number;   // count of observer_score IN (1, 2)
  selfTopBox: number;     // count of self_score = 4
  selfBottomBox: number;  // count of self_score IN (1, 2)
  mismatchCount: number;  // count where obs != self
  obsMean: number | null;
  selfMean: number | null;
}

export interface OrgSummary extends DistributionMetrics {
  eligibleStaff: number;
  staffWithEval: number;
  draftCount: number;
  submittedCount: number;
  // Accountability (Pro-Moves)
  participationRate: number | null;
  onTimeRate: number | null;
  accountabilityN: number;
}

export interface LocationCardData {
  locationId: string;
  locationName: string;
  dfiCount: number;
  rdaCount: number;
  omCount: number;
  staffWithEval: number;
  topBoxRate: number;      // % of 4s
  bottomBoxRate: number;   // % of 1-2s
  mismatchRate: number;    // % Obs ≠ Self
  obsMean: number | null;  // secondary, 1 decimal
  weakestDomain: string | null;
  nItems: number;
}

export interface DomainRow {
  domainId: number;
  domainName: string;
  topBoxRate: number;
  bottomBoxRate: number;
  mismatchRate: number;
  obsMean: number | null;
  selfMean: number | null;
  nItems: number;
}

export interface StaffRowV2 {
  staffId: string;
  staffName: string;
  roleId: number;
  roleName: string;
  evaluationId: string | null;
  evaluationStatus: string | null;
  domains: Record<string, {
    obsTopBox: number;
    obsBottomBox: number;
    selfTopBox: number;
    selfBottomBox: number;
    mismatchCount: number;
    obsMean: number | null;
    selfMean: number | null;
    nItems: number;
  }>;
  totalMismatchRate: number;
  totalObsMean: number | null;
}

// Raw data from RPC
export interface EvalDistributionRow {
  location_id: string;
  location_name: string;
  domain_id: number;
  domain_name: string;
  role_id: number;
  role_name: string;
  staff_id: string;
  staff_name: string;
  evaluation_id: string | null;
  evaluation_status: string | null;
  n_items: number;
  obs_top_box: number;
  obs_bottom_box: number;
  self_top_box: number;
  self_bottom_box: number;
  mismatch_count: number;
  obs_mean: number | null;
  self_mean: number | null;
}

// View state for hierarchical navigation
export type EvalResultsV2View = 
  | { level: 'org-snapshot' }
  | { level: 'location-detail'; locationId: string; locationName: string };

// Helper functions for rate calculations
export function calcRate(count: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((count / total) * 100);
}

export function formatRate(rate: number): string {
  return `${rate}%`;
}

export function formatMean(mean: number | null): string {
  if (mean === null) return '—';
  return mean.toFixed(1);
}

// Color thresholds for metrics.
// DSN-3 slice 3: these are org/location-level EVALUATION QUALITY metrics
// (top-box rate, observer/self mismatch rate) — not a 1-4 staff confidence
// self-rating, so the DASH-1a "confidence scores never render red" rule
// does not apply here. A low top-box rate or high mismatch rate is a real
// problem worth flagging red, so this reuses the --status-* good/warning/bad
// family (same semantic as complete/late/missing) rather than the
// non-alarm --score-* ramp. Recolor only — thresholds are unchanged. The
// token values are a close but not pixel-identical match to the original
// green-600/amber-600/red-600 (slightly different shade within the same
// hue), same as other close-but-not-exact token substitutions in this
// migration.
export function getTopBoxColor(rate: number): string {
  if (rate >= 40) return 'text-[hsl(var(--status-complete))]';
  if (rate >= 25) return 'text-[hsl(var(--status-late))]';
  return 'text-[hsl(var(--status-missing))]';
}

export function getTopBoxBg(rate: number): string {
  if (rate >= 40) return 'bg-[hsl(var(--status-complete-bg))]';
  if (rate >= 25) return 'bg-[hsl(var(--status-late-bg))]';
  return 'bg-[hsl(var(--status-missing-bg))]';
}

export function getMismatchColor(rate: number): string {
  if (rate < 30) return 'text-[hsl(var(--status-complete))]';
  if (rate < 50) return 'text-[hsl(var(--status-late))]';
  return 'text-[hsl(var(--status-missing))]';
}

export function getMismatchBg(rate: number): string {
  if (rate < 30) return 'bg-[hsl(var(--status-complete-bg))]';
  if (rate < 50) return 'bg-[hsl(var(--status-late-bg))]';
  return 'bg-[hsl(var(--status-missing-bg))]';
}

// Gap interpretation
export function getGapDirection(obsMean: number | null, selfMean: number | null): 'overrate' | 'underrate' | 'aligned' {
  if (obsMean === null || selfMean === null) return 'aligned';
  const gap = obsMean - selfMean;
  if (gap < -0.2) return 'overrate';  // self > obs = staff rates higher
  if (gap > 0.2) return 'underrate';  // obs > self = coach rates higher
  return 'aligned';
}

export function getGapLabel(direction: 'overrate' | 'underrate' | 'aligned'): string {
  switch (direction) {
    case 'overrate': return 'Staff tend to overestimate';
    case 'underrate': return 'Staff tend to underestimate';
    case 'aligned': return 'Aligned';
  }
}
