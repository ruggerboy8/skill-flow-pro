// Hand-written types for Ariyana's Coaching Workspace (Lovable owns the generated
// supabase types.ts; follow the surveyTypes.ts precedent). Mirrors the DB schema in
// supabase/migrations/20260720190000_coaching_workspace_slice1.sql.

export type IssueStage = 'identified' | 'communicated' | 'assessed';
export type IssueStatus = 'active' | 'retired';
export type RetireOutcome = 'landed' | 'let_go' | 'recurring';
export type SourceType = 'visit' | 'doctor' | 'leads' | 'signal';
export type EventKind =
  | 'created' | 'stage_change' | 'note' | 'declared_focus' | 'retired' | 'reopened';

export interface CoachingIssueRow {
  id: string;
  organization_id: string | null;
  created_by: string | null;
  title: string;
  detail: string | null;
  stage: IssueStage;
  is_global: boolean;
  status: IssueStatus;
  retired_outcome: RetireOutcome | null;
  retired_note: string | null;
  private_note: string | null;
  created_at: string;
  updated_at: string;
  retired_at: string | null;
}

export interface CoachingIssueEvent {
  id: string;
  issue_id: string;
  kind: EventKind;
  body: string | null;
  by_staff: string | null;
  at: string;
}

// A hydrated issue for the UI: the row plus its location ids and source types.
export interface CoachingIssue extends CoachingIssueRow {
  locationIds: string[];
  sources: SourceType[];
}

// Stages are stored as the state the issue is IN, but the UI labels each by the
// NEXT action needed (Communicate → Assess → Close out), so the board/list read as
// a to-do. This map is the single source of that vocabulary.
export const STAGE_META: Record<IssueStage, { label: string; hint: string; dotVar: string }> = {
  identified:   { label: 'Communicate', hint: 'Identified — raise it with the leads or 1:1', dotVar: '--muted' },
  communicated: { label: 'Assess',      hint: 'Raised — follow up and see if it landed',     dotVar: '--domain-clinical' },
  assessed:     { label: 'Close out',   hint: 'Checked — retire it, or hit it again',        dotVar: '--domain-case-acceptance' },
};

export const STAGE_ORDER: IssueStage[] = ['identified', 'communicated', 'assessed'];

export const OUTCOME_META: Record<RetireOutcome, { label: string }> = {
  landed:    { label: 'Landed' },
  let_go:    { label: 'Let go' },
  recurring: { label: 'Keeps coming back' },
};

export const SOURCE_META: Record<SourceType, { label: string }> = {
  visit:  { label: 'You saw it on a visit' },
  doctor: { label: 'Doctor / clinical director' },
  leads:  { label: 'Lead meeting' },
  signal: { label: 'Confidence signal' },
};
