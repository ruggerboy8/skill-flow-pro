

# Submission System and On-Time Widget Overhaul

## Problems

1. **Confidence Wizard has zero excuse gating** -- Daisy Lopez submitted scores 18 minutes after being excused because `ConfidenceWizard.loadData()` never checks `excused_locations` or `excused_submissions`.
2. **Performance Wizard checks excuses only for confidence-skip logic** -- it queries excuses to decide whether to skip the confidence prerequisite, but never blocks performance submission when *performance* itself is excused.
3. **Triplicated rate math** drifts across `OnTimeRateWidget`, `useStaffSubmissionRates`, and `LocationSubmissionWidget`, with contradictory zero-data defaults (0% vs 100%).
4. **N+1 RPC pattern** -- both `LocationSubmissionWidget` and `useStaffSubmissionRates` call `get_staff_submission_windows` once per staff member.
5. **`LocationSubmissionWidget` is `@ts-nocheck`** -- untyped and high-risk for drift.

---

## Execution Order

### Step 1: Shared calculation utility with strong types

**New file:** `src/lib/submissionRateCalc.ts`

- Define a typed `SubmissionWindow` interface matching the RPC return shape (no more `any`).
- Single `calculateSubmissionStats(windows: SubmissionWindow[], now?: Date): SubmissionStats` function.
- `SubmissionStats` includes a `hasData: boolean` field (true when `totalExpected > 0`).
- Accept `now` as a parameter for testability -- defaults to `new Date()`.
- Group by `week_of`, bucket by metric (`confidence` / `performance`), matching existing week-grouping logic.

### Step 2: Switch OnTimeRateWidget to shared utility

**File:** `src/components/coach/OnTimeRateWidget.tsx`

- Import and call `calculateSubmissionStats` instead of the inline `calculateStats` function (delete it).
- When `hasData === false`, render a neutral gray card ("No submission data yet") instead of red 0%.
- Rename the primary KPI label to "Completion Rate" consistently (the component name `OnTimeRateWidget` stays for now, but the displayed headline is already "Completion Rate" -- just make sure color/health functions branch on `hasData` first before evaluating the numeric rate).

### Step 3: Switch useStaffSubmissionRates to shared utility

**File:** `src/hooks/useStaffSubmissionRates.tsx`

- Import and call `calculateSubmissionStats`.
- Change map value type: `Map<string, number | null>` where `null` = no countable windows (instead of defaulting to `100`).
- Distinguish errors: `catch` block returns `0` currently -- change to `null` as well (query failure should not masquerade as poor performance; the dashboard already renders `null` as a gray dash).
- Update `UseStaffSubmissionRatesResult` interface to reflect `Map<string, number | null>`.

### Step 4: Update Coach Dashboard sort/render for null rates

**File:** `src/pages/coach/CoachDashboardV2.tsx`

- The dashboard already renders `null` as `"--"` and uses `text-muted-foreground` -- this is correct.
- Fix: currently the condition is `ratesLoading || sixWeekRate === null` which conflates loading with no-data. Split to:
  - While `ratesLoading`: show a small skeleton or spinner.
  - When `sixWeekRate === null` and not loading: show `"N/A"` in muted text.
- Sorting: in `useTableSort`, null values already sort as empty string via `getNestedValue`. Add explicit null-to-bottom logic: treat `null` as `-1` when sorting `sixWeekRate` so no-data staff sort below real rates.

### Step 5: Refactor LocationSubmissionWidget to shared utility

**File:** `src/components/dashboard/LocationSubmissionWidget.tsx`

- Remove `@ts-nocheck`.
- Replace the `sb: any = supabase` workaround with proper typed Supabase calls.
- Replace the inline per-staff window processing with `calculateSubmissionStats`.
- Apply same `hasData` neutral state rendering.

### Step 6: Wizard excuse gates (both load and submit paths)

**Files:** `src/pages/ConfidenceWizard.tsx`, `src/pages/PerformanceWizard.tsx`

**Load-time gate (both wizards):**
After loading staff and computing `effectiveMondayStr` (which already handles repair mode's `weekOf` parameter):

```
Query excused_locations for staff's primary_location_id + effectiveMondayStr + metric
Query excused_submissions for staff's id + effectiveMondayStr + metric
If either returns a match:
  -> toast("This week's [metric] has been excused")
  -> navigate home
  -> return early
```

For the Confidence Wizard, `metric = 'confidence'`. For the Performance Wizard, `metric = 'performance'` (separate from the existing confidence-excused check which handles prerequisite skipping).

**Submit-time gate (both wizards):**
Re-check excusal status immediately before the upsert in `handleSubmit()`:
- Run the same two queries.
- If excused, show a toast ("This submission was excused while you were working") and navigate home without upserting.
- This closes the race condition where an admin excuses a location while a staff member has the wizard open.

**Repair mode handling:**
Both wizards already compute `effectiveMondayStr` correctly for repair mode (using the `weekOf` query param when in repair, current Monday otherwise). The excuse check will use this same value, so historical repair weeks will only block if that specific historical week was excused -- no false blocks.

---

## Files Changed Summary

| File | Change |
|------|--------|
| `src/lib/submissionRateCalc.ts` | **New** -- typed `SubmissionWindow`, `SubmissionStats`, `calculateSubmissionStats()` |
| `src/components/coach/OnTimeRateWidget.tsx` | Use shared calc, neutral no-data state |
| `src/hooks/useStaffSubmissionRates.tsx` | Use shared calc, return `null` for no-data and errors |
| `src/pages/coach/CoachDashboardV2.tsx` | Split loading vs no-data display, null-to-bottom sort |
| `src/components/dashboard/LocationSubmissionWidget.tsx` | Remove `@ts-nocheck`, use shared calc, typed Supabase calls |
| `src/pages/ConfidenceWizard.tsx` | Add excuse gate in `loadData()` and `handleSubmit()` |
| `src/pages/PerformanceWizard.tsx` | Add performance-metric excuse gate in `loadData()` and `handleSubmit()` |
| `src/hooks/useTableSort.tsx` | Add explicit null-handling in comparator |

No database migrations needed. All fixes are frontend-only.

---

## Out of Scope (Follow-up)

- **Backend enforcement**: A server-side trigger or RPC validation that rejects `weekly_scores` inserts/updates for excused staff+week+metric combinations. This is the strongest guarantee but requires a migration and is tracked separately.
- **Batch RPC**: Replacing the N+1 `get_staff_submission_windows` calls with a single batch RPC accepting multiple staff IDs. Important for performance but independent of correctness fixes.

