export type ExportGrain = 'individual' | 'location' | 'organization';
// The period is chosen once, on the Scope step, and governs BOTH participation
// (which weeks of check-ins to score) and evaluation columns:
//   'quarter' → use the selected quarter/baseline (eval columns available)
//   'custom'  → an arbitrary date range (participation only; evals are
//               quarter-tagged, so eval columns are disabled in this mode)
export type PeriodMode = 'quarter' | 'custom';

export interface ExportConfig {
  grain: ExportGrain;
  includeCompletionRate: boolean;
  includeOnTimeRate: boolean;
  periodMode: PeriodMode;
  // Only used when periodMode === 'custom'. ISO date strings (YYYY-MM-DD),
  // inclusive on both ends. customEnd null means "through today".
  customStart: string | null;
  customEnd: string | null;
  includeDomainAverages: boolean;
  includeCompetencyAverages: boolean;
  includeObserverAndSelf: boolean;
}

export const DEFAULT_EXPORT_CONFIG: ExportConfig = {
  grain: 'individual',
  // Participation metrics default ON — the primary use of the Reports export is
  // pulling ProMoves completion / on-time data for staff conversations.
  includeCompletionRate: true,
  includeOnTimeRate: true,
  periodMode: 'quarter',
  customStart: null,
  customEnd: null,
  includeDomainAverages: false,
  includeCompetencyAverages: false,
  includeObserverAndSelf: true,
};

export const EXPORT_FORMAT = {
  version: 'v1',
  percentDecimals: 0,
  meanDecimals: 2,
  nullToken: '',
} as const;

export const MAX_EXPORT_ROWS = 100_000;

// Deterministic column names -- single source of truth
export const COLUMN_NAMES = {
  organization: 'Group',
  location: 'Location',
  staffName: 'Staff Name',
  role: 'Role',
  staffCount: 'Staff Count',
  completionRate: 'Completion %',
  onTimeRate: 'On-Time %',
  // Participation detail (individual grain). Counts are submission slots
  // (each week has a check-in + a check-out), not weeks.
  expected: 'Submissions Due',
  completed: 'Submitted',
  onTimeCount: 'On-Time',
  lateCount: 'Late',
  missingCount: 'Missing',
  lastSubmission: 'Last Submission',
  competencyName: 'Competency',
  domainName: 'Domain',
  obsMean: 'Observer Mean',
  selfMean: 'Self Mean',
  obsScore: 'Observer Score',
  selfScore: 'Self Score',
  nItems: 'N Items',
} as const;
