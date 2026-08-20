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

Baseline: 808 → 755 hardcoded classes across `src/` (the drop is exactly
the 30 + 23 from `Index.tsx` and `EvaluationHub.tsx`; the Button/logo/
landing changes don't move this number since `brand-*` was never counted).

## 5. Remaining unmigrated surfaces (post slice-1 baseline)

87 files still carry at least one hardcoded palette class, 755 instances
total. Two of them — `OnTimeRateWidget.tsx` and
`LocationSubmissionWidget.tsx` (30 each) — are Command Center /
`RegionalDashboard` surfaces explicitly out of scope for DSN-3 (owned by
in-flight DASH tickets on their own branches); leave them for that work.
`SignalsBanner.tsx`, `DomainConfidenceHeatmap.tsx`, and
`LocationHealthCard.tsx` are also dashboard surfaces named in the
exclusion list but already show 0 — DASH-1 already migrated them.

Highest-count remaining files, for whoever scopes the next slice:

| File | Count |
|---|---|
| `src/components/coach/OnTimeRateWidget.tsx` | 30 (dashboard, excluded) |
| `src/components/dashboard/LocationSubmissionWidget.tsx` | 30 (dashboard, excluded) |
| `src/components/admin/EditUserDrawer.tsx` | 26 |
| `src/components/home/ThisWeekPanel.tsx` | 25 |
| `src/components/dashboard/LocationSkillGaps.tsx` | 24 |
| `src/components/doctor/DoctorMaterialsSheet.tsx` | 24 |
| `src/components/doctor/DoctorProMoveDrawer.tsx` | 24 |
| `src/components/doctor/RatingBandCollapsible.tsx` | 24 |
| `src/lib/coachingSessionStatus.ts` | 24 |
| `src/components/coach/RecordingStartCard.tsx` | 23 |
| `src/pages/doctor/DoctorReviewPrep.tsx` | 22 (also has the same blue "backfill" alert pattern as `Index.tsx`, and `EditUserDrawer.tsx` above shares it too — worth doing those together so the "info banner" convention from §1.5 gets applied consistently in one pass) |
| `src/components/clinical/CoachBaselineWizard.tsx` | 20 |
| `src/components/admin/ProMoveList.tsx` | 19 |
| `src/components/clinical/ClinicalBaselineResults.tsx` | 18 |
| `src/pages/doctor/DoctorHome.tsx` | 17 |
| ... 72 more files, 1-16 instances each | see `scripts/hardcoded-colors-baseline.json` for the full per-file list |

Run `node scripts/check-hardcoded-colors.mjs --update-baseline` after any
future migration slice lands to see the current full list and confirm the
new total.

## 6. Ambiguous items left for follow-up (not fixed here, flagged instead)

- **`--status-info`-shaped gap.** The blue "informational notice" pattern
  (`border-blue-200 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-950/20`
  + matching text/button treatment) appears in at least three files
  (`Index.tsx`, migrated this slice; `EditUserDrawer.tsx` and
  `DoctorReviewPrep.tsx`, not migrated). It doesn't cleanly fit domain,
  score, status, or win, and isn't decorative either. This slice mapped
  `Index.tsx`'s copy to `brand-signal`/`brand-navy`/`brand-blue` as a
  reasonable interim "info" convention (§1.5), but a real `--status-info`
  (or `--info-*`) token pair, with light and dark values chosen on
  purpose, would be a cleaner fix than three separate ad hoc brand-token
  mappings. Candidate for a DSN-5d or DSN-3-slice-2 follow-up.
- **`slatebrand.400`/`slatebrand.600`** in `tailwind.config.ts` has zero
  consumers in `src/`, same as the `brand.50/600/900` keys this slice
  removed. Left it alone since it wasn't named in this ticket's scope —
  worth a one-line cleanup ticket.
