# Token migration pattern (DSN-3)

How to move a hardcoded Tailwind palette class (`bg-emerald-100`,
`text-red-800`, `border-blue-200`, ...) onto the app's design tokens, without
turning it into find-and-replace. Written after slice 1 (Button, Index.tsx,
EvaluationHub.tsx) so the remaining ~700 instances are mechanical for
whoever picks up the next slice.

This is not a find-and-replace job. Two files can use the exact same
hardcoded hex and mean different things (one "this is done", one "this is
the brand"), and some call sites were hand-patched with a `dark:` variant
that a naive regex swap would silently drop. Read the surrounding code
before changing a class.

## 1. The decision tree

For every hardcoded color class, ask in this order:

1. **Is it standing in for one of the four locked semantic scales?**
   - Domain (clinical/clerical/cultural/case-acceptance) → `getDomainColor()`
     / `getDomainColorRich()` from `src/lib/domainColors.ts`, or the
     `bg-domain-*` Tailwind utilities.
   - A 1-4 confidence/performance score → `--score-1` through `--score-4`
     (plus `-bg` variants). No `bg-score-N`/`text-score-N` Tailwind
     utilities exist yet, so consume these via inline `style`
     (`{ color: 'hsl(var(--score-2))' }`), the same way
     `CompetencyAccordion.tsx` and `DomainDetail.tsx` already do.
   - A submission/eval/delivery status (complete, missing, late, excused,
     pending, draft, released, ...) → `<StatusBadge />` if it's rendering a
     pill at all; otherwise the raw `--status-*` tokens via inline style,
     same pattern as above.
   - A win banner → `--win-growth` / `--win-perfect` (+ `-bg`/`-border`).
   - **Do not invent a new semantic scale for this slice.** If nothing fits
     (see the "genuinely unmapped" case below), pick the nearest existing
     token and say so in the PR, rather than adding a fifth scale.

2. **Is it brand chrome** (primary actions, the wordmark, header/nav
   accents, links, focus rings)? → the `brand.*` Tailwind colors
   (`brand-navy`, `brand-blue`, `brand-signal`, `brand-bone`,
   `brand-charcoal`, `brand-gray`) or, for anything that should track
   `--primary` generally (most buttons, most brand-tinted text), the
   shadcn `primary`/`primary-foreground` tokens instead of a brand color
   directly — `primary` already *is* brand navy (see
   `src/index.css`), so preferring it over a hardcoded `brand-navy` keeps
   the door open for a future re-theme without touching every call site.

3. **Is it generic UI chrome** (borders, muted backgrounds, secondary
   surfaces) with no color-specific meaning? → the shadcn tokens already in
   `tailwind.config.ts`: `border`, `muted`, `muted-foreground`, `accent`,
   `secondary`, `card`, etc.

4. **Is it genuinely decorative** — the color doesn't communicate state,
   brand, or hierarchy, it's just a color someone picked? → leave it and
   say so in the PR description. Don't force a decorative choice into a
   semantic token just to make the guard's count go down; that makes the
   token vocabulary lie about what it means. (Slice 1 didn't find any of
   these in its three files — every hardcoded color it touched turned out
   to mean something.)

5. **Genuinely unmapped semantic case** (it clearly means something, but
   none of the four locked scales or the brand/chrome layers fit): pick
   the nearest existing token, document the substitution inline as a code
   comment, and flag it in the PR so a future ticket can decide whether it
   deserves its own token. Slice 1 hit exactly one of these — see
   `src/pages/Index.tsx`'s backfill-access alert, mapped onto
   `brand-signal`/`brand-navy`/`brand-blue` as an "info banner" convention
   because no `--status-info` token exists yet. Don't add that token
   yourself in a migration slice; that's a token-design decision, not a
   migration.

## 2. Handling existing `dark:` pairs

Some hand-rolled classes already carry a `dark:` variant tuned for a dark
background (e.g. `text-orange-600 dark:text-orange-400`, a hair lighter in
dark mode for contrast). When the target token is **mode-invariant**
(most of `--status-*` and all of `--score-*` are — `src/index.css`'s
`.dark` block doesn't override them), you have two honest choices:

- **Normalize to the single token value**, dropping the `dark:` pair,
  *if* every other consumer of that same token already does this. This is
  what slice 1 did for `--status-late` and `--status-complete` in
  `EvaluationHub.tsx`: `StatusBadge.tsx` and every other status-token
  consumer in the app already use one flat value with no dark-mode
  tuning, so keeping this one call site's hand-patched exception would
  make it inconsistent with the component the rest of the app now shares.
  Say so explicitly in the PR (don't silently drop it) — this is a real
  design decision, not an oversight.
- **Preserve the distinction** if the token *does* have dark-mode-aware
  values already (e.g. `--destructive`, whose `.dark` block genuinely
  redefines it) — then a plain Tailwind utility class like `bg-destructive`
  already does the right thing in both modes with zero extra code, as in
  the recording-indicator dot in `EvaluationHub.tsx`.

Never just delete the `dark:` half of a pair without checking which of
these two cases you're in — that's the "blind delete" the DSN-3 ticket
specifically warns against.

When no Tailwind utility exists for the token (true for every `--score-*`
and `--status-*` value) but you still need a `:hover`/`:focus-visible`
variant, fall back to Tailwind's arbitrary-value syntax referencing the
CSS var directly — `border-[hsl(var(--status-late))]
focus-visible:ring-[hsl(var(--status-late))]` — rather than inline
`style`, since `style` can't express pseudo-classes. This is still a
token reference, not a hardcoded color, and the guard script does not
flag it.

## 3. The guard: `scripts/check-hardcoded-colors.mjs`

Counts every `bg-`/`text-`/`border-` class in `src/**/*.{ts,tsx}` that
names a raw Tailwind palette family (`slate`, `red`, `emerald`, `blue`,
...) with a numeric shade (`bg-emerald-100`, `text-red-800`,
`dark:border-blue-800`, opacity suffixes like `bg-blue-50/50` all count).
It does **not** flag token classes (`bg-primary`, `text-muted-foreground`,
`bg-brand-navy`, `bg-domain-clinical`) or non-color utilities that share
the prefix (`border-2`, `text-2xs`) — those aren't in the palette-family
list or aren't followed by a bare numeric shade.

- `npm run check:colors` (also runs as part of `npm run check`) compares
  the current count against `scripts/hardcoded-colors-baseline.json` and
  **fails if the count goes up**, printing exactly which files regressed
  and the offending class + line.
- When a migration lands and the count goes down, regenerate the baseline
  in the *same commit*:
  ```
  node scripts/check-hardcoded-colors.mjs --update-baseline
  ```
  Never bump the baseline to make a *failing* check pass without
  understanding why it increased — that's disabling the ratchet, not
  using it.
- The script is plain Node (`.mjs`, no new dependencies), lives outside
  `tsconfig.app.json`'s `include` and outside ESLint's `**/*.{ts,tsx}`
  file glob, so it doesn't need type-checking or linting itself.

## 4. What slice 1 migrated

| Surface | Before | After | Notes |
|---|---|---|---|
| `src/components/ui/button.tsx` | 0 (see below) | 0 | `default`/`outline`/`link` variants moved off the legacy `brand-600`/`brand-900`/`brand-50` numeric scale onto `primary`/`primary-foreground`. Not counted in the guard's totals either before or after — `brand` isn't a raw Tailwind palette family, so these were invisible to the regex-based count in both states. |
| `src/components/ProMovesLogo.tsx` | 0 (same reason) | 0 | `text-brand-600` → `text-primary`. |
| `src/pages/LandingPage.tsx` | 0 (same reason) | 0 | `text-brand-600` → `text-primary`. |
| `src/pages/Index.tsx` | 30 | 0 | Backfill-access alert (rendered twice, mobile shell + desktop) mapped to `brand-signal`/`brand-navy`/`brand-blue` — see the "genuinely unmapped" note above. |
| `src/pages/coach/EvaluationHub.tsx` | 23 | 0 | `SCORE_OPTIONS` (the 1-4 observer score pills) → `--score-1..4`; completion checkmarks/text → `--status-complete`; missing-notes warnings and the low-score note border → `--status-late`; recording-indicator dot → `bg-destructive` (paused) / `--status-late` (recording). |
| `src/components/dashboard/EvalCadenceWidget.tsx` | 0 | 0 | Already fully migrated by DSN-4 (commit `e9b6d41a`, on `main` before this slice started) — nothing left to do. The ticket's original "28 instances" estimate predates that work. |
| `tailwind.config.ts` | — | — | Removed the legacy `brand.50`/`brand.600`/`brand.900` numeric keys — zero consumers remained after the above. Left `slatebrand.400`/`slatebrand.600` alone (also zero consumers, but out of this ticket's named scope — worth a small separate cleanup ticket). |

Baseline: 808 → 755 → 775 hardcoded classes across `src/`. The drop to 755
is exactly the 30 + 23 from `Index.tsx` and `EvaluationHub.tsx` (the
Button/logo/landing changes don't move this number since `brand-*` was
never counted). The rise to 775 is not new debt: QA found the guard's
original regex only watched `bg-`/`text-`/`border-`, so its prefix list was
widened (ring, gradient from/to/via, fill, stroke, divide, outline, shadow,
placeholder, caret, accent, decoration) and the baseline re-cut to count
the 20 pre-existing instances those shapes were hiding.

## 5. What slice 2 migrated

Baseline: 775 → 556 (219 instances, 10 files). Target surfaces were coach
dashboard / staff detail / recommender-adjacent (doctor pro-move materials)
screens, picked from slice 1's highest-count list.

| Surface | Before | After | Notes |
|---|---|---|---|
| `src/components/clinical/ClinicalBaselineResults.tsx` | 28 | 0 | "In Progress"/"Complete" header treatment → `StatusBadge` (`in_progress`/`completed`) + `--status-late`/`--status-complete` for the icon box and gradient; discrepancy-flag ring → `--status-late`. |
| `src/components/dashboard/LocationSkillGaps.tsx` | 24 | 0 | Confidence-average badges and domain chips used a red/amber/green traffic light on `avg_confidence` — replaced with `scoreBucket()`/`scoreBucketTokens()` from `src/lib/confidenceScoreRamp.ts` (the DASH-1a rule: confidence scores use the 1-4 score ramp, never a traffic light). Same fix applied to `StaffOverviewTab.tsx`, `StaffDetailV2.tsx`'s domain strip, and `StaffPriorityFocusTab.tsx`'s confidence badge — all four had independently reinvented the same traffic-light anti-pattern. |
| `src/components/coach/StaffOverviewTab.tsx` | 15 | 0 | Same confidence-traffic-light fix as above. |
| `src/pages/coach/StaffDetailV2.tsx` | 15 | 0 | Domain confidence strip → score ramp (as above); "Exempt" week badge → `--status-excused` tokens (was hardcoded amber; excused/exempt already has a dedicated, intentionally-neutral token). |
| `src/lib/coachingSessionStatus.ts` | 24 | 16 | 5 of 7 pipeline stages → `--status-late` (amber "attention" reuse) / `--status-complete`. `scheduling_invite_sent` (sky) and `meeting_pending` (purple) left hardcoded — see §6. |
| `src/components/coach/RecordingStartCard.tsx` | 23 | 0 | Recording/paused/processed states → `bg-destructive`/`text-destructive` (recording, dark-mode-aware token per §2) and `--status-late`/`--status-complete` (paused/processed), matching the established recording-dot convention in `EvaluationHub.tsx`. |
| `src/components/coach/RecordingProcessCard.tsx` | 14 | 0 | Same paused/attention amber → `--status-late`. |
| `src/components/clinical/CoachBaselineWizard.tsx` | 20 | 0 | `SCORE_CONFIG` (1-4 rating buttons) → `--score-1..4`/`-bg`; "Complete" pill, co-editor "Edited by" flag, "Notes mapped" confirmation → `--status-complete`/`--status-late`; recording pulse dot → `bg-destructive`. |
| `src/components/doctor/DoctorProMoveDrawer.tsx` | 24 | 6 | `MATERIAL_SECTIONS`: "Why It Matters" → `--status-late`, "Scripting" → `--status-released`, "What Good Looks Like" → `--status-complete`. "Gut Check Questions" (purple) left hardcoded — see §6. Kept in sync with the identical config duplicated in `DoctorMaterialsSheet.tsx`. |
| `src/components/doctor/DoctorMaterialsSheet.tsx` | 24 | 6 | Same `MATERIAL_SECTIONS` fix, same purple gap. |
| `src/components/doctor/RatingBandCollapsible.tsx` | 24 | 0 | 1-4 self-rating bands → `--score-1..4`/`-bg` (DASH-1a: band 1 shifts from hardcoded red to `--score-1`'s orange — a real, intentional hue shift, not a bug — see §6). |
| `src/components/coach/StaffPriorityFocusTab.tsx` | 9 | 1 | Confidence badge (1 or 2) → `scoreBucketTokens(scoreBucket(...))`. One `dark:bg-slate-800` card-surface class left hardcoded (decorative glass-card pattern, see §6). |

## 6. Remaining unmigrated surfaces (post slice-2 baseline)

80 files still carry at least one hardcoded palette class, 556 instances
total. `OnTimeRateWidget.tsx` and `LocationSubmissionWidget.tsx` (30 each)
remain out of scope (Command Center / `RegionalDashboard`, owned by DASH
tickets).

Highest-count remaining files, for whoever scopes the next slice:

| File | Count |
|---|---|
| `src/components/coach/OnTimeRateWidget.tsx` | 30 (dashboard, excluded) |
| `src/components/dashboard/LocationSubmissionWidget.tsx` | 30 (dashboard, excluded) |
| `src/components/admin/EditUserDrawer.tsx` | 26 |
| `src/components/home/ThisWeekPanel.tsx` | 25 (see §6 — mostly the decorative glass-border pattern plus the unmapped amber notice banner) |
| `src/pages/doctor/DoctorReviewPrep.tsx` | 22 (shares the blue "backfill" info-banner pattern with `EditUserDrawer.tsx` — do them together, see the `--status-info` gap below) |
| `src/components/admin/ProMoveList.tsx` | 19 |
| `src/pages/doctor/DoctorHome.tsx` | 17 |
| `src/components/doctor/DomainAssessmentStep.tsx` | 16 |
| `src/lib/constants/domains.ts` | 16 |
| `src/pages/EvaluationViewer.tsx` | 16 |
| ... 70 more files, 1-13 instances each | see `scripts/hardcoded-colors-baseline.json` for the full per-file list |

Run `node scripts/check-hardcoded-colors.mjs --update-baseline` after any
future migration slice lands to see the current full list and confirm the
new total.

## 7. Ambiguous items left for follow-up (not fixed here, flagged instead)

- **`--status-info`-shaped gap.** The blue "informational notice" pattern
  (`border-blue-200 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-950/20`
  + matching text/button treatment) appears in at least three files
  (`Index.tsx`, migrated in slice 1; `EditUserDrawer.tsx` and
  `DoctorReviewPrep.tsx`, still not migrated). It doesn't cleanly fit
  domain, score, status, or win, and isn't decorative either. A real
  `--status-info` (or `--info-*`) token pair, with light and dark values
  chosen on purpose, would be a cleaner fix than more ad hoc brand-token
  mappings. Candidate for a DSN-5d or DSN-3 slice-3 follow-up.
- **Amber "notice" banners (distinct from the info-banner gap above).**
  `ThisWeekPanel.tsx`'s paused-account and exempt-week banners, and the
  identical pattern in `WeekBuilderPanel.tsx` / `DoctorReviewPrep.tsx`, use
  `bg-amber-50 border-amber-200` + amber text as a general "heads up,
  nothing to do" notice — not a status pill, a whole banner. Mapping it to
  `--status-excused` (the closest semantic match — "no penalty this week")
  would flip the banner from amber to neutral gray, a bigger visual change
  than a like-for-like migration should make unilaterally. Left hardcoded
  and flagged rather than guessed at; worth deciding alongside the
  `--status-info` gap above since both are "banner, not pill" cases.
- **Pipeline stages with no matching token (sky, purple).**
  `coachingSessionStatus.ts`'s `scheduling_invite_sent` (sky) and
  `meeting_pending` (purple), and `MATERIAL_SECTIONS`'s "Gut Check
  Questions" (purple, duplicated in `DoctorProMoveDrawer.tsx` and
  `DoctorMaterialsSheet.tsx`) each need a hue with no existing token.
  Collapsing them onto an already-used token (e.g. `--status-released` for
  both "Scripting" and "Gut Check Questions") would make two visually
  distinct categories indistinguishable, which defeats the point of the
  color coding. Left hardcoded rather than guessed at. If a future ticket
  adds more non-alarm hues to the token set, these are the two consumers
  waiting for them.
- **Score band 1 hue shift (flag for visual QA, not a gap).**
  `RatingBandCollapsible.tsx` and `LocationSkillGaps.tsx` /
  `StaffOverviewTab.tsx` / `StaffDetailV2.tsx` / `StaffPriorityFocusTab.tsx`
  previously rendered the lowest confidence tier in red; the `--score-1`
  token (and the DASH-1a score ramp generally) is orange, not red, by
  deliberate design ("confidence scores never render red"). This is a
  precedented, intentional choice, not an oversight, but it is a visible
  hue change worth a screenshot check.
- **Decorative "glass card" border/surface pattern, unmigrated.**
  `border-white/40 dark:border-slate-700/40` (+ `bg-white/X
  dark:bg-slate-800/X`) is a consistent frosted-glass treatment repeated
  across at least 7 files (`ThisWeekPanel.tsx`, `ConfidenceWizard.tsx`,
  `PerformanceWizard.tsx`, `MyRoleLayout.tsx`, `FacilitatePage.tsx`,
  `card.tsx`, `StaffPriorityFocusTab.tsx`). It's decorative chrome, not one
  of the four locked scales (§1.4), so this slice left it alone rather than
  forcing it onto `border`/`card` tokens that would look flatter. If it's
  going to be tokenized, it deserves its own `--glass-border`/`--glass-bg`
  pair rather than folding into generic shadcn chrome tokens — a decision
  for whoever scopes that ticket, not this migration.
- **`slatebrand.400`/`slatebrand.600`** in `tailwind.config.ts` has zero
  consumers in `src/`, same as the `brand.50/600/900` keys slice 1 removed.
  Still out of this ticket's named scope — worth a one-line cleanup ticket.
