# Mobile Shell Build Instructions

**Status:** v1, 2026-08-13. **This is the build source of truth** for the
mobile shell work. It is written to be executed by a coding agent with no
access to the design conversation. Companions: `mobile-build-plan.md`
(phasing), `mobile-design-principles.md` (rationale + 5 addenda of
decisions), `pwa-push-notifications.md` (the already-built PWA layer),
and the agreed prototype `docs/archive/prototypes/mobile-shell-prototype.html`
(open it in a browser; it is the visual spec).

**Working method:** execute sections in the sequence at the bottom. Each
section ends with acceptance checks; a section is done when its checks
pass and `npm run build` is green. Follow conservative migration practice
throughout: build new alongside old, never break live paths, and gate all
mobile-shell behavior so non-flagged users and all desktop users see
zero change.

---

## Ground rules (read before writing any code)

1. **Gating.** The mobile shell activates only when BOTH are true:
   `useIsMobile()` (existing hook, <768px) AND the user is PWA-flagged
   (`pwaEnabled` from `useAuth()`, or `localStorage.pwa_v1 === 'on'` via
   `isPwaActive()` in `src/lib/pwa.ts`). Non-flagged mobile users keep
   the current sidebar layout. Desktop is never affected. Centralize this
   in one hook: `useMobileShell()` returning a boolean; every conditional
   in this document uses it.
2. **Do not touch:** the desktop sidebar experience, the coach dashboard
   (`/coach`), clinical/doctor surfaces, admin surfaces, the wizards'
   data-write logic, the sequencer, anything in `supabase/functions/`,
   and Lovable's generated `src/integrations/supabase/types.ts` (do not
   regenerate it; hand-type any missing columns the way `useAuth.tsx`
   already does for `pwa_enabled`).
3. **No new DB objects.** Everything in this build reads existing tables
   and RPCs. If you believe you need a new RPC or column, stop and leave
   a TODO comment plus a note in your final report instead of creating it.
4. **Production copy is law.** Strings quoted in this document from
   existing code (week banners, scale tooltips, win banners, disclaimers)
   must be reused from their existing sources, not retyped. New copy is
   given verbatim in the Copy appendix; use it exactly.
5. **Design tokens only.** No hardcoded Tailwind color classes for
   semantic states (CLAUDE.md rule). New tokens are defined in section A;
   use them via `hsl(var(--token))`.
6. **Icons:** lucide-react only, sized per CLAUDE.md (16px inline
   `h-4 w-4`, 20px interactive `h-5 w-5`). No emoji in UI copy.
7. **Touch targets:** every tappable control in mobile-shell surfaces is
   at least 44px tall. Press feedback via an `:active` style (scale or
   background tint), matching the prototype.
8. **Verification loop:** after each section, run `npm run build`, then
   verify in the browser preview at mobile viewport with
   `localStorage.pwa_v1 = 'on'`. To see participant data surfaces, use
   the existing sim/masquerade tooling where available; otherwise verify
   rendering with your own account and note which states you could not
   exercise.

## Step 0: sync with origin (do this first)

