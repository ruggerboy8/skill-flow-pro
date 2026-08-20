# Spec: MOB-3, Home value reframe (feed that gives before it asks)

**Status:** draft, awaiting John's approval
**Lane:** medium (Home surface restructure + copy; no DB change)
**Ticket:** MOB-3 (Motion, MyProMoves Dev Board)
**Branch:** feature/mob-3-home-value-reframe
**DB change:** none
**Personas to test as:** participant, lead
**Depends on:** nothing to ship the structure; it establishes the ranked-feed
container and card budget that MOB-5 (recognition card) later slots into.

## What and why

The governing thesis (skeleton §0): Pro Moves has been an **input** surface —
staff put honest scores in and got nothing back in the same view. The redesign
**gives value back**: where a surface naturally can, it should hand the staff
member something useful. (Design instinct applied with judgment, not a rigid
"every screen must carry an action" formula.) Home is the most-opened surface,
so it is where this matters most.

Three concrete changes (skeleton §3, "Home"):

1. **Add one value card inside the card budget, pulled from the staff member's
   focus move.** Prefer a script or short audio when the move has one; **fall
   back to the move's text description** (then its one-line `action_statement`)
   when it doesn't. Resource reality (audited 2026-08-20): script/audio exists
   for only ~16% of moves and only for Front Desk + Dental Assistant roles;
   description is 96.8% and the statement 100%. So for most staff this card is a
   well-written description, and **its copy must not promise "listen"/"script"
   when it is showing text.** The focus move is already resolved on Home by
   `CurrentFocusCard`.
2. **Rewrite the "marked late" footnote in the coaching voice** and name the
   audience plainly ("your coach sees it, so they can check in").
3. **Build Home as a ranked feed** with the ritual hero pinned first, so
   broadcast comms and the coach-recognition card (MOB-5) can join later as
   ranked cards without new navigation.

**Explicitly NOT in this ticket (dropped 2026-08-20):** an earlier draft
proposed hiding self-scores behind a tap for over-the-shoulder privacy. John:
people are not reading each other's phones, so that would just be a headache.
Scores render normally; no tap-to-reveal.

## Scope

**In:**
- A focus-move **value card** on mobile Home: script/audio if the move has one,
  else the move's description, else its `action_statement` — never empty.
- Coaching-voice rewrite of the deadline/late disclaimer copy on mobile Home.
- An explicit **ranked-feed** order for the mobile Home cards with the ritual
  hero (`ThisWeekPanel`) pinned first and a documented ranking rule.

**Out:**
- The recognition card itself (MOB-5, depends on MOB-4 glow intake). MOB-3 only
  leaves the ranked-feed slot and card budget it will occupy.
- Any change to desktop Home (`Index.tsx` non-mobile branch stays byte-identical
  — the file already isolates the mobile branch behind `isMobileShell`).
- Changes to the ritual wizards themselves (MOB-8).
- Any score-hiding / tap-to-reveal behavior (dropped).
- Resource→pro-move tagging of other platform material (a future capability;
  none exists today — `pro_move_resources` is the only association).

## Approach (grounded in the real files)

**The mobile Home is `src/pages/Index.tsx`, `isMobileShell` branch (lines
58–134).** It renders, in order: date + greeting, `ThisWeekPanel`, backfill
`Alert`, `EvalReadyCard`, `RecentWinBanner`, `CurrentFocusCard`, the lead cards,
and the deadline disclaimer (lines 122–130). The ritual hero and move list live
inside `ThisWeekPanel` → `MobileMovesAndBanner`
(`src/components/home/ThisWeekPanel.tsx`, lines 673–762).

1. **Ranked feed + pinned hero.** Codify the card order as an explicit ranking
   rule with `ThisWeekPanel` (the week-state hero + ritual CTA) always first
   (a `HOME_FEED_ORDER` list or equivalent) so future cards (recognition, comms)
   insert by rank rather than by editing JSX in place. Keep the
   one-glanceable-hero + one-CTA discipline (P3); the card budget is real.

