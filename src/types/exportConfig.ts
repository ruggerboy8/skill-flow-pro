export type ExportGrain = 'individual' | 'location' | 'organization';
export type TimeWindow = '3weeks' | '6weeks' | 'all';

export interface ExportConfig {
  grain: ExportGrain;
  includeCompletionRate: boolean;
  includeOnTimeRate: boolean;
  submissionWindow: TimeWindow;
  includeDomainAverages: boolean;
  includeCompetencyAverages: boolean;
  includeObserverAndSelf: boolean;
}

export const DEFAULT_EXPORT_CONFIG: ExportConfig = {
  grain: 'individual',
  includeCompletionRate: false,
  includeOnTimeRate: false,
  submissionWindow: '6weeks',
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
  competencyName: 'Competency',
  domainName: 'Domain',
  obsMean: 'Observer Mean',
  selfMean: 'Self Mean',
  obsScore: 'Observer Score',
  selfScore: 'Self Score',
  nItems: 'N Items',
} as const;
