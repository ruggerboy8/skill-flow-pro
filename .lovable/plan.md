

## Simplify: Remove Legacy Onboarding & weekly_focus Code

### Current State

All 11 active locations are at cycle 4 or higher. The one location in cycle 1 (Manor Kids Dentist) already has `onboarding_active: false`. The `weekly_assignments` V2 table with `source='global'` is the sole active path for all locations. The onboarding code paths (cycles 1-3 via `weekly_focus` and `source='onboarding'`) and `weekly_plan` legacy fallback are dead code.

Data snapshot:
- 75 global assignments in `weekly_assignments` (active)
- 1,080 onboarding assignments in `weekly_assignments` (historical, no longer created)
- 108 rows in `weekly_focus` (historical templates)
- 6 rows in `weekly_plan` (historical)
- 171 legacy scores using `weekly_focus_id` only (all historical, pre-June 2025)
- 2,582 recent scores using `assign:` IDs (the current system)

### What Gets Removed / Simplified

**Phase 1: Remove feature flags and dead branches**

1. **`src/lib/featureFlags.ts`** -- Remove `useWeeklyAssignmentsV2Enabled` (hardcode to always-on behavior). Keep `isV2`.

2. **`src/lib/locationState.ts` (`assembleWeek`)** -- Remove the entire onboarding branch (lines ~287-470, the "Cycles 1-3" section). Remove the `weekly_plan` legacy fallback (lines ~213-284). Remove the `onboarding_active` check. The function becomes: always query `weekly_assignments` with `source='global'`.

3. **`src/hooks/useWeeklyAssignments.tsx`** -- Remove the `cycleNumber < 4` guard and the `onboardingActive` parameter. The hook always fetches global assignments.

4. **`src/pages/ConfidenceWizard.tsx`** -- Remove the `onboarding_active` fetch, the `source='onboarding'` query branch, and the `weekly_plan` fallback. Always use `weekly_assignments` global path.

5. **`src/pages/PerformanceWizard.tsx`** -- Same cleanup: remove `onboarding_active`, `source='onboarding'`, and `weekly_plan` fallback branches.

6. **All consumers of `useWeeklyAssignmentsV2Enabled`** (8 files):
   - `src/pages/Performance.tsx`
   - `src/pages/Confidence.tsx`
   - `src/components/home/ThisWeekPanel.tsx`
   - `src/components/planner/WeekBuilderPanel.tsx`
   - `src/hooks/useReliableSubmission.tsx`
   - `src/lib/locationState.ts`
   - Remove the flag import and always use the V2 code path. Delete the `weekly_plan` fallback branches.

**Phase 2: Remove deprecated admin components**

7. **Delete** `src/components/admin/SimpleFocusBuilder.tsx` -- deprecated, uses `weekly_focus`
8. **Delete** `src/components/admin/FocusBuilder.tsx` -- deprecated, uses `weekly_focus`
9. **Delete** `src/components/admin/CycleWeekGrid.tsx` -- only used by the above two
10. **Delete** `src/pages/admin/CycleList.tsx` -- route for old cycle browser
11. **Delete** `src/pages/admin/WeekList.tsx` -- route for old week browser
12. **Delete** `src/pages/admin/WeekEditor.tsx` -- route for old week editor
13. **`src/App.tsx`** -- Remove the 3 legacy builder routes (`/builder/:roleId`, `/builder/:roleId/:cycle`, `/builder/:roleId/:cycle/week/:week`)

**Phase 3: Remove onboarding edge function**

14. **Delete** `supabase/functions/sync-onboarding-assignments/index.ts` -- no longer needed since no locations use onboarding cycles

**Phase 4: Clean up score-matching legacy**

15. **`src/hooks/useReliableSubmission.tsx`** -- Remove the `plan:` prefix handling and `weekly_plan` lookups. Only handle `assign:` prefix.
16. **`supabase/functions/sequencer-rank/index.ts`** -- Remove the `weekly_focus` ID mapping block (the UUID-pattern matching that resolves legacy `weekly_focus_id` to `action_id`). Keep only `weekly_assignments`-based resolution.

### What We Keep (Historical Data)

- The `weekly_focus` and `weekly_plan` tables stay in the database (historical data, no code references after cleanup)
- The 1,080 onboarding `weekly_assignments` rows stay (historical, `source='onboarding'`)
- The 171 legacy scores with `weekly_focus_id` stay (read-only historical data)
- The `onboarding_active` column on `locations` stays for now (no schema changes in this pass)

### Risk Mitigation

- No database schema changes -- purely code deletion
- Historical scores remain intact and queryable
- The `weekly_focus` and `weekly_plan` tables are untouched; if a rollback is ever needed, the code can be reverted from git
- We are NOT removing the `weekly_focus_id` column from `weekly_scores` -- old scores still reference it

### Files Changed Summary

| Action | File |
|--------|------|
| Edit | `src/lib/featureFlags.ts` |
| Edit | `src/lib/locationState.ts` |
| Edit | `src/hooks/useWeeklyAssignments.tsx` |
| Edit | `src/pages/ConfidenceWizard.tsx` |
| Edit | `src/pages/PerformanceWizard.tsx` |
| Edit | `src/pages/Performance.tsx` |
| Edit | `src/pages/Confidence.tsx` |
| Edit | `src/components/home/ThisWeekPanel.tsx` |
| Edit | `src/components/planner/WeekBuilderPanel.tsx` |
| Edit | `src/hooks/useReliableSubmission.tsx` |
| Edit | `supabase/functions/sequencer-rank/index.ts` |
| Edit | `src/App.tsx` |
| Delete | `src/components/admin/SimpleFocusBuilder.tsx` |
| Delete | `src/components/admin/FocusBuilder.tsx` |
| Delete | `src/components/admin/CycleWeekGrid.tsx` |
| Delete | `src/pages/admin/CycleList.tsx` |
| Delete | `src/pages/admin/WeekList.tsx` |
| Delete | `src/pages/admin/WeekEditor.tsx` |
| Delete | `supabase/functions/sync-onboarding-assignments/` |

