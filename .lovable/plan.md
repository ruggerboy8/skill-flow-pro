

# Aggregated Self-Score from Weekly Performance Submissions

## What changes

The "Self-Assessment Interview" tab disappears. Self-scores on **Quarterly** evaluations are auto-computed from the staff member's weekly `performance_score` submissions during the quarter. **Baseline** evaluations drop self-scores entirely (observer-only). Historical evals with interview-sourced self-scores stay intact and get an info tooltip.

## Calculation rules (Quarterly only)

For each competency on the eval:
- Average all `performance_score` rows from `view_weekly_scores_with_competency` where:
  - `staff_id` matches
  - `competency_id` matches
  - `week_of` falls in the quarter window (e.g. Q1 = Jan 1 – Mar 31, location tz)
  - `performance_score > 0` (excludes N/A)
- Round to 1 decimal, store sample size

**Insufficient data threshold:** n < 3 → display "Not enough data" inline at the competency row instead of a number. No tooltips, no caveats — just a clear flag.

**Recompute trigger:** silently on eval creation, and again silently right before submit. No manual refresh button.

## UI changes

### Coach — `EvaluationHub.tsx`
- Remove the **Self** tab entirely (interview recorder, transcript, paste, AI extraction — all gone)
- Tabs reduce to **Observation** + **Summary**
- Observation rows show the aggregated self-score read-only (e.g. `3.4`) or "Not enough data" pill when n<3 or n=0
- Submit gating no longer requires self-scores or self-notes
- For **Baseline** type: hide the entire self column

### Staff — `EvaluationViewer.tsx` + `EvaluationReview.tsx`
- Score table keeps Coach / Self / Gap columns for Quarterly evals
- Cells with insufficient data show "Not enough data" instead of a number; gap row collapses
- Baseline evals: hide Self/Gap columns entirely
- One-line explainer above table: *"Your self-score is the average performance score you submitted during this quarter."*
- Remove the "Self-Assessment Insights" panel for new evals
- **Legacy interview-sourced evals:** show an info `(i)` icon at the top of the score section with hover tooltip:
  > *"Self-scores in this evaluation were collected through a self-assessment interview. We've since moved to averaging your weekly performance submissions."*
  - Detection: eval has `interview_transcript` or `extracted_insights.self_assessment` populated

### Admin
- `eval-results-v2/` panels continue to work — same `evaluation_items.self_score` field
- Calibration footnote: *"Self-scores aggregated from weekly performance submissions."*

## Backend / data model

- Add to `evaluation_items`: `self_score_avg numeric(2,1)`, `self_score_sample_size int` (preserves decimal precision; existing `self_score` int kept for export back-compat, populated with rounded value)
- New SQL function `compute_eval_self_scores(p_eval_id uuid)` — quarter-aware, location-tz-aware, skips `Baseline` type
- Wire into `createDraftEvaluation()` and `submitEvaluation()` (silent, no UI surface)
- Stop writing `interview_transcript`, `draft_interview_audio_path`, `extracted_insights.self_assessment` (kept for historical reads only)

## Files affected

**New:**
- `supabase/migrations/<ts>_eval_self_score_aggregation.sql` — columns + `compute_eval_self_scores()` function

**Modified:**
- `src/lib/evaluations.ts` — hook aggregator into create/submit, drop self-fields from submit gate
- `src/pages/coach/EvaluationHub.tsx` — remove Self tab + interview UI, simplify gating, hide self column for Baseline
- `src/components/coach/SummaryTab.tsx` — drop self-assessment perspective
- `src/components/coach/InsightsDisplay.tsx` — drop self-assessment card
- `src/pages/EvaluationViewer.tsx` — render aggregated self / "Not enough data" / hide for Baseline / legacy info tooltip
- `src/pages/EvaluationReview.tsx` — same handling in review flow
- `src/components/coach/QuarterlyEvalsTab.tsx` — copy update

## Out of scope

- Backfilling already-submitted Q1 evals
- Manual refresh button
- Configurable lookback / threshold per org (hardcoded n<3)
- Optional free-text "self-reflection note" replacement field