Local `main` is ~8 commits ahead (PWA Phase 1 + docs) and ~82 commits
behind `origin/main` (Lovable's work). Before any new code:

1. `git fetch origin` and merge `origin/main` into `main` (merge, not
   rebase; preserve our commit history).
2. Expected conflict zones: `package.json` / `package-lock.json` (keep
   both sides' dependencies; ours adds `vite-plugin-pwa`),
   `vite.config.ts` (ours adds the `VitePWA` plugin block; keep any
   Lovable changes around it), `index.html` (ours adds PWA meta tags),
   `src/App.tsx` (ours adds `PwaManager` import + mount), and
   `src/hooks/useAuth.tsx` (ours adds `pwaEnabled`).
3. If Lovable's regenerated `types.ts` now includes `staff.pwa_enabled`,
   simplify the hand-cast in `useAuth.tsx` to use the typed select and
   remove the `as unknown as` cast. If not, leave the cast as is.
4. After merge: `npm install`, `npm run build`, and confirm `dist/sw.js`
   and `dist/manifest.webmanifest` still emit with a precache count in
   the build output. Do not push yet; pushing happens at the end of the
   whole build.

## A. Design tokens

File: `src/index.css`. All additive; do not rename existing tokens.

1. Add ink pairs and tint text, in `:root`:
   `--muted-tint: 215 20% 38%;`
   `--clinical-ink: 211 70% 30%; --clerical-ink: 123 45% 22%;
   --cultural-ink: 330 50% 32%; --case-acceptance-ink: 30 70% 28%;`
   `--complete-ink: 142 71% 24%; --late-ink: 40 80% 25%;
   --missing-ink: 0 70% 35%;`
   `--score-1-ink: 24 85% 27%; --score-2-ink: 40 80% 25%;
   --score-3-ink: 211 70% 30%; --score-4-ink: 160 84% 20%;`
2. **Fix the existing dark-mode bug:** the `.dark` block does not
   override `-pastel` or `--score-*-bg` values, so pastel chips glow
   near-white on dark cards. Add dark values in the `.dark` block:
   pastels at roughly the same hue, ~45-55% saturation, 20-24% lightness
   (e.g. `--domain-clinical-pastel: 211 55% 22%`), score bgs likewise,
   and set each `-ink` token in `.dark` to a light tone of its hue
   (~80% lightness). Verify by toggling dark mode on My Role.
3. Confirm `--score-1-bg` is the orange `24 100% 93%` (it is in
   production; the rule to preserve: **score 1 never renders in the
   missing-red family**).

Acceptance: build green; light mode pixel-identical on desktop; dark
mode shows readable pastel chips on `/my-role`.

## B. Mobile shell: tab bar + layout branch

1. New `src/hooks/useMobileShell.ts`: returns
   `useIsMobile() && isPwaActive(pwaEnabled)` (import `isPwaActive` from
   `src/lib/pwa.ts`, `pwaEnabled` from `useAuth`).
2. New `src/components/mobile/MobileTabBar.tsx`: four tabs — Home (`/`),
   My Role (`/my-role`), Performance (`/performance`), More (`/more`).
   Fixed to the bottom inside the layout flow (not `position:fixed` over
   content; reserve its height), `padding-bottom:
   env(safe-area-inset-bottom)`, lucide icons at `h-6 w-6` equivalent
   (24px per CLAUDE.md standalone size), 10px labels, active tab in
   `--primary` with weight 700. Active-tab ownership map (highlight the
   owning tab for nested routes):
   Home owns `/`, `/confidence/*`, `/performance/:week/*` (the wizard),
   `/team`, `/team/:staffId`;
   My Role owns `/my-role/*` except `/my-role/evaluations`;
   Performance owns `/performance` (the new page), `/my-role/evaluations`,
   `/evaluation/:evalId`;
   More owns `/more`, `/profile`.
3. In `src/components/Layout.tsx`: when `useMobileShell()` is true,
   render no sidebar and no hamburger; render the page content plus
   `<MobileTabBar />`. Keep the sticky top header but reduce it to the
   Alcan logo (existing `alcanLogo` import, `h-6`, same as today) left
   and a 10px uppercase "PRO MOVES" wordmark right (see prototype
   appbar). Keep `<PendingSurveysCard />` in the layout exactly where it
   is. When `useMobileShell()` is false, render exactly today's layout.
4. New route `/more`: a simple page (`src/pages/mobile/MorePage.tsx`)
   listing rows (52px min height, chevrons): My evaluations →
   `/my-role/evaluations`; Practice log → `/my-role/practice-log`;
   Profile → `/profile`; Sign out (calls `signOut()` from `useAuth`).
   For leads only (`isLead`): a "Your team" row → `/team`. Notifications
   row: omit (no backing feature yet).
5. Back affordances: every mobile-shell page that is not a tab root
   renders a back pill (the prototype's `.backlink` style: bordered
   pill, 44px, chevron + label) using `navigate(-1)`.

Acceptance: with the flag on at mobile viewport, tab bar renders and
navigates, no sidebar; with the flag off, mobile is unchanged; desktop
unchanged in both cases. No route dead-ends (every screen has a tab bar
or a back pill).

## C. Home, mobile order (ProMoves first, CTA beneath)

All changes conditional on `useMobileShell()`; desktop `Index.tsx`
rendering stays byte-identical.

1. In `src/pages/Index.tsx`, mobile order:
   (1) greeting block (date eyebrow + "Hi, {first name}"),
   (2) `<ThisWeekPanel />` (the primary card),
   (3) backfill alert (existing condition),
   (4) `<EvalReadyCard />`,
   (5) `<RecentWinBanner />`,
   (6) `<CurrentFocusCard />`,
   (7) lead cards `<LeadFocusHomeCard />` + `<LeadMeetingRequestCard />`,
   (8) deadline disclaimer (existing copy, unchanged).
   On mobile, wrap the lead focus card in a pressable that navigates to
   `/team` with a trailing chevron (leads only; section F).
2. In `src/components/home/ThisWeekPanel.tsx`, mobile layout only:
   the week's move list renders ABOVE the `buildWeekBanner` message and
   CTA button, inside the same card. Keep all existing state logic and
   banner copy from `src/v2/weekCta.ts` untouched.
3. Move list, mobile: cap at 4 rows with a "+N more" / "Show less"
   text expander; each row is domain spine (8px wide, FULL-strength
   domain color via `getDomainColorRich`, not pastel) + action statement
   (13px) + the existing `ConfPerfDelta`. In `ConfPerfDelta`, when only
   one score exists, keep the arrow slot's width reserved (render an
   empty fixed-width span) so CONF/PERF columns never go ragged.
4. Hero emphasis states, mobile: when the state is `can_checkin` or
   `can_checkout`, give the card a 2px `--primary` border. When
   `missed_checkin`/`missed_checkout`, use `--status-late-bg` card tint.
   `done` uses `--status-complete-bg` tint. Never use the late-amber for
   an on-time state.
5. Type hierarchy: the state heading inside the card ("Check-in" etc.)
   at 17px/650; card reference headings stay 15px/600.

Acceptance: all five week states verified via the sim tools (or by
noting which states could not be exercised); lead cards at the bottom;
desktop Index unchanged.

## D. Ritual polish (wizards)

These apply on all viewports (they are safe enhancements), but verify on
mobile. Do not change what gets written to `weekly_scores`.

1. **Persistence:** in `ConfidenceWizard.tsx` and `PerformanceWizard.tsx`,
   move in-progress draft persistence from `sessionStorage` to
   `localStorage`, keyed exactly as today plus user id and `week_of`
   (verify the existing key already includes user+week; if so, only the
   storage object changes). Clear the draft on successful submission
   (existing behavior).
2. **Truth state:** surface `useReliableSubmission`'s pending state on
   the submit/Next control: label shifts among "Saving…", "Saved", and
   "Will retry" (existing retry logic; display only).
3. **Scale ergonomics:** the 1-4 buttons get `aria-label` composed of
   the number + the existing tooltip copy from `NumberScale.tsx`; add an
   `:active` scale-down (0.94) transition; fix the hint/tooltip area to
   a constant height (~52px) so the Next button never shifts mid-tap.
4. Respect `prefers-reduced-motion` for any transition added.

Acceptance: kill the app (or hard-close the tab) mid-check-in, reopen,
land on the same step with scores intact; submit while offline and see
"Will retry".

## E. The Performance tab (new page)

New route `/performance` → `src/pages/performance/PerformancePage.tsx`.
Reachable from the tab bar (mobile); on desktop this route may render the
same page in the content area (no nav entry added on desktop). Section
order and content per prototype v6:

1. **Focus hero** (`--win-growth-bg` tinted card):
   - Data: newest released+visible evaluation for the signed-in staff
     (same query pattern as `EvalReadyCard`/`RoleRadar`:
     `get_evaluations_summary` + `is_visible_to_staff`), then
     `staff_quarter_focus` rows for that evaluation joined to
     `pro_moves` for the action statement.
   - Chosen state: eyebrow "Your focus this quarter"; the move's
     `action_statement` at 17px/650; sub "You chose this from your
     {period} evaluation."; then a callout block labeled
     "{evaluator first name}'s next step" whose body is
     `evaluation_items.observer_grow` for the evaluation item whose
     `competency_id` equals the focus move's `pro_moves.competency_id`.
     Fallback chain: if that grow is null, use
     `evaluations.evaluator_note`; if both null, omit the callout
     entirely (never render an empty shell). Then a quiet button
     "Learning resources for this move" that deep-links to
     `/my-role/domain/{domainSlug}` for the move's domain.
   - No-focus state (evaluation exists, no `staff_quarter_focus` rows):
     heading "No focus chosen yet from your {period} evaluation.", sub
     "Picking one gives the quarter a direction.", primary button
     "Choose your focus" → the eval review route via the existing
     `reviewPath()` helper in `src/lib/reviewRoute.ts`.
   - New-hire state (no released evaluation at all): eyebrow "Getting
     started", heading "Your first evaluation comes at the end of the
     quarter.", sub "Until then, this page fills in with what you rate
     each week. Keep checking in and out." Sections 2 is hidden entirely
     in this state (not shown empty).
2. **Evaluation scores card** ("From your {period} evaluation"):
   domain-level table, columns Domain | Coach | Self, values = per-domain
   averages of `observer_score` and `self_score` from that evaluation's
   items (1 decimal), rendered as score chips colored by the same
   bucketing as the prototype (`>=3.5` score-4, `>=2.5` score-3,
   `>=1.5` score-2, else score-1, using the `--score-*-bg`/`-ink`
   tokens). Footnote (verbatim, existing string): "Your self-score is the
   average performance score you submitted during this quarter." Two
   quiet buttons: "View full evaluation" → `/evaluation/{id}`, and
   "All evaluations" → `/my-role/evaluations`.
3. **Confidence + still building** (one card):
   - Header "Confidence" with a 3-button window toggle: `3w` / `6w` /
     `Quarter` (44px targets, default Quarter). One shared window state
     for both halves of the card.
   - Top half: four rows (fixed order Clinical, Clerical, Cultural, Case
     Acceptance from `DOMAIN_ORDER` in
     `src/lib/content/roleDefinitions.ts`): full-strength domain spine,
     name, and ONE numeric chip = the mean of the user's
     `confidence_score` within the window, score-bucket colored. Data:
     `useMyWeeklyScores`/`get_staff_all_weekly_scores` rows filtered by
     `week_of >= today - window`, mapped to domains via `domain_name`
     already present on the RPC rows. **No sparklines, no trend charts**
     (deliberate decision; do not add them).
   - Bottom half after a divider: heading "Moves you're still building",
     sub "Rated 1 or 2 in this stretch. Tap one for its learning
     resources." Rows = the same RPC rows with `confidence_score <= 2`
     in the window, newest week first then lowest score (same sort as
     `StaffPriorityFocusTab.tsx`), each: domain spine, `action_statement`,
     "Week of {MMM d}" meta, the score as a chip, chevron; tap navigates
     to `/my-role/domain/{domainSlug}`. Empty state (verbatim): "Nothing
     rated low in this stretch. Nice work."
4. **Participation card:** reuse `OnTimeRateWidget` (it takes a staffId;
   pass the user's own). Below it a quiet "All weeks" button →
   `/my-role/practice-log`.

Acceptance: renders correctly in chosen-focus, no-focus, and new-hire
states (exercise via sim tools or document which were verified); every
number traces to the stated source; no chart of any kind on the page.

## F. Team surface (leads)

Access: `allowCoachSurface` already includes `isLead`, so leads can read
coach-surface data today; this build adds a mobile-appropriate surface,
not new permissions. Gate both routes with `RequireAccess` using a new
`allowTeam = (r) => r.isLead || allowCoachSurface(r)` (effectively the
same set; define it for clarity).

1. **Roster** `/team` → `src/pages/team/TeamPage.tsx`:
   - Scope: staff at the lead's own `primary_location_id` with
     `is_participant = true`, excluding the lead themself.
   - Header: location name eyebrow, "Your team" h1.
   - Summary card: "{n} of {m} checked in" for the current week +
     one line "Check-out is due {meeting day}." derived from the
     location's existing submission gates
     (`getLocationSubmissionGates` in `src/lib/submissionStatus.ts`).
   - One row per teammate (56px min): name + role, a single status pill,
     chevron. Pill derivation for the current week from their
     `weekly_scores` (same completeness logic as
     `useMyWeeklyScores`'s summary): no confidence submitted → "Missing"
     (`--status-missing` tokens); confidence in but performance out →
     "Open" (`--status-late` tokens); both in → "In"
     (`--status-complete` tokens).
   - Entry points: the Home lead focus card (section C) and the More row
     (section B). No new tab.
2. **Staff detail** `/team/:staffId` →
   `src/pages/team/TeamStaffPage.tsx`, composition (no focus hero):
   (1) name h1 + this-week status pill,
   (2) Participation: `OnTimeRateWidget` for that staffId,
   (3) Latest evaluation: the same domain-level Coach vs Self table as
   section E.2, built from that staff member's newest released
   evaluation, plus "View full evaluation" → `/evaluation/{id}` (the
   viewer already allows coach/admin access; verify a lead can open it —
   if `EvaluationViewer`'s access check denies leads, extend its
   allow-list to `isLead` for staff at their location rather than
   working around it),
   (4) the same Confidence + still-building card as E.3 but sourced from
   `useStaffAllWeeklyScores(staffId)` and with copy subject "Their"
   (see Copy appendix).
   Reuse the E.3 card as a shared component
   (`src/components/performance/ConfidenceCard.tsx`) with props
   `{ staffId, subject: 'you' | 'them' }` rather than duplicating it.

Acceptance: as a lead (Testing Tester is `is_lead = true`), roster shows
only same-location participants with correct pills; a non-lead
participant navigating to `/team` is redirected; the coach dashboard is
untouched.

## G. My Role, mobile polish only

The existing flow (RoleRadar spine cards → DomainDetail →
CompetencyAccordion → ProMoveRow → LearnerLearnDrawer) is the design of
record. Do not restructure it. Mobile-shell adjustments only:

1. Touch targets: accordion headers and `ProMoveRow` at 44px+ with
   `:active` feedback (ProMoveRow currently relies on hover states).
2. `LearnerLearnDrawer` already renders full-width `h-[100dvh]` on
   mobile; keep it. Verify the audio player is usable at 375px width.
3. RoleRadar footnote copy change (Copy appendix).
4. Domain names and colors keep coming from live data
   (`domains.domain_name` via existing hooks) — nothing hardcoded.

## H. Evaluations list access

`/my-role/evaluations` (`StatsEvaluations`) already lists evaluations.
Ensure it is reachable from: the More page (B.4), the Performance page
(E.2 "All evaluations"), and that on mobile it shows a back pill. No
other changes.

---

## Copy appendix (use verbatim; John may revise later)

- Performance page eyebrow: `How you're doing`
- Focus hero eyebrow: `Your focus this quarter`
- Focus sub: `You chose this from your {period} evaluation.`
- Next-step callout label: `{evaluator first name}'s next step`
- No-focus heading: `No focus chosen yet from your {period} evaluation.`
- No-focus sub: `Picking one gives the quarter a direction.`
- No-focus button: `Choose your focus`
- New-hire heading: `Your first evaluation comes at the end of the quarter.`
- New-hire sub: `Until then, this page fills in with what you rate each week. Keep checking in and out.`
- Eval card title: `From your {period} evaluation`
- Still-building heading (self): `Moves you're still building`
- Still-building heading (lead view): `Moves they're still building`
- Still-building sub: `Rated 1 or 2 in this stretch. Tap one for its learning resources.`
- Still-building empty state: `Nothing rated low in this stretch. Nice work.`
- Team summary line: `Check-out is due {day}, the day of your meeting.`
- Team footnote: `Tap a teammate to see how their quarter is going.`
- RoleRadar footnote: `Averages from your {period} evaluation.`
- More page team row sub: `{location name} · {n} teammates`

Strings that must come from existing code, unmodified: everything in
`src/v2/weekCta.ts`, `NumberScale.tsx` tooltips, `RecentWinBanner.tsx`,
`PendingSurveysCard.tsx`, the home deadline disclaimer in `Index.tsx`,
and the self-score explainer in `EvaluationViewer.tsx`.

## Build sequence

0. Step 0 sync → A tokens → B shell → C home → G my-role polish →
   H evals access → D ritual → E performance → F team.
   (E before F because F reuses E's `ConfidenceCard`.)

## Final verification (before reporting done)

1. `npm run build` green; `dist/sw.js` + `dist/manifest.webmanifest`
   emitted.
2. Desktop: `/`, `/my-role`, `/coach`, `/admin` visually unchanged
   (spot-check screenshots).
3. Mobile viewport WITHOUT flag: unchanged current experience.
4. Mobile viewport WITH `localStorage.pwa_v1='on'`: walk Home (all
   reachable week states), My Role drill to a Study drawer, Performance
   (all three hero states you can reach), More, and, if lead data is
   reachable, `/team` and one staff detail. No dead ends, no horizontal
   scroll, dark mode legible.
5. Do not push. Report: sections completed, states you could not
   exercise, any TODOs left (rule 3), and any merge-conflict decisions
   made in Step 0.

## Explicitly out of scope

Push notifications (Phase 5), the Ask tab, sparklines or any trend
charts, Inbox, coach dashboard changes, eval capture/review changes, the
glow/grow intake change (the fallback chain in E.1 handles today's
data), app icon art, and any DB migration.
