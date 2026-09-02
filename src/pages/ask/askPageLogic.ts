// Pure logic + small viewport hooks for AskPage, split out so they're
// testable without rendering the full chat page (see AskPage.tsx).

import { useState } from 'react';

export interface PendingAsk {
  // null while the conversation is still being created for a first send.
  conversationId: string | null;
  question: string;
  // Message count at send time.
  prevCount: number;
}

/**
 * Whether the optimistic "pending" bubble (the just-sent question + the
 * "Checking our playbook…" bubble) should still be shown.
 *
 * Carried over from PR #81: the bubble is keyed to the conversation it was
 * sent in (so switching conversations mid-ask doesn't bleed it into the
 * wrong thread) and to the message count at send time (so it stays up until
 * both real rows — question + answer — have landed, independent of their
 * content, which is what makes a *repeated* question still show feedback
 * instead of the pending bubble being mistaken for already-satisfied by an
 * identical prior message).
 */
export function computeShowPending(
  pending: PendingAsk | null,
  activeId: string | null,
  messagesLength: number
): boolean {
  if (!pending) return false;
  if (pending.conversationId !== activeId) return false;
  return messagesLength < pending.prevCount + 2;
}

/**
 * Real hardware keyboards make Enter-to-send predictable; on a touch
 * keyboard "Enter" often just means "next line" to the user. Synchronously
 * initialized (same pattern as useIsMobile in src/hooks/use-mobile.tsx) so
 * it's correct on the first paint, not just after an effect — see the
 * mobile-shell footgun note in the ASK-1b spec.
 */
export function useIsTouchDevice(): boolean {
  const [isTouch] = useState<boolean>(
    () => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches
  );
  return isTouch;
}

/** Same synchronous-first-render pattern, for the auto-scroll + bounce dots. */
export function usePrefersReducedMotion(): boolean {
  const [reduced] = useState<boolean>(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
  return reduced;
}
