// "Focus Move" is the working name (John, 2026-08-11) for the longitudinal
// growth container in doctor_focus_items — a Pro Move the coach and doctor
// are working on together, persisting across sessions. The statement field
// is labeled "Our starting point" in the UI.

export type FocusMoveStatus = 'draft' | 'parked' | 'active' | 'retired';
export type FocusMoveRetiredOutcome = 'landed' | 'set_aside';
export type FocusMoveProgress = 'going_well' | 'working_on_it' | 'not_started';

export interface FocusMoveProMove {
  action_id: number;
  action_statement: string;
  // "What good looks like" is NOT a column on pro_moves — it lives in
  // pro_move_resources (type='doctor_good_looks_like', keyed by action_id)
  // and must be fetched separately.
  competencies?: {
    name: string;
    domains?: { domain_name: string } | null;
  } | null;
}

export interface FocusMove {
  id: string;
  doctor_staff_id: string;
  coach_staff_id: string;
  pro_move_id: number;
  statement: string;
  status: FocusMoveStatus;
  retired_outcome: FocusMoveRetiredOutcome | null;
  origin_session_id: string | null;
  activated_at: string | null;
  retired_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  pro_moves?: FocusMoveProMove | null;
}

export interface FocusMoveUpdateRow {
  id: string;
  focus_item_id: string;
  session_id: string | null;
  progress: FocusMoveProgress;
  note: string | null;
  created_by: string | null;
  created_at: string;
}

export const FOCUS_MOVE_PROGRESS_LABELS: Record<FocusMoveProgress, string> = {
  going_well: 'Going well',
  working_on_it: 'Working on it',
  not_started: "Haven't started",
};
