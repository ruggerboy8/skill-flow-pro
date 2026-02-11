

# Final Refinements to Evaluation Review Plan

These are the specific, targeted changes to incorporate into the approved plan before implementation begins.

---

## 1. Quarter Ordering: Derive Numeric Sort

**Problem:** `quarter` is stored as text (`'Q1'`, `'Q2'`, etc.). String sorting of `'Q1' < 'Q4'` happens to work for single-digit quarters, but relying on this is fragile and unclear.

**Fix:** In every SQL context that needs "newest evaluation" ordering, use an explicit `CASE` expression:

```text
ORDER BY program_year DESC,
         CASE quarter WHEN 'Q4' THEN 4 WHEN 'Q3' THEN 3 WHEN 'Q2' THEN 2 WHEN 'Q1' THEN 1 ELSE 0 END DESC
```

This applies to:
- `compute_and_store_review_payload` RPC (if it ever selects across evals)
- Home "current focus" query (finding the most recent released eval for a staff member)
- Home "eval ready" card (picking the newest unreviewd eval)
- Any client-side queries that sort by period -- use a helper in `reviewPayload.ts`:
  ```
  function quarterNum(q: string | null): number {
    return q === 'Q4' ? 4 : q === 'Q3' ? 3 : q === 'Q2' ? 2 : q === 'Q1' ? 1 : 0;
  }
  ```

No schema change needed -- just consistent query patterns.

---

## 2. Focus Save RPC: Atomicity and Empty-Array Behavior

**Clarifications for the `save_eval_acknowledgement_and_focus` RPC:**

- The entire function body runs in a single implicit transaction (standard for PL/pgSQL). No early returns between delete and insert.
- When `p_action_ids` is empty (length 0):
  - Set `acknowledged_at = COALESCE(acknowledged_at, now())`
  - Do NOT delete existing focus rows
  - Do NOT set `focus_selected_at`
  - This is "acknowledge-only" -- it never destroys previously saved focus
- When `p_action_ids` has 1-3 items:
  - Delete existing focus rows for that evaluation
  - Insert new rows
  - Set `acknowledged_at = COALESCE(acknowledged_at, now())`
  - Set `focus_selected_at = now()`

Structure in pseudocode:
```text
BEGIN
  -- validate ownership, status, visibility
  -- validate action_ids if any

  UPDATE evaluations SET acknowledged_at = COALESCE(acknowledged_at, now()) WHERE id = p_eval_id;

  IF array_length(p_action_ids, 1) > 0 THEN
    DELETE FROM staff_quarter_focus WHERE evaluation_id = p_eval_id;
    INSERT INTO staff_quarter_focus (staff_id, evaluation_id, action_id) ...;
    UPDATE evaluations SET focus_selected_at = now() WHERE id = p_eval_id;
  END IF;
END;
```

---

## 3. Review Payload: Deterministic Tie-Breaking

Add `competency_id` as the final tie-breaker in every ranked list within the payload computation. This prevents nondeterministic Postgres ordering when scores tie.

Applied to all four lists:
- **Priorities:** `ORDER BY observer_score ASC, (self_score - observer_score) DESC, domain_avg ASC, competency_id ASC`
- **Strengths:** `ORDER BY observer_score DESC, abs(self_score - observer_score) ASC, competency_id ASC`
- **Alignment:** `ORDER BY abs(self_score - observer_score) ASC, competency_id ASC`
- **Gaps:** `ORDER BY (self_score - observer_score) DESC, competency_id ASC`

---

## 4. Single Visibility RPC: Route All Paths

There are currently two client-side functions that set `is_visible_to_staff`:
- `setEvaluationVisibility(evalId, visible)` -- single eval (line 670 of evaluations.ts)
- `bulkSetVisibilityByLocation(locationId, period, visible)` -- bulk (line 684)

**Both must route through RPCs** to enforce the `COALESCE(released_at, now())` invariant.

Create two RPCs (or one flexible one):

**Option: Two RPCs (simpler, matches current call sites)**

1. `release_single_evaluation(p_eval_id uuid, p_visible boolean, p_released_by uuid)`
   - Updates `is_visible_to_staff = p_visible`
   - When `p_visible = true`: `released_at = COALESCE(released_at, now())`, `released_by = COALESCE(released_by, p_released_by)`
   - Requires coach/admin caller (validate via staff role)

2. `bulk_release_evaluations(p_location_id uuid, p_period_type text, p_quarter text, p_year int, p_visible boolean, p_released_by uuid)`
   - Same COALESCE logic, applied to all matching submitted evals at that location/period

Update `evaluations.ts`:
- `setEvaluationVisibility` calls `release_single_evaluation` RPC
- `bulkSetVisibilityByLocation` calls `bulk_release_evaluations` RPC

---

## 5. Delivery Progress: Filter to Released Only

In `useEvalDeliveryProgress.tsx`, the delivery status aggregation (viewedCount, acknowledgedCount, focusSelectedCount) must only count evaluations where `is_visible_to_staff = true`. Otherwise metrics are misleading ("0 viewed" for unreleased evals).

The existing query already filters by status, but the new aggregate counts should additionally check `is_visible_to_staff = true` before counting delivery fields.

---

## 6. "Complete" Filter Definition

For the admin Delivery Tab filter chips:

- **"All"** -- all submitted evals (released or not)
- **"Not released"** -- `is_visible_to_staff = false`
- **"Released, not viewed"** -- visible, `viewed_at IS NULL`
- **"Viewed, not acknowledged"** -- `viewed_at` set, `acknowledged_at IS NULL`
- **"Acknowledged, no focus"** -- `acknowledged_at` set, `focus_selected_at IS NULL`
- **"Complete"** -- `acknowledged_at IS NOT NULL` (focus is optional; "complete" means the staff member finished the review loop)

This gives admins granular visibility without making focus selection feel mandatory.

---

## 7. Wizard Step 3: CTA Wording

Primary button: **"Save focus and complete review"**
Secondary link: **"Complete review without selecting focus"**

Both call the same RPC (`save_eval_acknowledgement_and_focus`) -- primary passes selected action_ids, secondary passes an empty array.

---

## 8. Wizard Mount: Prevent Re-computation on Re-render

The wizard mount logic (mark viewed + compute payload) must be gated behind a `useEffect` with proper deps, and the payload RPC is already idempotent (only runs if `review_payload IS NULL`). Additionally:

- Use a `useRef` flag to prevent double-invocation in React strict mode
- Sequence: fetch eval first, then conditionally call RPCs based on the fetched data (don't call if already viewed/computed)
- Store payload in local state after RPC returns; subsequent renders read from state, not re-call

---

## Summary of Changes to Prior Plan

| Area | Change |
|------|--------|
| Quarter sorting | Use explicit CASE expression, not string sort |
| Focus save (empty array) | Do not delete existing focus rows |
| Tie-breaking | Add competency_id as final ORDER BY in all payload lists |
| Visibility RPCs | Route both single and bulk paths through RPCs |
| Delivery counts | Only count released evals in progress aggregates |
| "Complete" filter | = acknowledged_at set (focus optional) |
| Step 3 CTAs | Explicit wording for both paths |
| Mount effect | useRef guard against double-invocation |

These are additive clarifications to the existing approved plan. No structural changes to the architecture, file list, or implementation order.
