# Explore Tab / My Role Atlas Build Instructions

**Status:** v1, 2026-08-13. **Executor spec** for phases E1+E2 of
`docs/features/explore-page-plan.md`: rename the My Role tab to Explore
and rebuild its mobile surface as the Craft Atlas. Written for a coding
agent with no access to the design conversation.

**The Ground rules section of `docs/features/mobile-build-instructions.md`
applies unchanged**: gating via `useMobileShell()`, the do-not-touch list,
no new DB objects, verbatim copy, 44px targets, press feedback, lucide
icons only, design tokens only.

**Visual spec:** open `docs/archive/prototypes/my-role-exploration-concepts.html`
in a browser and study **Concept B, "The Craft Atlas"** (the middle
section). That is the agreed design for this build: domain bands holding
level-painted competency tiles, an area page pairing the coach's context
with the moves, then the existing study drawer. Concepts A and C are NOT
being built; ignore them. The Alcan Way is explicitly out of scope (its
concepts are not yet approved); build nothing for it and leave no
placeholder for it.

**Decisions already made (do not relitigate):**
- The bottom tab is renamed **Explore**; the pillar inside keeps the name
  **My Role**. No segmented control yet — My Role is the only pillar, so
  the Explore tab lands directly on the atlas. No "coming soon" anything.
- Desktop is untouched: desktop keeps RoleRadar, the My Role sub-tabs,
  and the existing domain pages exactly as they are today. Everything in
  this spec renders only when `useMobileShell()` is true.
- The Way is stateless; nothing here persists exploration state.

---

## A. Tab rename (E1)

1. In `src/components/mobile/MobileTabBar.tsx`: the second tab's label
   becomes **Explore** (route stays `/my-role`; do not rename routes).
   Swap the icon from BookOpen to `Compass` (lucide) — an encyclopedia
   you explore, not a book you read. `ownerTabFor()` logic is unchanged.
2. Grep the mobile-shell surfaces for user-facing "My Role" references
   that mean *the tab* (e.g. any BackPill labels pointing at `/my-role`)
   and re-label those "Explore". References meaning *the pillar/content*
   (the atlas page's own header) stay "My Role".

## B. The atlas overview (replaces RoleRadar on mobile only)

Route: `/my-role` when `useMobileShell()` is true. Desktop continues to
render RoleRadar untouched — branch inside the route component, do not
fork the route.

Layout, top to bottom (Concept B, screen 1):
1. Header: eyebrow **Explore**, h1 **My Role**, sub line
   "{n} skill areas, one map. The color is the domain. The badge is you."
   with n = the real competency count after the lead merge.
2. Snapshot strip: level-count pills for the person's current levels
   (e.g. "Mastery ×3", "Building ×2"). Render only levels with count > 0;
   if no evaluation exists yet, render instead the single line
   "Your coach levels appear here after your first evaluation." (no
   pills, no empty chrome).
3. Domain bands, in `DOMAIN_ORDER` from
   `src/lib/content/roleDefinitions.ts`. Band header: 10px color dot in
   the domain's rich color + domain name + "N areas · M moves" count.
   Under it a 2-column tile grid.
4. Tile: pastel domain background (`getDomainColor`), competency name
   (14-15px, semibold), then a row with the level pill and "{m} moves"
   count. Whole tile is one 44px+ pressable navigating to the area page
   (section C). Level pill colors use the score-bucket tokens
   (`--score-4-bg/-ink` for Mastery, `--score-3-*` Proficient,
   `--score-2-*` Building) and a neutral muted pill reading
   **"Not yet rated"** when unscored.

Level mapping (reuse the existing thresholds in
`src/pages/my-role/DomainDetail.tsx`): observer score >= 3.5 → Mastery,
>= 2.5 → Proficient, otherwise Building; null → Not yet rated.

## C. The area page (new screen)

Route: add `/my-role/area/:competencyId` (mobile-shell surface; on
desktop this route may render a simple redirect to the competency's
domain page — desktop users have no entry point to it anyway).

Layout (Concept B, screen 2):
1. BackPill labeled "Explore" to `/my-role`.
2. Hero on the domain's pastel: domain crumb, competency name as h1, the
   competency `description` (or `friendly_description` if that's what
   the existing hook surfaces — match whatever `useDomainDetail` already
   maps into `subtitle`/`description`).
3. Coach card, rendered ONLY when data exists (never an empty shell):
   level pill ("Coach level: Proficient") + the evaluation period and
   evaluator first name when available + the `observer_note` for this
   competency from the most recent visible evaluation, as a short quoted
   paragraph. If there is a note but no score, show the note without the
   pill; if neither exists, omit the card entirely.
4. "{m} moves in this area" label, then the move rows: reuse the
   existing `ProMoveRow` component and the existing study drawer
   (`ProMoveDrawer` / `LearnerLearnDrawer` path used by
   `DomainDetail.tsx` today) unchanged — tapping a row opens the same
   drawer with the same props. Do not rebuild the study view.

## D. Data

Build one new hook, `src/hooks/useCraftAtlas.ts`, and get the role-merge
right by REUSING, not duplicating:

1. **Extract** the role-resolution + merge-then-filter logic that
   round 3 built into `src/hooks/useDomainDetail.ts` (base role +
   `useLeadRoleId` for leads; same-named competencies merge into the
   base competency with moves deduped by `action_id`; empty competencies
   dropped) into a shared helper both hooks consume. Behavior of the
   existing domain page must not change; its tests of record are the
   acceptance checks below.
2. The atlas overview needs, across ALL domains at once: competencies
   (id, name, description, domain) for the merged roles, active move
   counts per competency, and the person's per-competency
   `observer_score` from the most recent released+visible evaluation
   (same evaluation-selection pattern `useDomainDetail` uses). The area
   page additionally needs that competency's `observer_note` and the
   evaluation's period label + evaluator name (already fetchable via the
   patterns in `PerformancePage.tsx`).
