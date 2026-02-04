

# Paused User Data Exclusion: Comprehensive Audit and Fix

## Current Situation

You have **4 paused staff members** on maternity leave:
- Makena Ward (paused Jan 23, 2026)
- Jasmine Murguia (paused Jan 19, 2026)  
- Kaylie Aguilar (paused Jan 19, 2026)
- Alana Sepeda (paused Jan 19, 2026)

## Audit Findings

### What's Working (Paused Users Correctly Excluded)

| Location | Filter Present |
|----------|---------------|
| `useLocationAccountability` hook | `eq('is_paused', false)` |
| `useOrgAccountability` hook | `eq('is_paused', false)` |
| `useEvalCoverage` hook | `eq('is_paused', false)` |
| `useEvalDeliveryProgress` hook | `eq('is_paused', false)` |
| `LocationSubmissionWidget` | `eq('is_paused', false)` |
| `RemindersTab` (coach reminders) | `eq('is_paused', false)` |
| `SummaryMetrics` (eval results) | `eq('is_paused', false)` |
| `LocationDetailV2` (eval results) | `eq('is_paused', false)` |
| Home page (`ThisWeekPanel`) | Shows "Temporarily Paused" message |

### What's Broken (Paused Users Incorrectly Included)

| Location | Impact |
|----------|--------|
| `view_staff_submission_windows` (database view) | Paused users have 132 submission window records each, inflating "missing" counts |
| `get_staff_weekly_scores` (RPC) | Paused users appear in Coach Dashboard table |
| `get_location_domain_staff_averages` (RPC) | Paused users included in org-level evaluation domain averages |
| Regional Dashboard | Aggregates from `get_staff_weekly_scores`, so paused users inflate location stats |

### Data Irregularities Found

1. **Submission Windows**: Each paused user has ~132 records in `view_staff_submission_windows` that shouldn't exist (weeks after their pause date)
2. **Coach Dashboard**: Paused users appear in the staff table, showing as "Missing" for current week
3. **Regional Dashboard**: Location cards may show inflated missing counts due to paused users

**Good news**: No actual scores or evaluations were recorded for paused users after their pause dates, so historical data is clean.

---

## Implementation Plan

### Phase 1: Database Layer Fixes

**1.1 Update `view_staff_submission_windows`**

Add `is_paused = false` filter to the base staff CTE:

```sql
CREATE OR REPLACE VIEW view_staff_submission_windows AS
WITH base_staff AS (
  SELECT 
    s.id AS staff_id,
    -- other columns...
  FROM staff s
  JOIN locations l ON l.id = s.primary_location_id
  WHERE s.is_participant = true
    AND s.is_paused = false  -- NEW: Exclude paused users
),
-- rest unchanged...
```

**1.2 Update `get_staff_weekly_scores` RPC**

Add filter to the `filtered_staff` CTE:

```sql
filtered_staff AS (
  SELECT ...
  FROM staff s
  WHERE s.is_participant = true
    AND s.is_org_admin = false
    AND s.is_paused = false  -- NEW: Exclude paused users
    AND s.primary_location_id IS NOT NULL
    AND (...)
)
```

**1.3 Update `get_location_domain_staff_averages` RPC**

Add filter to the staff join:

```sql
FROM staff s
JOIN locations l ON l.id = s.primary_location_id
WHERE l.organization_id = p_org_id
  AND s.is_participant = true
  AND s.is_paused = false  -- NEW: Exclude paused users
```

### Phase 2: Individual Staff Queries (No Changes Needed)

These correctly handle paused users already:
- `get_staff_all_weekly_scores` - Used for individual staff detail pages, which is appropriate (coach may want to see a paused user's history)
- `get_staff_submission_windows` - Called via `view_staff_submission_windows`, so Phase 1.1 fixes this

### Phase 3: Retroactive Data Cleanup (None Required)

The database queries confirmed:
- No `weekly_scores` records exist for paused users after their pause dates
- No `evaluations` were created for paused users after their pause dates
- The issue is purely in the **view/aggregation layer**, not in actual data

---

## Summary of Changes

| File | Change |
|------|--------|
| New migration SQL | Update `view_staff_submission_windows` to filter `is_paused = false` |
| New migration SQL | Update `get_staff_weekly_scores` to filter `is_paused = false` |
| New migration SQL | Update `get_location_domain_staff_averages` to filter `is_paused = false` |

### After Implementation

- Coach Dashboard will no longer show paused users
- Regional Dashboard location cards will show accurate staff counts and missing percentages
- Submission rate calculations will exclude paused users
- Evaluation domain averages will exclude paused users
- Individual staff detail pages will still work (coaches can view historical data for paused users if they navigate directly)

---

## Edge Case Considerations

1. **What if a user is unpaused?** They automatically reappear in all aggregations since the filter is on current `is_paused` status.

2. **Historical data for evaluations?** `SummaryMetrics` already handles this correctly - it queries evaluations first, then includes paused staff who have evaluations in the period (the "evaluated early" logic).

3. **What about submissions made before pause?** All existing submissions remain intact. The filters only affect which staff appear in current-week views.

