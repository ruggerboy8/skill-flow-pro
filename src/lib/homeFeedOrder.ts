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
  'recent-win', // RecentWinBanner
  'current-focus', // CurrentFocusCard — what the focus move is
  'focus-value', // FocusMoveValueCard (MOB-3) — how to do the focus move
  'lead-focus', // LeadFocusHomeCard — leads only
  'lead-meeting-request', // LeadMeetingRequestCard — leads only
] as const;

export type HomeFeedCardId = (typeof HOME_FEED_ORDER)[number];

export const RITUAL_HERO_CARD_ID: HomeFeedCardId = 'ritual-hero';
