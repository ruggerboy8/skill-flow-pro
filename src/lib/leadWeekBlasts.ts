// Pure helpers for the doctor blast slot (LRM-2), kept separate from React
// so the "can I draft" rule, slot-state derivation, and confirm-copy
// builders are unit-testable without touching Supabase, React Query, or the
// edge function. Mirrors the leadMeetingsAndFocus.ts pattern from LRM-1.

import type { LeadWeekBlastRow } from '@/types/leadWeekBlasts';
import type { BadgeStatus } from '@/components/ui/StatusBadge';

/**
 * The one hard rule (see spec "Decisions locked"): a blast needs at least a
 * published focus or a logged meeting to draft from. Everything else about
 * the pipeline is shown, not enforced.
 */
export function canDraftBlast(hasPublishedFocus: boolean, meetingCount: number): boolean {
  return hasPublishedFocus || meetingCount > 0;
}

/** Blast slot state vocabulary, independent of how it's badged in the UI. */
export type BlastSlotState = 'none' | 'draftable' | 'draft' | 'sent';

/**
 * Derives the blast slot's state for a given week from what the week
 * contains (focus, meetings) and the week's blast row, if any.
 */
export function deriveBlastSlotState(
  hasPublishedFocus: boolean,
  meetingCount: number,
  blast: LeadWeekBlastRow | null,
): BlastSlotState {
  if (blast?.status === 'sent') return 'sent';
  if (blast?.status === 'draft') return 'draft';
  return canDraftBlast(hasPublishedFocus, meetingCount) ? 'draftable' : 'none';
}

/**
 * Maps a blast slot state to the StatusBadge vocabulary per the ticket:
 * no draftable content -> locked, draftable but undrafted -> not_started,
 * draft saved -> draft, sent -> completed.
 */
export function blastSlotBadgeStatus(state: BlastSlotState): BadgeStatus {
  switch (state) {
    case 'none': return 'locked';
    case 'draftable': return 'not_started';
    case 'draft': return 'draft';
    case 'sent': return 'completed';
  }
}

/**
 * Body copy for the "Send this to all doctors?" confirm dialog, with the
 * live recipient count built in. Kept as a pure function so the exact
 * wording is unit-testable without rendering the dialog.
 */
export function buildSendConfirmBody(recipientCount: number): string {
  const doctorWord = recipientCount === 1 ? 'doctor' : 'doctors';
  return `This emails ${recipientCount} ${doctorWord} across the organization. It cannot be sent twice.`;
}

/**
 * QA fix: a week with zero eligible doctors must not open the send confirm
 * at all -- there is nothing useful to confirm, and letting it through just
 * produces a 400 from the edge function after the fact.
 */
export function canConfirmSend(recipientCount: number): boolean {
  return recipientCount > 0;
}

/**
 * The read-only summary line for a sent blast. QA fix: a partial failure
 * (some sends failed) must stay visible in the summary, not round up to a
 * clean "sent to everyone" once failedCount is dropped or ignored.
 */
export function formatSentSummary(recipientCount: number, failedCount: number): string {
  const successCount = Math.max(0, recipientCount);
  const failures = Math.max(0, failedCount);
  if (failures <= 0) {
    return `${successCount} doctor${successCount === 1 ? '' : 's'}`;
  }
  const total = successCount + failures;
  return `${successCount} of ${total} doctor${total === 1 ? '' : 's'}`;
}

/**
 * Whether clicking "regenerate" while a draft exists should interrupt with
 * a "Replace the current draft? Your edits will be lost." confirm, versus
 * regenerating straight away. Only interrupts if the draft body currently
 * on screen differs from the last generated/saved value -- i.e. there is
 * something hand-edited that would actually be lost.
 */
export function shouldConfirmRegenerate(currentBody: string, lastGeneratedBody: string): boolean {
  return currentBody.trim() !== lastGeneratedBody.trim();
}
