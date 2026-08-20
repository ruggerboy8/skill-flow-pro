/**
 * The ranked order of cards on the mobile-shell Home feed (MOB-3).
 *
 * `ThisWeekPanel` (the ritual hero + CTA) is always rank 0 — pinned first in
 * every week-state, never reordered. Everything else is a card that can be
 * present or absent depending on the staff member's state; when present, it
 * renders in `Index.tsx` (`isMobileShell` branch) in this rank order.
 *
 * Future cards (MOB-5 recognition, broadcast comms) get a new id here and are
 * inserted into the Index.tsx JSX at the matching position, so the order is
 * decided once, in one place, instead of by editing JSX in place each time.
 */
export const HOME_FEED_ORDER = [
  'ritual-hero', // ThisWeekPanel — pinned first, always. Never move this rank.
  'backfill-alert', // conditional: only while a backfill window is active
  'eval-ready', // EvalReadyCard — nudge to acknowledge a released evaluation
  'recent-win', // RecentWinBanner — an earned win ranks ABOVE recognition:
  // "wins stay louder than gaps", and the recognition card shows a generic
  // encouragement line for most staff, which must never outrank a real win.
  'recognition', // RecognitionCard (MOB-5) — a reason to open the app, but
  // below the ritual hero, any urgent action, and a real recent win.
  'current-focus', // CurrentFocusCard — what the focus move is
  'focus-value', // FocusMoveValueCard (MOB-3) — how to do the focus move
  'lead-focus', // LeadFocusHomeCard — leads only
  'lead-meeting-request', // LeadMeetingRequestCard — leads only
] as const;

export type HomeFeedCardId = (typeof HOME_FEED_ORDER)[number];

export const RITUAL_HERO_CARD_ID: HomeFeedCardId = 'ritual-hero';
