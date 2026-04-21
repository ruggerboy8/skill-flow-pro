

# Fix release flow + lower threshold + add ProMove participation snapshot

## 1. Stop auto-release on submit (re-integrate with existing release flow)

The platform already has a complete release pipeline in **EvalResults v2 → Delivery tab** (`DeliveryTab.tsx`):
- Per-staff and bulk-by-location release toggles
- `is_visible_to_staff` + `released_at` + `released_by` tracking
- Status pills (`not_released → released → viewed → reviewed → focus_set`)
- `notify-eval-release` edge function for staff emails

My previous change shortcut all of that. **Revert the auto-release** in `submitEvaluation()`:
- `submitEvaluation(evalId)` → only flips status to `submitted` + recomputes self-scores. No visibility flip.
- Coach button reverts to **"Submit Evaluation"** (not "Submit & Release"). On submit, coach lands back in Evaluation Hub with a toast: *"Submitted. Release to staff from the Delivery tab when ready."*
- Releasing remains a deliberate admin action via `DeliveryTab` (single or bulk).

## 2. Drop self-score threshold from n≥3 to n≥2

Confirmed via DB inspection of Taylor's Q2 eval — at n≥3 only 1 of 16 competencies qualifies. At n≥2, **6 of 16** qualify (Coordinating Patient Flow, Clear Treatment Communication, Demonstrating EI, Empathetic Practice Policy Education, Office Task Management, plus existing 1).

Migration: update `compute_eval_self_scores()` so the `n >= 3` branch becomes `n >= 2`. Also recompute Taylor's existing eval as part of the migration so you can verify immediately.

## 3. Add ProMove Participation Snapshot to the eval

A new read-only block that appears at the top of the staff-facing eval and on the coach Summary tab. Computed at eval submission time using the same 12-week rolling window as the self-score aggregation, drawing from the existing `submissionRateCalc.ts` helpers (already battle-tested in Coach Dashboard).

### What it shows

```text
ProMove Participation — last 12 weeks ending Apr 21
─────────────────────────────────────────────────────
Confidence check-ins:    10 / 12   83%   ●●●●●●●●●●○○
Performance submissions:  9 / 12   75%   ●●●●●●●●●○○○
On-time rate:                      89%
Self-scores aggregated from: 24 weekly performance submissions across 16 competencies
```

- Plain language, not a bunch of meters.
- Visible to staff and coach. Surfaces the connection: *"this is where your self-scores come from."*
- For Baselines: **hidden** (no participation history yet).
- For staff with `hasData = false` (new hire, all weeks excused): show *"Not enough participation history yet."*

### Persistence

Add a `participation_snapshot jsonb` column on `evaluations`:
```json
{
  "window_start": "2026-01-29",
  "window_end": "2026-04-21",
  "weeks_in_window": 12,
  "confidence_completed": 10,
  "performance_completed": 9,
  "on_time_count": 8,
  "total_self_score_submissions": 24,
  "competencies_with_data": 16
}
```
Computed and stored in `submitEvaluation()` alongside the self-score recompute, so it's frozen at submit time (won't drift if user submits more later). New SQL function `compute_eval_participation_snapshot(p_eval_id uuid)`.

## 4. Outline of the ideal final Quarterly eval

Stitching together everything we have, here's what staff will see when they open a released Quarterly eval:

```text
┌─────────────────────────────────────────────────────┐
│ Your Q2 2026 Evaluation                             │
│ Released by Coach Name • Apr 21, 2026               │
├─────────────────────────────────────────────────────┤
│ 1. ProMove Participation Snapshot (NEW)             │
│    - 12-week window ending eval submission date     │
│    - Confidence + Performance completion + on-time  │
│    - Sample-size context for the self-scores below  │
├─────────────────────────────────────────────────────┤
│ 2. Score table (Coach / Self / Gap)                 │
│    - Self = avg of weekly performance scores (n≥2)  │
│    - "Not enough data" inline when n<2              │
│    - One-line explainer above the table             │
├─────────────────────────────────────────────────────┤
│ 3. Coach notes per competency (existing accordion)  │
├─────────────────────────────────────────────────────┤
│ 4. Insights tab (legacy interview evals only)       │
│    - (i) tooltip explaining the old system          │
├─────────────────────────────────────────────────────┤
│ 5. Continue → Review wizard (existing 7-step flow)  │
│    - Pick strength, growth areas, ProMoves, note    │
└─────────────────────────────────────────────────────┘
```

Coach side (Evaluation Hub, after this change):
- **Observation tab** — score each competency, see the aggregated self-score inline (already added)
- **Summary tab** — participation snapshot + read-only score grid mirroring what staff will see
- **Submit button** — flips to `submitted`, returns coach to hub. Release happens in Delivery tab.

## Files affected

**New migration** — `supabase/migrations/<ts>_eval_n2_threshold_and_participation_snapshot.sql`
- Updates `compute_eval_self_scores()` threshold from 3 → 2
- Adds `participation_snapshot jsonb` column to `evaluations`
- New `compute_eval_participation_snapshot(p_eval_id uuid)` function
- Recomputes Taylor's eval inline

**Modified:**
- `src/lib/evaluations.ts` — drop auto-release from `submitEvaluation`; add `refreshEvalParticipationSnapshot()` and call it during submit
- `src/pages/coach/EvaluationHub.tsx` — button copy back to "Submit Evaluation"; redirect to hub list, not to staff view; toast pointing to Delivery tab
- `src/pages/EvaluationViewer.tsx` — add `ParticipationSnapshotCard` at top for Quarterly evals
- `src/components/coach/SummaryTab.tsx` — add the same snapshot card so coaches preview what staff will see
- **New:** `src/components/evaluations/ParticipationSnapshotCard.tsx` — pure presentational component reading from `evaluation.participation_snapshot`

## Out of scope

- Backfilling participation snapshots on already-submitted historical evals
- Configurable threshold per org (hardcoded n≥2)
- Per-domain breakdown of participation (just org-wide totals for now)
- Showing participation in admin export (can layer on later if you want)

