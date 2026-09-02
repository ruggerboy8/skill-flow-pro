// Hand-written types for LRM-1's lead meeting records (Lovable owns the generated
// supabase types.ts, so these tables are queried through an untyped client -- see
// the surveyTypes / coachingWorkspace precedent). Mirrors the schema in
// supabase/migrations/20260825210000_lrm1_lead_meetings.sql.

export interface LeadMeetingRow {
  id: string;
  organization_id: string;
  created_by: string;
  meeting_date: string;      // YYYY-MM-DD
  week_start_date: string;   // YYYY-MM-DD (Monday, derived from meeting_date)
  raw_transcript: string | null;
  internal_summary: string | null;
  created_at: string;
  updated_at: string;
}

export interface NewLeadMeetingInput {
  meetingDate: string;       // YYYY-MM-DD
  weekStartDate: string;     // YYYY-MM-DD
  rawTranscript: string;
  internalSummary: string;
}

export interface UpdateLeadMeetingInput {
  id: string;
  internalSummary: string;
}
