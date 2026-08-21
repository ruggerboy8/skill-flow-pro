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

Baseline: 775 → 549 (226 instances, 11 files, after QA fixes below). Target
surfaces were coach dashboard / staff detail / recommender-adjacent (doctor
pro-move materials) screens, picked from slice 1's highest-count list.

**Post-QA correction:** the table below was originally published with two
wrong "After" counts (`RecordingProcessCard.tsx` claimed 0 with 4 remaining;
`coachingSessionStatus.ts` claimed 16 with the true figure at 8 even before
the QA pass). Both are corrected below and verified against
`scripts/hardcoded-colors-baseline.json`. See §7 for the full QA-fix list,
including a `ClinicalBaselineResults.tsx` fix that was invisible to the
ratchet (a raw `hsl()` literal map, not a Tailwind class) and so doesn't
move this file's row below, and `ScoreHistoryV2.tsx`, added as a new row
for a same-semantic-different-color fix (finding 6).

| Surface | Before | After | Notes |
|---|---|---|---|
| `src/components/clinical/ClinicalBaselineResults.tsx` | 28 | 0 | "In Progress"/"Complete" header treatment → `StatusBadge` (`in_progress`/`completed`) + `--status-late`/`--status-complete` for the icon box and gradient; discrepancy-flag ring → `--status-late`. |
| `src/components/dashboard/LocationSkillGaps.tsx` | 24 | 0 | Confidence-average badges and domain chips used a red/amber/green traffic light on `avg_confidence` — replaced with `scoreBucket()`/`scoreBucketTokens()` from `src/lib/confidenceScoreRamp.ts` (the DASH-1a rule: confidence scores use the 1-4 score ramp, never a traffic light). Same fix applied to `StaffOverviewTab.tsx`, `StaffDetailV2.tsx`'s domain strip, and `StaffPriorityFocusTab.tsx`'s confidence badge — all four had independently reinvented the same traffic-light anti-pattern. |
| `src/components/coach/StaffOverviewTab.tsx` | 15 | 0 | Same confidence-traffic-light fix as above. |
| `src/pages/coach/StaffDetailV2.tsx` | 15 | 0 | Domain confidence strip → score ramp (as above); "Exempt" week badge → `--status-excused` tokens (was hardcoded amber; excused/exempt already has a dedicated, intentionally-neutral token). |
| `src/lib/coachingSessionStatus.ts` | 24 | 8 | 5 of 7 pipeline stages → tokens. `director_prep_ready`/`doctor_revision_requested` → `--status-late` (amber "attention" reuse); `doctor_confirmed` → `--status-complete`; `doctor_prep_submitted` → `--status-pending` (QA fix — originally also `--status-complete`, which made an in-flight stage wear the "done" color identically to the terminal stage; see §7). `scheduling_invite_sent` (sky) and `meeting_pending` (purple) left hardcoded — see §7. |
| `src/components/coach/RecordingStartCard.tsx` | 23 | 0 | Recording/paused/processed states → `--status-missing` (recording — QA fix, was `bg-destructive`/`text-destructive`; see §7 finding 5), `--status-late` (paused), `--status-complete` (processed). |
| `src/components/coach/RecordingProcessCard.tsx` | 14 | 0 | Paused/attention amber → `--status-late` (QA fix: a second, differently-ordered instance of the same class string at the "restored recording" card was missed in the original pass and is now also migrated; see §7). |
| `src/components/clinical/CoachBaselineWizard.tsx` | 20 | 0 | `SCORE_CONFIG` (1-4 rating buttons) → `--score-1..4`/`-bg`; "Complete" pill, co-editor "Edited by" flag, "Notes mapped" confirmation → `--status-complete`/`--status-late`; recording pulse dot → `bg-destructive` (a solid filled dot, not text-on-tint, so the §7 finding-5 contrast issue doesn't apply here). |
| `src/components/doctor/DoctorProMoveDrawer.tsx` | 24 | 6 | `MATERIAL_SECTIONS`: "Why It Matters" → `--status-late`, "Scripting" → `--status-released`, "What Good Looks Like" → `--status-complete`. "Gut Check Questions" (purple) left hardcoded — see §7. Kept in sync with the identical config duplicated in `DoctorMaterialsSheet.tsx`. |
| `src/components/doctor/DoctorMaterialsSheet.tsx` | 24 | 6 | Same `MATERIAL_SECTIONS` fix, same purple gap. |
| `src/components/doctor/RatingBandCollapsible.tsx` | 24 | 0 | 1-4 self-rating bands → `--score-1..4`/`-bg` (DASH-1a: band 1 shifts from hardcoded red to `--score-1`'s orange — a real, intentional hue shift, not a bug — see §7). |
| `src/components/coach/StaffPriorityFocusTab.tsx` | 9 | 1 | Confidence badge (1 or 2) → `scoreBucketTokens(scoreBucket(...))`. One `dark:bg-slate-800` card-surface class left hardcoded (decorative glass-card pattern, see §7). |
| `src/components/my-role/ScoreHistoryV2.tsx` | 9 | 6 | QA fix (finding 6): staff-facing "Exempt" week badge (3 instances) was hardcoded amber while the coach-facing equivalent in `StaffDetailV2.tsx` already used `--status-excused` (gray) — same semantic state, two colors. Migrated to match. The remaining 6 are an unrelated blue "backfill" button, untouched and out of scope for this finding. |

## 5a. New token: `--status-info`

Slice 2 flagged a blue "informational notice" pattern
(`border-blue-200 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-950/20` +
matching text) with no token, appearing in `EditUserDrawer.tsx` and
`DoctorReviewPrep.tsx`. Slice 3 added `--status-info` / `--status-info-bg`
in `src/index.css`, same structure as every other `--status-*` pair
(mode-invariant, no `.dark` override — matches the sibling tokens, not an
invented design decision):

```css
--status-info: 221 83% 53%;
--status-info-bg: 214 100% 97%;
```

These are a direct HSL conversion of Tailwind's own `blue-600` (`#2563eb`)
and `blue-50` (`#eff6ff`) — the exact hex already in use at every call site
this token replaces, not a new color choice. No Tailwind utility class was
added (consistent with every other `--status-*`/`--score-*` token); consume
via `text-[hsl(var(--status-info))]` / `bg-[hsl(var(--status-info-bg))]` or
inline `style`. Also reused (beyond the original blue-banner gap) for the
"this row already exists and will be updated" case in row-outcome tag
schemes (`ProMoveImportDialog.tsx`, `BulkUpload.tsx`) — see §8's row-outcome
note below for why that reuse, not a new "update" token, was the right call.

## 5b. What slice 3 migrated

Baseline: 549 → 384 (165 instances, 12 files with real migrations, plus one
file — `AdminPage.tsx` — deliberately left untouched with a contrast finding
recorded in §8). Target surfaces: slice 2's deferred list
(`EditUserDrawer.tsx`, `ProMoveList.tsx`, `DoctorReviewPrep.tsx`) plus the
next-highest-count remaining files from slice 2's §6 list.

| Surface | Before | After | Notes |
|---|---|---|---|
| `src/pages/doctor/DoctorReviewPrep.tsx` | 22 | 2 | `PROGRESS_OPTIONS` → `--status-complete`/`--status-late` (kept in sync with the identical config in `CombinedPrepView.tsx`); `SCORE_COLORS` (1-4 self-score circle) → `--score-1..4`, solid-fill so no `-ink` needed; "Prep Complete" badge → `--status-complete`; the Step 0 prior-action-steps card + circle → `--status-late`; the coach's-pick badge → `--status-late`; the Step 4 scheduling card → the new `--status-info`. The "Awaiting Your Confirmation" purple badge (2) is left hardcoded — same no-matching-token gap as `coachingSessionStatus.ts`'s `meeting_pending` from slice 2. |
| `src/components/clinical/CombinedPrepView.tsx` | 2 | 0 | Same `PROGRESS_OPTIONS`/`STATUS_CONFIG` fix as `DoctorReviewPrep.tsx` (duplicated config, kept in sync — same pattern as slice 2's `DoctorProMoveDrawer`/`DoctorMaterialsSheet`). |
| `src/components/admin/EditUserDrawer.tsx` | 26 | 19 | The "Backfill" section is the exact blue info-banner gap this file was named for in slice 2 — migrated to the new `--status-info`. The Clinical Director (teal) / Regional Manager (amber) role badges, the "Pause Account" amber notice banner, and the Doctor Portal / Clinical Director Access decorative section accents (teal/indigo) are left hardcoded — see §8. |
| `src/components/admin/ProMoveList.tsx` | 19 | 12 | Curriculum-priority badge (high/medium/muted) → `--status-complete`/`--status-late`; the retirement-warning `AlertTriangle` icon and its follow-up text → `--status-late`. The video/script/audio/link material-type icon chips (12) are left hardcoded — see §8. |
| `src/lib/doctorStatus.ts` | 10 | 0 | All five `DoctorJourneyStatus` stages that render a `colorClass` → tokens. `baseline_in_progress` → `--status-late` (matches `TrackStatus.in_progress`'s existing convention exactly); `baseline_submitted` → `--status-complete`; `coach_baseline_pending`/`ready_for_prep`/`baseline_released` → `--status-released` (blue reuse — "waiting on the next actor," the same reuse pattern already used for `--status-late` elsewhere in this doc). |
| `src/types/evalMetricsV2.ts` | 12 | 0 | `getTopBoxColor`/`getTopBoxBg`/`getMismatchColor`/`getMismatchBg` → `--status-complete`/`--status-late`/`--status-missing`. These are org/location EVALUATION-QUALITY metrics (top-box rate, observer/self mismatch), not a 1-4 confidence self-rating, so the DASH-1a "never render red" rule does not apply — a low top-box rate is a real problem worth flagging red. Thresholds unchanged, recolor only. |
| `src/pages/doctor/DoctorHome.tsx` | 17 | 5 | "Baseline Complete" and "Prep Submitted" cards → `--status-complete`. The pending-meeting-confirmation card (purple) is left hardcoded — same `meeting_pending` gap as above. |
| `src/pages/EvaluationViewer.tsx` | 16 | 2 | `ReadOnlyScore`'s hand-rolled `SCORE_PILLS` map replaced with `scoreBucketTokens()` — the same 1-4 observer/self score `EvaluationHub.tsx` already migrated in slice 1, now sharing one helper instead of a second hardcoded copy (band 1: red → orange, the same DASH-1a hue shift as `RatingBandCollapsible.tsx`). Note-source badge: "Self" (was slate) → `bg-muted`/`text-muted-foreground`; "Observer" (blue) left hardcoded as a source-attribution color with no domain/score/status/win meaning. |
| `src/components/doctor/DomainAssessmentStep.tsx` | 16 | 0 | `SCORE_COLORS` (1-4 self-rating buttons, doctor baseline) → `scoreBucketTokens()`, `-bg`+`-ink` for the selected fill/text (same pairing CoachBaselineWizard already uses) and vivid for the legend dot. **Real hue swap, not just a softer shade — see the "Behavior changes" section below.** |
| `src/components/platform/ProMoveImportDialog.tsx` | 10 | 0 | Row-outcome tags (new/update/error) → `--status-complete`/`--status-info`/`--status-missing`. Outline badges have no bg fill, so the vivid tokens are safe with no text-on-tint contrast concern. |
| `src/components/admin/BulkUpload.tsx` | 13 | 0 | Same row-outcome mapping as `ProMoveImportDialog.tsx` (an older, parallel CSV-upload flow with the identical new/update/error pattern). Also migrated its decorative gray dropzone border/text to `border-muted-foreground/30`/`text-muted-foreground` (generic UI chrome, not a status). |
| `src/components/admin/eval-results-v2/DomainDistributionRow.tsx` | 11 | 0 | 1-4 rating-distribution bar segments → `--score-1..4` (solid fill, band 1 red → orange); `getScoreColor()` (mean-score text) → `scoreBucketTokens(scoreBucket(...))`, replacing a hand-rolled `>=3.0`/`>=2.5` traffic light. **Real threshold/hue change — see "Behavior changes" below.** Per-segment hover-darken (no darker score-token shade exists) replaced with `hover:opacity-80`. |
| `src/components/admin/eval-results-v2/LocationDomainDistribution.tsx` | 11 | 0 | Identical fix to `DomainDistributionRow.tsx` above (duplicated distribution-bar component, kept in sync), plus the Obs/Self mean labels using the same `getScoreColor()`. |
| `src/pages/ConfidenceWizard.tsx` | 11 | 5 | The "done" submit-button state → `--status-complete`; the "Unsure? That's okay" intervention-modal icon box → `--status-late`. The glass-card `dark:bg-slate-*`/`dark:border-slate-700/40` classes (5) are the decorative pattern slice 2 already named this file for — left alone. |
| `src/pages/PerformanceWizard.tsx` | 9 | 3 | The "That's a Pro Move!" growth-celebration modal → `--win-growth`/`-bg` (a literal match for the token's documented purpose, and it already has real `.dark` overrides, so no `dark:` class was needed at all); the "done" submit-button state → `--status-complete`. Same glass-card gap (3) left alone. |
| `src/components/admin/StepBar.tsx` | 8 | 0 | Generic step-progress indicator: completed → `--status-complete` (solid fill); current → `primary`/`primary-foreground` (brand chrome — "the active step" is exactly the primary-action semantic, decision-tree bucket 2); upcoming/label text → `muted`/`muted-foreground` (already tokens). |

## 6. Remaining unmigrated surfaces (post slice-3 baseline)

70 files still carry at least one hardcoded palette class, 384 instances
total. `OnTimeRateWidget.tsx` and `LocationSubmissionWidget.tsx` (30 each)
remain out of scope (Command Center / `RegionalDashboard`, owned by DASH
tickets).

Highest-count remaining files, for whoever scopes the next slice:

| File | Count |
|---|---|
| `src/components/coach/OnTimeRateWidget.tsx` | 30 (dashboard, excluded) |
| `src/components/dashboard/LocationSubmissionWidget.tsx` | 30 (dashboard, excluded) |
| `src/components/home/ThisWeekPanel.tsx` | 25 (see §7 — mostly the decorative glass-border pattern plus the unmapped amber notice banner) |
| `src/components/admin/EditUserDrawer.tsx` | 19 (down from 26 in slice 3 — see §8; the remaining 19 are a role-tier badge color code and two decorative settings-section accents, left hardcoded on purpose) |
| `src/lib/constants/domains.ts` | 16 (the `DRIVER_LABELS` 4-category tag scheme — see §8, same "no matching token" reasoning as the purple pipeline-stage gap) |
| `src/components/clinical/DirectorPrepComposer.tsx` | 13 (excluded — owned by another agent tonight) |
| `src/components/admin/ProMoveList.tsx` | 12 (down from 19 in slice 3 — the remaining 12 are the video/script/audio/link material-type icon chips, see §8) |
| `src/components/home/ChristmasWelcome.tsx` | 12 (purely decorative seasonal banner gradient — considered and left alone, see §8) |
| `src/pages/AdminPage.tsx` | 10 (considered and left alone — real contrast finding, see §8) |
| `src/components/admin/SlotPreview.tsx` | 9 |
| ... 61 more files, 1-8 instances each | see `scripts/hardcoded-colors-baseline.json` for the full per-file list |

Run `node scripts/check-hardcoded-colors.mjs --update-baseline` after any
future migration slice lands to see the current full list and confirm the
new total.

## 7. Ambiguous items left for follow-up (not fixed here, flagged instead)

### ⚠️ Behavior changes, not just hue changes

Adopting `scoreBucket()`/`scoreBucketTokens()` (`src/lib/confidenceScoreRamp.ts`)
in `LocationSkillGaps.tsx`, `StaffOverviewTab.tsx`, and `StaffDetailV2.tsx`
was the right call — those three files (plus a second, inconsistent
threshold scheme inside `LocationSkillGaps.tsx` itself, see below) had each
independently hand-rolled a red/amber/green confidence traffic light with
slightly different cutoffs, and unifying them onto the canonical helper is
exactly what this migration is for. **But it is not a pure recolor.** The
canonical helper's tier boundaries do not line up with any of the ad hoc
versions it replaced, so some scores now land in a visibly different tier,
not just a different hex. Two concrete boundary changes:

1. **Low-tier cutoff moved from 2.5 to 2.0.** `StaffOverviewTab.tsx`,
   `StaffDetailV2.tsx`'s domain strip, and `LocationSkillGaps.tsx`'s domain
   chips all used `avg >= 2.5` as the red/amber line. `scoreBucket()` uses
   `avg < 2` for tier 1. **A domain averaging 2.3 confidence used to render
   in the red/lowest tier at those three call sites; it now renders in
   `--score-2` (amber), the "developing" tier, not the "needs attention"
   tier.** A coach scanning for the reddest cards will see fewer flagged
   than before for scores in the 2.0-2.4 range.
2. **The 3.0-3.9 band moved from green to blue.** Every one of the four
   files treated `avg >= 3.0` as "good" (green/emerald). `scoreBucket()`
   buckets `[3, 4)` into `--score-3`, whose hue is blue (211°), reserving
   green (`--score-4`, 160°) for a full 4.0. **A domain averaging 3.5 used
   to render green; it now renders blue.** Nothing between 3.0 and 3.9 will
   read as "green/done" anymore — only a perfect 4.0 average does.
3. **`LocationSkillGaps.tsx` also had two disagreeing schemes in the same
   file** — its per-move badge (`getConfidenceColor`, cutoffs 2.0/3.0)
   didn't match its domain chips (cutoffs 2.5/3.0), so the same 2.3 average
   could show red in one part of the card and amber in another. The
   unification also fixes that internal inconsistency, which is a genuine
   improvement, not just a side effect.

None of this is a bug in the migration — the DASH-1a score ramp is the
system of record and `confidenceScoreRamp.ts` is already tested — but it is
a real behavior change layered on top of a color-token change, and it
recategorizes what coaching staff visually read as "needs attention" at
several call sites. Flag it in QA/visual review specifically; don't assume
"same avg, different hex" the way most of this migration's other fixes are.

**Slice 3 additions to the same finding:**

4. **`DomainDistributionRow.tsx` and `LocationDomainDistribution.tsx`**
   (`getScoreColor()`, the eval-results-v2 domain-average label) had the
   exact same `>=3.0` green / `>=2.5` amber / else red scheme as the three
   files above, now on `scoreBucketTokens(scoreBucket(...))` — same two
   boundary changes (2.5→2.0 low-tier line, 3.0-3.9 green→blue) apply here
   too.
5. **`DomainAssessmentStep.tsx`'s `SCORE_COLORS` is a different kind of
   change: a hue SWAP, not a threshold shift.** This is a doctor
   self-rating scale (1 = worst, 4 = best), not a confidence average, so
   `scoreBucket()` doesn't apply — it's a direct 1:1 recolor onto
   `--score-1..4`. But the original tier order was **amber for 1, orange
   for 2** — the *opposite* of the DASH-1a ramp's **orange for 1 (`--score-1`),
   amber for 2 (`--score-2`)**. The migration doesn't just soften either
   color, it swaps which hue tier 1 vs tier 2 wears: a doctor who previously
   rated themselves "1 - I rarely do this" saw an amber button; they'll now
   see orange, and the tier that used to be orange (rating 2) is now amber.
   Tiers 3 (blue) and 4 (green/emerald) are unchanged in hue. Flag this
   specifically in visual QA — it reads as "the colors got shuffled," not
   just "got recolored."

- **`--status-info`-shaped gap — RESOLVED in slice 3.** See §5a above: the
  blue "informational notice" pattern
  (`border-blue-200 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-950/20`
  + matching text) is now `--status-info`/`-bg`, migrated at both remaining
  call sites (`EditUserDrawer.tsx`'s Backfill section,
  `DoctorReviewPrep.tsx`'s scheduling-confirmation card), matching
  `Index.tsx`'s slice-1 migration.
- **Amber "notice" banners (distinct from the info-banner gap above) —
  still open.** `ThisWeekPanel.tsx`'s paused-account and exempt-week
  banners, `EditUserDrawer.tsx`'s "Pause Account" section (considered again
  in slice 3, deliberately left alone — see §8), and the identical pattern
  in `WeekBuilderPanel.tsx` / `DoctorReviewPrep.tsx`, use
  `bg-amber-50 border-amber-200` + amber text as a general "heads up,
  nothing to do" notice — not a status pill, a whole banner. Mapping it to
  `--status-excused` (the closest semantic match — "no penalty this week")
  would flip the banner from amber to neutral gray, a bigger visual change
  than a like-for-like migration should make unilaterally. Left hardcoded
  and flagged rather than guessed at.
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
  waiting for them. **Slice 3 found two more `meeting_pending`-purple
  consumers of the same gap**: `DoctorReviewPrep.tsx`'s "Awaiting Your
  Confirmation" badge and `DoctorHome.tsx`'s pending-meeting-confirmation
  card — both left hardcoded for the same reason.
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

### QA-fix notes (post-publish corrections to this slice)

- **Ratchet-invisible hardcoded colors: check for raw `hsl()`/`rgb()`
  literals, not just Tailwind classes, in any file you touch.**
  `ClinicalBaselineResults.tsx`'s `SCORE_COLORS` map used raw `hsl(0 70%
  95%)`-style literals (not Tailwind classes) for its band-1 color, so it
  read as "red" in the UI but was completely invisible to the ratchet
  script (which only counts Tailwind palette classes) — even though this
  slice edited the same file's ratchet-visible classes. Migrated to
  `--score-1..4`/`-bg`/`-ink` (band 1: red → orange, same DASH-1a reasoning
  as `RatingBandCollapsible.tsx`). The `hsl(38 90% 97%)` literal two lines
  below (the coach/self-disagreement row highlight) was also migrated, to
  `--status-late-bg`, since it already pairs with a `--status-late` ring
  applied a few lines up. Neither fix moves this file's ratchet count
  (still 28 → 0) since neither was ever counted. **Lesson: grep a touched
  file for `hsl(`/`rgb(` literals as well as palette classes before calling
  it migrated — the ratchet only proves the Tailwind-class count went down,
  not that every hardcoded color in the file is gone.**
- **Verify "identical" duplicated class strings actually match before using
  `replace_all`.** `RecordingProcessCard.tsx` had the same amber
  bg/border/rounded treatment on two cards, but with `space-y-3` in a
  different position in the class string (`"p-4 bg-amber-50 ... rounded-lg
  space-y-3"` vs `"space-y-3 p-4 bg-amber-50 ... rounded-lg"`) — different
  strings, so a single `replace_all` silently migrated only one of the two.
  Both are now migrated (14 → 0, correcting the doc's previously-wrong 0).
  **Lesson: re-run the exact-match grep after a `replace_all` on a
  hand-written class string; don't assume visually-identical Tailwind
  output means byte-identical source strings.**
- **`bg-destructive`/`text-destructive` is tuned for solid fills, not
  tinted-background text.** `RecordingStartCard.tsx`'s "Recording" badge
  paired `bg-destructive/10` with `text-destructive`. `--destructive` has a
  real `.dark` override (`0 62.8% 30.6%`, a low-lightness red meant to read
  as a solid button fill against light `-foreground` text) — on a 10%-opacity
  tint in dark mode that produces dark red text on a near-black background,
  effectively unreadable. Fixed by switching to `--status-missing`
  (`0 84% 60%`, mode-invariant, already proven for exactly this
  tinted-bg-plus-colored-text pairing via `StatusBadge`) for both the badge
  and its pulsing dot, reusing its red hue for the "actively recording"
  semantic the same way `--status-late`'s amber is reused for "attention"
  states elsewhere in this doc. `bg-destructive` alone (no paired
  `text-destructive` on a tint) is still fine — see the solid pulse dots in
  `EvaluationHub.tsx` and `CoachBaselineWizard.tsx`, which have no text
  layered on top and so no contrast issue. **Lesson: `--destructive` is
  safe for solid-fill buttons and solid dots/icons; treat it as unproven
  for the "light tint background + matching-hue text" pattern this
  migration uses everywhere else, and reach for a `--status-*` token there
  instead.**
- **Vivid `--score-N` on `--score-N-bg` fails contrast for text (Codex
  review on PR #71, P2, legitimate).** `StaffPriorityFocusTab.tsx`,
  `LocationSkillGaps.tsx` (both call sites), `StaffOverviewTab.tsx`,
  `StaffDetailV2.tsx`, `RatingBandCollapsible.tsx`, and
  `CoachBaselineWizard.tsx`'s `SCORE_CONFIG` all rendered a confidence/score
  label in the vivid `--score-N` color directly on `--score-N-bg` — as low
  as ~1.8-2.9:1 contrast in light mode, failing normal-text requirements on
  badge-sized (12-14px) text. `ClinicalBaselineResults.tsx`'s QA fix 1
  (above) already used the `-ink` variant correctly, which is what exposed
  the inconsistency: `--score-N-ink` exists precisely for this pairing
  (same `-bg` + `-ink` pattern already used by `ConfidenceCard.tsx` and
  `TeamStaffPage.tsx`, both outside this slice). Fixed by adding an `ink`
  field to `scoreBucketTokens()`'s return shape in
  `src/lib/confidenceScoreRamp.ts` (additive — `text` and `bg` are
  unchanged, so `DomainConfidenceHeatmap.tsx`, the one pre-existing
  consumer outside this slice, is unaffected) and switching every
  on-tint text usage above to `tokens.ink` / `--score-N-ink`, while
  `borderColor`/`border-[...]`/`activeBorder` keep the vivid `--score-N` —
  that usage is fine, it's text-on-tint specifically that fails.
  `confidenceScoreRamp.test.ts`'s pinned `scoreBucketTokens()` shape was
  updated deliberately to include `ink` in its `toEqual` expectations.
  **Lesson: the `-bg` + `-ink` pairing (not `-bg` + vivid) is the correct
  default for any score/status label rendered on its own tinted
  background; reach for vivid only for borders, dots, rings, and other
  non-text accents.** `DomainConfidenceHeatmap.tsx` was found to have the
  same vivid-on-tint pattern in `scoreTextStyle()` but predates this slice
  and wasn't touched — worth a follow-up ticket rather than scope-creeping
  it into this QA fix.

## 8. Slice 3 findings: items considered and deliberately left alone

- **Role-tier badge color code, `EditUserDrawer.tsx`'s `getCurrentStatusBadge()`.**
  Clinical Director (teal) and Regional Manager (amber, solid-fill) are a
  per-role color code, not a domain/score/status/win meaning and not
  generic chrome either. Reusing `--status-late`'s amber for "Regional
  Manager" would make a role badge visually indistinguishable from a
  submission-status pill sitting in the same admin table. Left hardcoded.
- **Decorative settings-section accents, `EditUserDrawer.tsx`'s "Doctor
  Portal Access" (teal) and "Clinical Director Access" (indigo) blocks.**
  These exist purely to help an admin visually tell the toggle sections
  apart on a long form — no domain/score/status/win meaning, and forcing
  them onto shared chrome tokens (`border`/`muted`) would flatten every
  section to the same gray and defeat the point. Left hardcoded (decision
  tree §1.4).
- **Material-type icon chips, `ProMoveList.tsx`'s Materials column
  (video=blue, script=green, audio=purple, link=blue).** A per-resource-TYPE
  categorical scheme, structurally identical to `DRIVER_LABELS` below and to
  the purple pipeline-stage gap — purple has no token, and forcing the
  other three onto existing tokens while purple stays hardcoded would be a
  half-migrated, inconsistent chip set. Left hardcoded as a set.
- **`DRIVER_LABELS` in `src/lib/constants/domains.ts` (16 instances,
  `C`/`R`/`E`/`D` sequencer-driver tags: blue/purple/amber/green).** Same
  4-category reasoning as the material-type chips above — no locked scale
  fits "why was this Pro Move recommended," and purple again has no token.
  Left hardcoded as a set rather than migrating 3 of 4 and leaving purple
  behind.
- **`ChristmasWelcome.tsx` (12 instances, all in one gradient banner).**
  Purely decorative seasonal styling ("Happy New Year 2025!") with zero
  domain/score/status/win meaning — decision tree §1.4's textbook case.
  Left untouched. (Whether this banner should still exist at all — the
  copy references a year that has passed — is a product question outside
  this migration's scope, not something this slice fixed or flagged as a
  bug; noting it only so a future pass doesn't rediscover the same "why is
  this still here" question from scratch.)
- **`AdminPage.tsx`'s "Complete your practice setup" banner (10 instances)
  — new contrast finding, left untouched on purpose.** This banner uses
  three different amber darkness levels for a heading (`amber-900`), body
  text (`amber-800`), and a solid CTA button (`amber-600`/`amber-700`).
  `--status-late` (the amber reuse this migration leans on everywhere else)
  is `hsl(45 93% 47%)` — close to Tailwind's `amber-500` — which computes to
  roughly **2:1 contrast** against its own `-bg` tint or a white card,
  well under the 4.5:1 WCAG minimum for normal text. Every other
  `--status-late` reuse in this slice and slice 2 is either a small badge
  (StatusBadge's own established, if unaudited, pattern) or large/bold text
  (≥18px bold clears the 3:1 large-text bar even at this contrast). This
  banner's body paragraph and heading are neither. Rather than introduce
  the first prominent-paragraph use of a token that may not actually be
  readable there, this slice left the whole banner hardcoded and is
  flagging the underlying gap: **`--status-late` (and every other
  `--status-*` base token) has no `-ink` variant**, unlike `--score-*`,
  even though the same slice-2 QA finding that added `-ink` for scores
  ("vivid-on-tint fails contrast for text") applies equally to status
  tokens — it just hasn't been caught elsewhere yet because no other
  consumer puts status-colored text at paragraph size. Worth a real
  accessibility pass on `StatusBadge.tsx` and a `--status-*-ink` token
  family as a follow-up ticket; not something to invent inline in a
  migration slice.
