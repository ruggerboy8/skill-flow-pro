

# Evaluation Review Wizard V2

## Summary

Complete rewrite of the evaluation review wizard from a 3-step "derived insights" flow to a 4-step "scan, choose, commit" flow. The server payload is simplified to candidate lists (top/bottom), the user selects their own focus competencies, and ProMoves are fetched from those selections. Ana Soto Bernal's existing review data will be cleared.

---

## Pre-work: Clear Ana Soto Bernal's test data

Reset her evaluation (`706152be-...`) so the V2 flow can be tested fresh:
- Set `review_payload = NULL`, `viewed_at = NULL` on that evaluation
- Delete any rows in `staff_quarter_focus` for that evaluation

---

## 1. New migration: V2 `compute_and_store_review_payload` RPC

Replace the existing RPC with a V2 payload structure.

**Output shape:**
```text
{
  version: 2,
  computed_at: "2026-02-11T18:00:00Z",   (ISO string)
  sparse: false,
  domain_summaries: [ { domain_name, observer_avg, self_avg, count_scored } ],
  top_candidates: [ { competency_id, competency_name, domain_name, observer_score, self_score, gap, observer_note, self_note } ],
  bottom_candidates: [ ...same shape... ],
  top_used_fallback: false
}
```

**Key logic:**
- **Version cache**: if stored payload has `version = 2`, return it; otherwise recompute and overwrite
- **sparse**: `true` if fewer than 4 scored items; candidate arrays empty
- **domain_summaries**: aggregated from scored items (excluding `observer_is_na` and `self_is_na` for self_avg)
- **top_candidates**: `observer_score >= 3`, sorted by `observer_score DESC`, then `abs(gap) ASC`, then `competency_id ASC`. Limit 4
- **Fallback**: if top_candidates is empty after the >= 3 filter, take the 4 highest-scored items regardless and set `top_used_fallback = true`
- **bottom_candidates**: exclude items already in top_candidates, sort by `observer_score ASC`, then `gap DESC` (self - observer), then `competency_id ASC`. Exclude `observer_score = 4`. Limit 6
- **gap**: always `self_score - observer_score` (null if self_score is null)
- **observer_note and self_note**: included in item output
- **computed_at**: stored as ISO string via `to_char(now() at time zone 'utc', ...)`
- **Authorization**: same as current (owner or super admin), plus enforce `status = 'submitted'` and `is_visible_to_staff = true` for non-admin callers
- Remove domain_avg tie-break (simplify -- not worth the CTE complexity)

---

## 2. Update `src/lib/reviewPayload.ts`

**Replace entirely** with V2 types (no V1 backward compat needed):

```text
ReviewPayloadV2 {
  version: number
  computed_at: string
  sparse: boolean
  domain_summaries: DomainSummary[]
  top_candidates: ReviewPayloadItem[]
  bottom_candidates: ReviewPayloadItem[]
  top_used_fallback: boolean
}

ReviewPayloadItem -- same fields plus gap: number | null
```

- `parseReviewPayload` checks for `top_candidates` key; returns null if missing
- `CURRENT_PAYLOAD_VERSION = 2`
- Remove `recommended_competency_ids`, `priorities`, `strengths`, `alignment`, `gaps`
- Keep `quarterNum` and `compareEvalsByPeriod` helpers (used elsewhere)

---

## 3. Rewrite `src/pages/EvaluationReview.tsx`

### State

```text
step: 0-3  (Intro, Highlights, Choose Competencies, ProMoves)
keepCrushingId: number | null
improveIds: Set<number> (max 2)
selectedActionIds: Set<number> (max 3)
```

No reflection field in V2 (not persisted yet, so skip to avoid "disappearing into the void").

### Step 0 -- Intro

- Title: `{periodLabel} Evaluation Review`
- Body: "This review takes about 2 minutes." + 3 bullet points explaining the steps + "Your focus will be pinned on Home."
- Primary CTA: "Start"
- Secondary links: "View full evaluation" + "Exit to Home"

### Step 1 -- Highlights

- If `sparse`: show `domain_summaries` with "limited data" note
- Otherwise: show up to 2 items from `top_candidates` as "Strengths We Saw" and up to 2 from `bottom_candidates` as "Opportunities"
- Each item: competency name, domain badge (outline), observer/self scores, expandable "Coach note" toggle (collapsed by default; only show toggle if note exists)
- If `self_note` exists, show under "Your note" label (separate from coach note)
- Link: "See full scores" to `/evaluation/{evalId}`

### Step 2 -- Choose Focus Competencies

- Title: "Choose 3 Focus Competencies"
- Instruction: "Pick 1 to keep crushing and 2 to improve this quarter."
- **Panel A -- "Keep Crushing (pick 1)"**: all `top_candidates` (up to 4). If `top_used_fallback`, label as "Strongest Areas"
- **Panel B -- "Improve This Quarter (pick 2)"**: all `bottom_candidates` (up to 6)
- Each card: competency name, domain badge, observer/self scores, expandable coach note
- Selection: radio-like for Panel A (1 max), checkbox for Panel B (2 max). Inline message when not yet complete: "Select 1 above and 2 below to continue"
- Progress: "X of 3 selected" inline
- Edge case: if bottom_candidates < 2 items, relax by allowing selection from a "Browse all" modal (fetch all evaluation_items)
- Auto-scroll nudge: after selecting keep crushing item, smooth scroll to Panel B

### Step 3 -- Choose ProMoves and Complete

- Fetch ProMoves for the 3 selected competency IDs (query `pro_moves` where `competency_id IN (...)` and `active = true`)
- Group by competency. For "Improve" competencies with an observer_note, show a small "Coach context" callout above that competency's ProMoves
- Checkboxes, 1-3 ProMoves max. Count display: "X of 3 ProMoves selected"
- Primary CTA: "Save focus and complete review" (disabled until >= 1 ProMove selected)
- Secondary: "Complete review without selecting focus" (always available)

### Navigation

- Back button on all steps; Step 0 back = navigate(-1)
- Progress: "Step X of 4 -- {label}" at top right
- Selections preserved when navigating back

### Completion

- Calls existing `save_eval_acknowledgement_and_focus` RPC with selected action_ids (unchanged)
- Invalidates queries and navigates to home

---

## 4. Shared competency card component

Extract a reusable `CompetencyCard` component used in Steps 1, 2, and 3:
- Competency name, domain badge (outline, small), observer/self score display
- Optional expandable coach note (collapsed by default, "Coach note" toggle)
- Optional "Your note" section for self_note
- Optional selection state (selected/unselected border treatment)

This keeps layout consistent across all wizard steps.

---

## 5. Files changed

| File | Action |
|------|--------|
| `supabase/migrations/new_migration.sql` | New -- V2 RPC + clear Ana's test data |
| `src/lib/reviewPayload.ts` | Rewrite -- V2 types and parser |
| `src/pages/EvaluationReview.tsx` | Rewrite -- 4-step wizard |

No changes needed to `evaluations.ts`, `EvalReadyCard.tsx`, `CurrentFocusCard.tsx`, or `save_eval_acknowledgement_and_focus` RPC.

