

## Audit: Coach/Doctor Data Flow — Findings and Fix Plan

### Critical Issue: Infinite Recursion on `coach_baseline_assessments` INSERT

**Root Cause:** The RLS INSERT policy "Coach can insert first assessment" contains a self-referencing subquery:

```sql
WITH CHECK (
  is_clinical_or_admin(auth.uid()) 
  AND NOT EXISTS (
    SELECT 1 FROM coach_baseline_assessments existing   -- ← self-reference
    WHERE existing.doctor_staff_id = coach_baseline_assessments.doctor_staff_id
  )
)
```

Postgres evaluates SELECT policies on `coach_baseline_assessments` to execute the `EXISTS` subquery, which themselves trigger further policy evaluations — causing infinite recursion.

**Fix:** Create a `SECURITY DEFINER` function that bypasses RLS to check for an existing assessment, then replace the INSERT policy to use it:

```sql
CREATE OR REPLACE FUNCTION public.coach_baseline_exists_for_doctor(_doctor_staff_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM coach_baseline_assessments
    WHERE doctor_staff_id = _doctor_staff_id
  );
$$;
```

Then replace the INSERT policy:

```sql
DROP POLICY "Coach can insert first assessment" ON coach_baseline_assessments;
CREATE POLICY "Coach can insert first assessment" ON coach_baseline_assessments
  FOR INSERT TO authenticated
  WITH CHECK (
    is_clinical_or_admin(auth.uid())
    AND NOT coach_baseline_exists_for_doctor(doctor_staff_id)
  );
```

### Full Audit of All Write Operations in the Coach/Doctor Flow

I reviewed every table involved in the coaching lifecycle. Here are the results:

| Table | Operation | Policy Pattern | Status |
|-------|-----------|---------------|--------|
| `coach_baseline_assessments` | INSERT | Self-referencing subquery | **BROKEN — fix above** |
| `coach_baseline_assessments` | UPDATE | Joins to `staff` via `coach_staff_id` | OK |
| `coach_baseline_items` | INSERT/UPDATE | Joins `coach_baseline_assessments → staff` | OK (cross-table, no loop) |
| `coaching_sessions` | INSERT (ALL) | Joins to `staff` via `coach_staff_id` | OK |
| `coaching_sessions` | UPDATE (doctor) | Joins to `staff` via `doctor_staff_id` | OK |
| `coaching_session_selections` | INSERT (coach) | Via `coaching_sessions → staff` | OK |
| `coaching_session_selections` | INSERT (doctor) | Via `coaching_sessions → staff` | OK |
| `coaching_meeting_records` | ALL (coach) | Via `coaching_sessions → staff` | OK |
| `coaching_meeting_records` | UPDATE (doctor) | Via `coaching_sessions → staff` | OK |
| `doctor_baseline_assessments` | INSERT | Via `staff` (doctor) | OK |
| `doctor_baseline_assessments` | UPDATE | Via `staff` (doctor) | OK |
| `doctor_baseline_items` | INSERT/UPDATE | Via `doctor_baseline_assessments → staff` | OK (cross-table) |

### Edge Cases Reviewed

1. **Duplicate coach assessments:** The UNIQUE constraint on `(doctor_staff_id, coach_staff_id)` prevents duplicates at the DB level. The `CoachBaselineWizard` also fetches existing before creating. Both safe.

2. **Duplicate coaching sessions:** The UNIQUE constraint `(doctor_staff_id, sequence_number)` prevents duplicates. The `addCheckinMutation` catches `23505` errors. The `DirectorPrepComposer` checks for existing `scheduled` sessions before creating. Both safe.

3. **Race condition on auto-create in `CoachBaselineWizard`:** The `useEffect` at line 407 that auto-creates the assessment when `existingAssessment === null` could fire before the query finishes (since `null` is the initial state). However, the query uses `maybeSingle()` which returns `null` for no rows, and `useQuery` returns `undefined` before loading. The `enabled: !!staff?.id` guard and the fact that `existingAssessment` starts as `undefined` (not `null`) prevents premature creation. Safe.

4. **Duplicate `coach_baseline_items`:** Uses `onConflict: 'assessment_id,action_id'` for upserts. There are actually two identical UNIQUE constraints (`coach_baseline_items_assessment_action_unique` and `coach_baseline_items_assessment_id_action_id_key`) — redundant but harmless.

5. **`doctor_baseline_items` score range:** CHECK constraint `self_score >= 1 AND self_score <= 4` conflicts with the N/A option if it sends `null` or `0`. The code sends `null` for N/A, which is allowed since `self_score` is nullable. Safe.

6. **`coach_baseline_items` rating range:** CHECK constraint `rating >= 0 AND rating <= 4` — allows 0 which could be used for N/A. Code sends `null` for unrated, which bypasses the check. Safe.

### Summary

Only one fix is needed: replace the self-referencing INSERT policy on `coach_baseline_assessments` with a `SECURITY DEFINER` function. All other write paths are correctly structured.

