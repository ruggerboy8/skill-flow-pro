# Spec: MOB-3, Home value reframe (feed that gives before it asks)

**Status:** draft, awaiting John's approval
**Lane:** medium (Home surface restructure + copy; no DB change)
**Ticket:** MOB-3 (Motion, MyProMoves Dev Board)
**Branch:** feature/mob-3-home-value-reframe
**Spec:** this file
**DB change:** none
**Personas to test as:** participant, lead
**Depends on:** nothing to ship the structure; it establishes the ranked-feed
container and card budget that MOB-5 (recognition card) later slots into.

## What and why

The governing thesis of the redesign (skeleton §0): Pro Moves has been an
**input** surface — staff put honest scores in and got nothing back in the same
view. "**Mirror out, tool in**": every surface that shows a staff member their
own data must hand them something in the same view. Home is the screen most
often open in an operatory between patients, so it is where this matters most.

Four concrete changes (skeleton §3, "Home"):

1. **Add one value card inside the card budget: a script / 30-second-listen
   pulled from the staff member's focus move.** This is the cheapest reciprocity
   lever and "the reason to open the app on a Tuesday." The resources already
   exist (`pro_move_resources`, types `script` / `audio`) and the focus move is
   already resolved on Home by `CurrentFocusCard`.
2. **Stop displaying raw self-scores on the public glance.** Today the mobile
   move rows render the confidence/performance numbers inline via `ConfPerfDelta`
   — an honest "2" is visible to anyone walking past. Show status by color;
   reveal the numbers on tap.
3. **Rewrite the "marked late" footnote in the coaching voice** and name the
   audience ("your coach sees it, so they can check in"), per principle P8.
4. **Build Home as a ranked feed** with the ritual hero pinned first, so
   broadcast comms and the coach-recognition card (MOB-5) can join later as
   ranked cards without new navigation.

## Scope

**In:**
- A focus-move **value card** on the mobile Home surfacing a script or short
  audio resource for the staff member's current quarterly focus move.
- Hiding raw confidence/performance numbers on the Home move list behind a tap
  (color/status stays visible; numbers reveal on interaction).
- Coaching-voice rewrite of the deadline/late disclaimer copy on mobile Home.
- Establishing an explicit **ranked-feed** order for the mobile Home cards with
  the ritual hero (`ThisWeekPanel`) pinned first and a documented ranking rule.

**Out:**
- The recognition card itself (MOB-5, depends on MOB-4 glow intake). MOB-3 only
  leaves the ranked-feed slot and card budget it will occupy.
- Any change to the desktop Home (`Index.tsx` non-mobile branch stays
  byte-identical — the file already isolates the mobile branch behind
  `isMobileShell`).
- Changes to the ritual wizards themselves (MOB-8).
- Changing `ConfPerfDelta` on desktop or on the Performance surface — the
  tap-to-reveal change is scoped to the mobile Home move list.

## Approach (grounded in the real files)

**The mobile Home is `src/pages/Index.tsx`, `isMobileShell` branch (lines
58–134).** It renders, in order: date + greeting, `ThisWeekPanel`, backfill
`Alert`, `EvalReadyCard`, `RecentWinBanner`, `CurrentFocusCard`, the lead cards,
and the deadline disclaimer (lines 122–130). The ritual hero and move list live
inside `ThisWeekPanel` → `MobileMovesAndBanner`
(`src/components/home/ThisWeekPanel.tsx`, lines 673–762).

1. **Ranked feed + pinned hero.** Codify the card order as an explicit ranking
   rule with `ThisWeekPanel` (the week-state hero + ritual CTA) always first.
   The current order is already close; the deliverable is making the ordering a
   named, documented rule (a `HOME_FEED_ORDER` list or equivalent) so future
   cards (recognition, comms) insert by rank rather than by editing JSX in place.
   Keep the one-glanceable-hero + one-CTA discipline (P3): do not let the feed
   grow unbounded — the card budget is real.

