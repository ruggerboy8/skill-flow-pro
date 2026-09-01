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
  group_id: string;
  group_name: string;
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
  group_id: string;
  group_name: string;
  week_of: string;
  assignment_count: number;
  conf_count: number;
  perf_count: number;
  // DASH-5: the person's real workload for the week - locked, non-self-select
  // assignments for their role/scope - resolved from weekly_assignments, NOT
  // from how many score rows happen to exist. 0 means nothing was published
  // for them this week (they owe nothing), which is different from "owes
  // work but hasn't started" (required_count > 0, conf_required_done 0).
  required_count: number;
  // Confidence/performance scores submitted on required (non-self-select)
  // slots. A person is only "checked in/out" when these reach
  // required_count - a partial submission is an incomplete task, not credit.
  conf_required_done: number;
  perf_required_done: number;
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
    group_id: string;
    group_name: string;
  };
  scores: RawScoreRow[];
}
