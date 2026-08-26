// Hand-written types for LRM-2's doctor blast records (Lovable owns the
// generated supabase types.ts, so this table is queried through an untyped
// client -- see the leadMeetings precedent). Mirrors the schema in
// supabase/migrations/20260825220000_lrm2_lead_week_blasts.sql.

export type LeadWeekBlastStatus = 'draft' | 'sent';

export interface LeadWeekBlastRow {
  id: string;
  organization_id: string;
  created_by: string;
  week_start_date: string;   // YYYY-MM-DD (Monday)
  body: string;
  status: LeadWeekBlastStatus;
  sent_at: string | null;
  sent_by: string | null;
  recipient_count: number | null;
  location_id: string | null; // always null in v1, see column comment in the migration
  created_at: string;
  updated_at: string;
}

export interface NewLeadWeekBlastInput {
  weekStartDate: string; // YYYY-MM-DD
  body: string;
}

export interface UpdateLeadWeekBlastInput {
  id: string;
  body: string;
}