2. **Focus-move value card with a fallback chain.** The focus move is resolved
   today by `src/components/home/CurrentFocusCard.tsx` via `staff_quarter_focus`
   joined to `pro_moves` (query key `['current-focus-card', staffId]`); its
   `action_id` is the key into resources. Build the card to resolve, in order:
   - a `pro_move_resources` row (`.eq('action_id',…).eq('status','active')`) of
     type `script` (`content_md`) or `audio` (`.url` via
     `supabase.storage.from('pro-move-audio').getPublicUrl()`) — reuse the type
     handling in `src/components/my-role/ProMoveDrawer.tsx` and open the existing
     `LearnerLearnDrawer` / `ProMoveDrawer`, not a new player;
   - else the move's **`description`** (long form, 96.8% coverage);
   - else its **`action_statement`** (100%).
   The card's label/CTA adapts to what it shows ("Listen" / "Read the script" /
   "How to do this move") — never promise audio when it's text. Reuse
   `CurrentFocusCard`'s focus resolution (or extract a shared `useCurrentFocus`)
   rather than a second divergent query.
   **For Doctors (role 4):** staff `script`/`audio` don't exist, but a parallel
   `doctor_*` content system does (~94% coverage) — decide whether the card
   treats `doctor_script` as the script tier for role-4 users (open question).

3. **Coaching-voice copy.** The disclaimer at `Index.tsx` lines 122–130 reads
   "ProMove scores are due on the same day as your Check In/Out meeting. / Scores
   submitted any other time are marked late." Rewrite in the coaching voice —
   "late" as a matter-of-fact status paired with who sees it and why ("your coach
   sees it so they can check in"), never a citation. Standardize the copy to
   "Pro Moves" (the production "ProMove scores" string is a known inconsistency).
   Final wording is John's to set.

## Acceptance criteria (behavioral, testable)

1. On mobile Home, when the staff member has a chosen quarterly focus move, a
   value card appears: it offers the script/audio if one exists (opening the
   drawer), otherwise it shows the move's description, otherwise its statement —
   it is **never an empty shell**, and its label matches what it shows (no
   "listen" on text). When no focus is chosen, the card is absent.
2. The deadline/late line reads in the coaching voice, names who sees a late
   score and why, and uses "Pro Moves" (not "ProMove scores").
3. `ThisWeekPanel` (the ritual hero + CTA) is the first card in the feed in every
   week-state; the feed order follows a single documented ranking rule.
4. Self/performance scores on the move list render **normally** (no hiding, no
   tap-to-reveal). Desktop Home is unchanged.
5. No new database reads beyond the focus move's resources
   (`pro_move_resources`), which the app already queries elsewhere.

## Files touched

- `src/pages/Index.tsx` — mobile branch: ranked-feed order + the value card;
  rewrite the disclaimer copy.
- A new `src/components/home/FocusMoveValueCard.tsx` (or similar) implementing
  the script/audio → description → statement fallback and opening the drawer.
- Possibly a small `src/lib/homeFeedOrder.ts` (or inline constant) for the rule.

## Risks / blast radius

- Confined to the mobile-shell Home (`isMobileShell` branch). Desktop Home and
  all non-flagged users are untouched.
- The focus-move value card shares data shape with `CurrentFocusCard` and the
  drawers; reuse those to avoid a second divergent query.
- The fallback chain must be verified against the resource audit — most staff
  will see the description tier, so that tier must look good, not like a
  degraded "no media" state.

## Open questions for John

1. **Multiple focus moves.** `staff_quarter_focus` can hold more than one row.
   If a staff member has several, does the value card show the first, the
   lowest-confidence one, or rotate? (Recommend: the lowest-confidence focus
   move, matching the recognition-card selection rule in MOB-5.)
2. **Doctor content tier.** Should the value card treat the `doctor_*` content
   as the script tier for role-4 users (0% → ~94% media coverage), or keep
   doctors on the description tier for v1?