2. **Focus-move value card.** The focus move is resolved today by
   `src/components/home/CurrentFocusCard.tsx` via `staff_quarter_focus` joined to
   `pro_moves` (query key `['current-focus-card', staffId]`). Its `action_id` is
   the key into resources. Resources come from `pro_move_resources`
   (`.eq('action_id', …).eq('status','active')`), and the type handling already
   exists in `src/components/my-role/ProMoveDrawer.tsx`: `type === 'script'` →
   `content_md`; `type === 'audio'` → `.url` resolved via
   `supabase.storage.from('pro-move-audio').getPublicUrl()`. Build the value card
   to fetch the focus move's script/audio resource and present it as "here's
   what this one sounds like / here's the script" — opening the existing
   `LearnerLearnDrawer` (already used from `ThisWeekPanel`, imported line 23) or
   `ProMoveDrawer` rather than a new player. When the focus move has no script or
   audio resource, the card hides (no empty state) — reuse `CurrentFocusCard`'s
   "return null when no data" pattern.

3. **Hide raw self-scores.** In `MobileMovesAndBanner`
   (`ThisWeekPanel.tsx` line ~723), each row renders
   `<ConfPerfDelta confidence={…} performance={…} />` with the numbers visible.
   Replace the always-visible numeric delta on the Home glance with a
   status/color indicator (the app's status tokens already encode
   complete/missing/late/pending, and score-1 is orange not red per the design
   addenda), and reveal the actual numbers only on tap/expand of that row. The
   `ConfPerfDelta` component itself can stay for the tapped/expanded state; the
   change is what the *resting* glance shows.

4. **Coaching-voice copy.** The disclaimer at `Index.tsx` lines 122–130 reads
   "ProMove scores are due on the same day as your Check In/Out meeting. / Scores
   submitted any other time are marked late." Rewrite in the coaching voice and
   name the audience per P8 — "late" as a matter-of-fact status paired with who
   sees it and why ("your coach sees it so they can check in"), never as a
   citation. Note: the *production* string "ProMove scores" is a real
   inconsistency the design addenda flag; standardize to "Pro Moves" in the new
   copy. Final wording is John's to set.

## Acceptance criteria (behavioral, testable)

1. On the mobile Home, when the staff member has a chosen quarterly focus move
   with a script or audio resource, a value card appears offering that
   script/listen and opens the resource in a drawer. When the focus move has no
   such resource (or no focus is chosen), the card is absent — no empty shell.
2. The Home move list shows each move's status by color at rest and does **not**
   display the raw confidence/performance numbers until the row is tapped/
   expanded; tapping reveals the numbers.
3. The deadline/late line reads in the coaching voice, names who sees a late
   score and why, and uses "Pro Moves" (not "ProMove scores").
4. `ThisWeekPanel` (the ritual hero + CTA) is the first card in the feed in every
   week-state; the feed order follows a single documented ranking rule.
5. Desktop Home and the Performance surface's use of `ConfPerfDelta` are
   unchanged.
6. No new database reads beyond the focus move's resources
   (`pro_move_resources`), which the app already queries elsewhere.

## Files touched

- `src/pages/Index.tsx` — mobile branch: introduce the ranked-feed order + the
  value card; rewrite the disclaimer copy.
- `src/components/home/ThisWeekPanel.tsx` — `MobileMovesAndBanner`: tap-to-reveal
  scores on the move rows.
- A new `src/components/home/FocusMoveValueCard.tsx` (or similar) fetching the
  focus move's script/audio resource and opening the existing drawer.
- Possibly a small `src/lib/homeFeedOrder.ts` (or inline constant) for the
  ranking rule.

## Risks / blast radius

- Confined to the mobile-shell Home (`isMobileShell` branch). Desktop Home and
  all non-flagged users are untouched.
- The focus-move value card shares data shape with `CurrentFocusCard` and the
  drawers; reusing those avoids a second divergent query. Risk is duplicating the
  focus-resolution logic — reuse `CurrentFocusCard`'s query or extract a shared
  `useCurrentFocus` hook.
- Tap-to-reveal must not break the row's existing tap-to-open-learn-drawer
  affordance where a move has resources (that gesture already exists on the row);
  disambiguate the two tap targets so revealing a score and opening a resource do
  not collide.

## Open questions for John

1. **Value card content when several focus moves exist.** `staff_quarter_focus`
   can hold more than one focus row (the Performance page assumes single-focus
   with a `TODO`). If a staff member has multiple, does the Home value card show
   the first, the lowest-confidence one, or rotate? Recommend: the first focus
   move that actually has a script/audio resource.
2. **Score reveal gesture.** Tap-to-expand the row vs a small "show my scores"
   toggle for the whole list. Recommend per-row tap, but confirm.
