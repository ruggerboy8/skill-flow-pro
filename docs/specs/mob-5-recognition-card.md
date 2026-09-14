# Spec: MOB-5, Home recognition card + Performance glow history

**Status:** draft, awaiting John's approval
**Lane:** medium (Home feed card + Performance section; no DB change of its own — consumes MOB-4's columns)
**Ticket:** MOB-5 (Motion, MyProMoves Dev Board)
**Branch:** feature/mob-5-recognition-card
**DB change:** none new (reads `evaluation_items.observer_glow` + MOB-4's `glow_source_staff_id` / `glow_source_type`)
**Personas to test as:** participant with a released eval that has a glow; participant with glows but none in a low-confidence domain; participant with no glows yet (fallback); new hire (no confidence data)
**Depends on:** **MOB-4** (real glows + per-competency source must exist first — surfacing an empty channel reads as broken) and **MOB-3** (the ranked-feed slot + card budget on Home).

## What and why

Recognition is "the single most powerful reason a staff member would
voluntarily open this app" (skeleton §3), but today a glow is visible **only
inside the evaluation review views** — `src/components/review/CompetencyCard.tsx`
(line 20, rendered line 82 behind a "View Coach Notes" toggle) and
`src/components/review/EvaluationBody.tsx` (lines 54–58), both fed by the review
payload. It never reaches Home or Performance. This ticket surfaces it in two
places:

1. **A Home recognition card** that always has something warm (skeleton §3,
   decisions log #3): when a real glow exists, it shows that glow; when none
   does yet, it shows generic encouragement rather than an empty shell, so the
   surface never reads as broken during the intake ramp.
2. **A glow history on Performance**, so past recognition accumulates somewhere
   the staff member can revisit.

**The decided selection rule (skeleton §7 #3, plan Wave 1):** feature **exactly
one** glow — the one in the staff member's **lowest-confidence domain**
(recognition lands where they feel weakest). Fallback chain: **a glow in a
low-confidence domain → any recent glow → generic encouragement.** Never a stack
of every glow; never empty.

## Grounded-in-code facts

- **Home mobile feed:** `src/pages/Index.tsx`, `isMobileShell` branch
  (lines 58–134). Order today is hardcoded JSX (no rank constant): greeting →
  `ThisWeekPanel` → backfill `Alert` → `EvalReadyCard` → `RecentWinBanner` →
  `CurrentFocusCard` → lead block → deadline disclaimer. **MOB-3 converts this
  into a documented ranked feed with a `HOME_FEED_ORDER`-style rule and the
  ritual hero pinned first** — the recognition card slots in *by rank* through
  that mechanism, which is exactly why MOB-5 depends on MOB-3 rather than editing
  the JSX in place.
- **Performance page:** `src/pages/performance/PerformancePage.tsx`. `staffId`
  from `useStaffProfile().id` (lines 39–40). Main query key
  `['performance-page', staffId]` (line 43). Render order (lines 125–277):
  focus hero → coach-vs-self calibration → `ConfidenceCard` → `OnTimeRateWidget`.
  Notably it reads `observer_grow` (the growth note, line 105) — **it does not
  read `observer_glow` today**, so the glow history is a genuinely new surface.
- **Confidence / lowest-confidence domain:**
  `src/components/performance/ConfidenceCard.tsx` reads
  `useMyWeeklyScores({ staffId })` (line 46) → RPC `get_staff_all_weekly_scores`.
  It builds `domainAverages` = a `Map<domain_name, {sum,count}>` over rows in the
  active window where `confidence_score != null` (lines 55–65). **The
  lowest-average domain over that window is the lowest-confidence domain** — the
  exact aggregation this card already computes; MOB-5 reuses it rather than
  inventing a second confidence metric.
- **The confidence data carries the domain handle:** `useStaffAllWeeklyScores`
  (`src/hooks/useStaffAllWeeklyScores.tsx`) returns both `domain_id` and
  `domain_name` per score row (rows include `domain_id: number | null`,
  `domain_name: string`). So a domain is available without a client-side join.
- **Glows carry their domain too:** `evaluation_items` denormalizes `domain_id`
  and `domain_name` directly on the row (populated at seed in
  `createDraftEvaluation`, `src/lib/evaluations.ts` lines 203–209). So a glow's
  domain is on the same row as `observer_glow` — no join needed to match a glow
  to a domain. The competency→domain chain (`competencies.domain_id →
  domains.domain_name`) is already flattened onto the eval item.
- **Attribution:** post-MOB-4, a glow's giver is
  `evaluation_items.glow_source_staff_id` (+ `glow_source_type`), resolved to a
  name by `staff.name` — the same id→name pattern already used for
  `evaluations.evaluator_id` in five call sites (e.g. `EvaluationViewer.tsx`
  line 242).
- **Which glows a staff member may see:** glows must come only from **released**
  evals — evaluations with `status = 'submitted'` **and**
  `is_visible_to_staff = true` (the exact filter `PerformancePage` uses to pick
  the newest eval, lines 49–54). A glow on an unreleased draft must never surface.

## Approach (grounded in the real files)

### A shared glow-selection hook (single source of truth)

Both surfaces need the same data, so build one hook, e.g.
`src/hooks/useStaffGlows.ts` (react-query, key `['staff-glows', staffId]`):

1. Fetch the staff member's **released** evals
   (`evaluations` where `staff_id = staffId`, `status = 'submitted'`,
   `is_visible_to_staff = true`), then their `evaluation_items` where
   `observer_glow` is non-null, selecting
   `observer_glow, domain_id, domain_name, competency_name_snapshot,
   glow_source_staff_id, glow_source_type` plus the eval's date
   (`observed_at`/`created_at`) for recency ordering.
2. Resolve `glow_source_staff_id → staff.name` (batch the ids, one lookup),
   falling back to the eval's `evaluator_id` name when the source id is null
   (pre-MOB-4 glows have no source — they still show, attributed to the
   evaluator, so old glows aren't stranded).
3. Return the full list (for Performance history) plus a `featuredGlow`
   computed by the selection rule below.

### The selection rule (the decided one)

`featuredGlow` is chosen by:

1. Compute the **lowest-confidence domain** by reusing `ConfidenceCard`'s
   `domainAverages` aggregation over `get_staff_all_weekly_scores` (extract that
   averaging into a small shared helper, e.g. `useLowestConfidenceDomain(staffId)`,
   so the card and this hook can't drift). Take the domain with the lowest
   average `confidence_score` in the window.
2. **Tier 1:** the most recent glow whose `domain_name` (or `domain_id`) equals
   that lowest-confidence domain.
3. **Tier 2 (fallback):** if no glow exists in that domain (or confidence data
   is too sparse to pick a domain — e.g. a new hire), the most recent glow in any
   domain.
4. **Tier 3 (fallback):** if there are no glows at all, `null` — and the Home
   card renders **generic encouragement** instead (a warm, static line; not
   attributed to anyone). The Performance history renders an empty-but-inviting
   state.

### Home recognition card

- New component `src/components/home/RecognitionCard.tsx`, rendered in the
  `isMobileShell` branch of `Index.tsx` **via MOB-3's ranked-feed order** (not a
  raw JSX insertion). Suggested rank: below the ritual hero + any urgent
  action, above the focus value card — recognition is a reason to open the app,
  but the week's ritual is still the pinned hero (P3, card budget is real).
- When `featuredGlow` exists: show the giver + the glow text ("Ariyana noticed
  your hand-off with the Nguyen family"), attributed via the resolved source
  name, optionally tagged with the domain it lands in. Warm styling
  (`--win-*` tokens already exist for this register).
- When `featuredGlow` is null: show generic encouragement. The card is **never
  empty** (decisions log #3).
- One glow only — no stack (decisions log #3).

### Performance glow history

- Add a section to `PerformancePage.tsx` — recommend **after** the focus hero
  and near/with the `ConfidenceCard` (recognition sits naturally beside the
  "where I'm still building" view, and both key off domain). It lists the glows
  from `useStaffGlows`, most recent first, each showing the giver, the domain,
  and the glow text.
- This is the "fold in the recognition glow history" that MOB-7 later expects on
  Performance (plan MOB-7: "Fold in the recognition glow history (MOB-5)"), so
  building it here as a self-contained section keeps MOB-7 to a re-order.

## Acceptance criteria (behavioral, testable)

1. On mobile Home, a recognition card appears in the ranked feed. When the staff
   member has at least one glow, it features **exactly one** — the most recent
   glow in their **lowest-confidence domain** if one exists there, otherwise the
   most recent glow in any domain — attributed to the giver by name.
2. When the staff member has **no** glows yet, the Home card shows generic
   encouragement and is never empty or broken-looking.
3. The featured glow is drawn only from **released** evals
   (`status='submitted'` AND `is_visible_to_staff=true`); a glow on an
   unreleased draft never appears on Home or Performance.
4. The lowest-confidence domain used for selection matches what `ConfidenceCard`
   would show as the weakest domain for the same window (they share one
   aggregation helper — verify they agree).
5. Performance shows a glow history listing the staff member's glows (most recent
   first) with giver + domain + text; a staff member with no glows sees an
   inviting empty state, not a blank.
6. A pre-MOB-4 glow (no `glow_source_staff_id`) still renders, attributed to the
   eval's `evaluator_id` name — old recognition is not stranded.
7. Desktop Home is unchanged; all non-flagged users are untouched. No new writes.

## Files touched

- New `src/hooks/useStaffGlows.ts` — released-eval glow fetch + source-name
  resolution + `featuredGlow` selection.
- New small helper `src/hooks/useLowestConfidenceDomain.ts` (or an exported
  function) extracted from `ConfidenceCard`'s `domainAverages` logic, shared by
  the card and the glow selector so they can't drift.
- New `src/components/home/RecognitionCard.tsx` — the Home card (glow or generic
  encouragement).
- `src/pages/Index.tsx` — register the card in MOB-3's ranked feed order (mobile
  branch only).
- `src/pages/performance/PerformancePage.tsx` — add the glow-history section.
- Possibly a small `src/components/performance/GlowHistory.tsx`.

## Risks / blast radius

- **Hard dependency on MOB-4.** Without MOB-4's intake fix, the featured glow is
  almost always the generic-encouragement fallback (9 glows total, zero since
  June). That's acceptable by design (the fallback exists for exactly this ramp),
  but do not ship MOB-5 expecting rich data until MOB-4 has been feeding intake
  for a cycle.
- **Attribution correctness.** The card names a real coworker ("Ariyana
  noticed…"). If source resolution is wrong, it misattributes praise — a bad
  failure mode. Mitigation: resolve source by `glow_source_staff_id` first, fall
  back to `evaluator_id`, and never guess; if neither name resolves, show the
  glow without a name rather than a wrong name.
- **Confidence-domain sparsity.** New hires and thinly-scored staff may have no
  usable `domainAverages`. The selection rule degrades cleanly to "any recent
  glow" then "generic encouragement," so a missing domain never errors — verify
  the empty-confidence path.
- **Privacy / scope.** Only released, visible evals feed the surface. Double-check
  the query cannot leak a draft or a peer's glow (it is keyed on
  `staff_id = staffId` and the released filter).
- Confined to the mobile-shell Home + the Performance page; no schema change of
  its own.

## Open questions for John

1. **"Recent" window for the Tier-2 fallback.** Any recent glow — bounded to the
   current quarter, the last N months, or genuinely any glow ever? Recommend the
   most recent glow regardless of age (a warm word doesn't expire), but confirm.
2. **Generic-encouragement copy.** Static single line, or a small rotating set
   so a glow-less staff member doesn't see the identical string every day?
   Recommend a small rotating set in the coaching voice; final wording is yours.
3. **Should the featured Home glow rotate or dismiss?** If a staff member has
   several glows in their weakest domain, does the card always show the most
   recent, rotate, or let them dismiss to see the next? Recommend "most recent,
   no dismiss" for v1 (simplest; matches "surface one, chosen well").
4. **Performance history ordering.** Strictly chronological, or grouped by
   domain (so it mirrors the ConfidenceCard's domain framing)? Recommend
   chronological for v1.
5. **Lowest-confidence window.** `ConfidenceCard` defaults to a `quarter`
   (13-week) window. Use the same window to pick the domain for glow selection?
   Recommend yes, for consistency with what the staff member sees on Performance.
