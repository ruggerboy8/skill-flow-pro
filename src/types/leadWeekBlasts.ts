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
  subject: string;           // LRM-4; '' falls back to the default subject
  status: LeadWeekBlastStatus;
  sent_at: string | null;
  sent_by: string | null;
  recipient_count: number | null;
  failed_count: number | null;
  excluded_staff_ids: string[]; // LRM-4; staff ids excluded from a SENT blast, empty for a draft
  location_id: string | null; // always null in v1, see column comment in the migration
  created_at: string;
  updated_at: string;
}

export interface NewLeadWeekBlastInput {
  weekStartDate: string; // YYYY-MM-DD
  body: string;
  subject: string;
}

export interface UpdateLeadWeekBlastInput {
  id: string;
  body: string;
  subject: string;
}

/** LRM-4: one row of the recipient review list, from the "recipients" action. */
export interface LeadWeekBlastRecipient {
  staff_id: string;
  name: string;
  location_name: string | null; // null means Roaming (no home location)
}
