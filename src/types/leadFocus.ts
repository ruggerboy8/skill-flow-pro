// Hand-written types for Ariyana's Lead Focus + Scheduling (Slice 2). Lovable owns
// the generated supabase types.ts, so these tables are queried through an untyped
// client (see surveyTypes / coachingWorkspace precedent). Mirrors the schema in
// supabase/migrations/20260721190000_lead_focus_slice2.sql.

export type FocusWeekStatus = 'draft' | 'published';
export type MeetingStatus = 'sent' | 'opened' | 'booked';

// The record outcome for a focus item is DERIVED from its sourcing issue's
// retired_outcome (same enum as coaching_issues), or 'pending' while it is still
// in flight / has no source.
export type FocusOutcome = 'landed' | 'let_go' | 'recurring' | 'pending';

export interface LeadFocusWeekRow {
  id: string;
  organization_id: string | null;
  created_by: string | null;
  week_start_date: string; // YYYY-MM-DD (Monday)
  framing: string | null;
  status: FocusWeekStatus;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface LeadFocusItemRow {
  id: string;
  week_id: string;
  organization_id: string | null;
  display_order: number; // 1..2
  text: string;
  source_issue_id: string | null;
  created_at: string;
}

export interface LeadMeetingRequest {
  id: string;
  organization_id: string | null;
  created_by: string | null;
  lead_staff_id: string;
  note: string | null;
  status: MeetingStatus;
  created_at: string;
  opened_at: string | null;
  booked_at: string | null;
}

// Hydrated shapes for the UI.
export interface HydratedFocusItem {
  id: string;
  display_order: number;
  text: string;
  source_issue_id: string | null;
  sourceIssueTitle?: string | null;
  outcome: FocusOutcome;
}

export interface HydratedFocusWeek extends LeadFocusWeekRow {
  items: HydratedFocusItem[];
}

// What the client sends to publish_lead_focus_week.
export interface PublishFocusItem {
  text: string;
  source_issue_id: string | null;
}

export const OUTCOME_META: Record<FocusOutcome, { label: string; varName: string }> = {
  landed:    { label: 'Landed',            varName: '--status-complete' },
  let_go:    { label: 'Let go',            varName: '--muted-foreground' },
  recurring: { label: 'Keeps coming back', varName: '--status-late' },
  pending:   { label: 'In flight',         varName: '--domain-clinical' },
};

export const MEETING_STATUS_META: Record<MeetingStatus, { label: string }> = {
  sent:   { label: 'sent' },
  opened: { label: 'opened' },
  booked: { label: 'booked' },
};

// Ariyana's booking link. Hardcoded for MVP; staff.scheduling_link overrides it
// when set (later made profile-editable, like clinical directors). See build plan.
export const DEFAULT_BOOKING_LINK = 'https://calendar.app.google/ariyana-rda';
