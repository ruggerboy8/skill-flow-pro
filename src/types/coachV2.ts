// Phase 1: Raw score row type matching RPC output exactly
export interface RawScoreRow {
  staff_id: string;
  staff_name: string;
  staff_email: string;
  user_id: string;
  role_id: number;
  role_name: string;
  location_id: string;
  location_name: string;
  organization_id: string;
  organization_name: string;
  score_id: string | null;
  week_of: string | null;
  assignment_id: string | null;
  action_id: number | null;
  selected_action_id: number | null;
  confidence_score: number | null;
  confidence_date: string | null;
  confidence_late: boolean | null;
  confidence_source: 'live' | 'backfill' | 'backfill_historical';
  performance_score: number | null;
  performance_date: string | null;
  performance_late: boolean | null;
  performance_source: 'live' | 'backfill' | 'backfill_historical';
  action_statement: string;
  domain_id: number | null;
  domain_name: string | null;
  display_order: number | null;
  self_select: boolean | null;
}

// Phase 2: Per-staff aggregated status for the selected week
export interface StaffWeekSummary {
  staff_id: string;
  staff_name: string;
  staff_email: string;
  user_id: string;
  role_id: number;
  role_name: string;
  location_id: string;
  location_name: string;
  organization_id: string;
  organization_name: string;
  week_of: string;
  assignment_count: number;
  conf_count: number;
  perf_count: number;
  has_any_late: boolean;
  is_complete: boolean;
  scores: RawScoreRow[];
}

export interface StaffWithScores {
  staff: {
    id: string;
    name: string;
    email: string;
    role_id: number;
    role_name: string;
    location_id: string;
    location_name: string;
    organization_id: string;
    organization_name: string;
  };
  scores: RawScoreRow[];
}
