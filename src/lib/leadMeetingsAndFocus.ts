// Pure helpers for the "Meetings and Focus" week-spine tab (LRM-1). Kept
// separate from the React components so the week-keying and slot-state rules
// are unit-testable without touching Supabase or React Query.

import { getChicagoMonday } from './plannerUtils';
import type { HydratedFocusWeek } from '@/types/leadFocus';
import type { LeadMeetingRow } from '@/types/leadMeetings';

/**
 * The week a lead meeting belongs to, derived from its meeting_date via the
 * same Chicago-Monday convention as lead_focus_weeks.week_start_date (see
 * useLeadFocus / getChicagoMonday). Meetings are always filed under the
 * Monday of the week their meeting_date falls in, regardless of which day of
 * the week the meeting was actually held.
 */
export function deriveMeetingWeekStart(meetingDate: string): string {
  return getChicagoMonday(meetingDate);
}

/** Slot state vocabulary shared with StatusBadge's TrackStatus. */
export type SlotState = 'not_started' | 'completed';

/** Focus slot: "completed" once a week has a published focus with items. */
export function deriveFocusSlotState(week: HydratedFocusWeek | null | undefined): SlotState {
  return week && week.status === 'published' && week.items.length > 0 ? 'completed' : 'not_started';
}

/** Meeting slot: "completed" once at least one meeting is logged for the week. */
export function deriveMeetingSlotState(meetingsForWeek: LeadMeetingRow[]): SlotState {
  return meetingsForWeek.length > 0 ? 'completed' : 'not_started';
}

/** All meetings whose derived week matches `weekStart`, newest first. */
export function meetingsInWeek(meetings: LeadMeetingRow[], weekStart: string): LeadMeetingRow[] {
  return meetings
    .filter((m) => m.week_start_date === weekStart)
    .slice()
    .sort((a, b) => b.meeting_date.localeCompare(a.meeting_date));
}

/** Minimum transcript length to enable extraction/summary generation, matching
 * the existing IngestDialog convention (coaching-extract-issues rejects shorter). */
export const MIN_TRANSCRIPT_LENGTH = 20;

export function isTranscriptLongEnough(transcript: string): boolean {
  return transcript.trim().length >= MIN_TRANSCRIPT_LENGTH;
}