3. No new tables, no new RPCs, no schema changes. Compose from the
   existing queryable surfaces only. If something is genuinely
   unreachable without a new DB object, leave a `// TODO(build-review):`
   and render that element conditionally absent.

## E. Interactions and polish

- Tiles and rows: `:active` press feedback, 44px+ targets.
- Screen transitions already exist via the shell; add nothing new.
- Dark mode: pastel tiles must use the token pairs (the `.dark`
  overrides exist); verify the atlas in dark mode.
- The Performance page's flagged-item links currently navigate to
  `/my-role/domain/:domainSlug`; leave them working (the domain page
  remains reachable on mobile as a secondary surface). Do not retarget
  them in this round.

## F. Copy appendix (verbatim)

- Overview sub line: `{n} skill areas, one map. The color is the domain. The badge is you.`
- No-eval snapshot line: `Your coach levels appear here after your first evaluation.`
- Unrated pill: `Not yet rated`
- Area page move-count label: `{m} moves in this area`
- Coach card pill: `Coach level: {level}`

## G. Acceptance

1. `npm run build` green; desktop `/my-role` (RoleRadar + sub-tabs)
   byte-identical in behavior; desktop unaffected everywhere.
2. Mobile shell: Explore tab lands on the atlas; every competency tile
   opens its area page; every move row opens the existing study drawer;
   back pills return correctly; tab ownership stays correct.
3. Lead account data shape: the merged lead competency situation
   (round 3) renders correctly — no blanks, no duplicates, the lead's
   move present inside the same-named base competency's area page.
4. The three data states all render: evaluated (pills + coach cards),
   never evaluated (no-eval snapshot line, tiles with "Not yet rated",
   area pages without coach cards), and evaluated-without-notes (pill
   but no quote).
5. Dark mode legible on overview and area pages.

## Operational rules (same as prior rounds)

One local commit per section (A through E), messages prefixed
"Explore atlas: ". `npm run build` green after each. NEVER push; never
run supabase commands or touch any database; touch nothing under
docs/archive/prototypes/. Final report: per-section commits, the acceptance
checklist with pass/fail/not-verifiable per item, any TODO(build-review)
left, and any place the visual spec was ambiguous and what you chose.
