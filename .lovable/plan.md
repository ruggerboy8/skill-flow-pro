

## Phase 2: Location-Based Deadline Configuration

### What Changes

**1. Database: Add 4 columns to `locations`**

| Column | Type | Default |
|--------|------|---------|
| `conf_due_day` | smallint | 1 (Tuesday) |
| `conf_due_time` | time | 14:00:00 |
| `perf_due_day` | smallint | 4 (Friday) |
| `perf_due_time` | time | 17:00:00 |

Day offset from Monday: 0=Mon, 1=Tue, 2=Wed, 3=Thu, 4=Fri, 5=Sat, 6=Sun. All existing locations get defaults automatically.

**2. SQL view update**

`view_staff_submission_windows` will read the 4 new columns instead of hardcoded intervals:

```sql
-- Confidence due (currently hardcoded '1 day 14 hours'):
(ad.week_of + (COALESCE(l.conf_due_day, 1) || ' days')::interval
            + COALESCE(l.conf_due_time, '14:00:00'::time))
  AT TIME ZONE ad.timezone

-- Performance due (currently hardcoded '4 days 17 hours'):
(ad.week_of + (COALESCE(l.perf_due_day, 4) || ' days')::interval
            + COALESCE(l.perf_due_time, '17:00:00'::time))
  AT TIME ZONE ad.timezone
```

The view already joins `locations` via `base_staff`, so the columns are available. The join just needs to carry the 4 new columns through each CTE.

**3. Fix canonical defaults in `submissionPolicy.ts`**

Two values need correcting per your earlier direction:

| Threshold | Current | Corrected |
|-----------|---------|-----------|
| `checkin_open` | Mon 00:00 | Mon 00:01 |
| `checkin_visible` | Mon 09:00 | Mon 06:00 |

This also updates the toast in `Confidence.tsx` (line 56) from "9:00 a.m." to "6:00 AM" since it should derive from the policy value rather than a hardcoded string.

**4. Add `getPolicyOffsetsForLocation()` to `submissionPolicy.ts`**

```typescript
export function getPolicyOffsetsForLocation(location: {
  conf_due_day?: number | null;
  conf_due_time?: string | null;
  perf_due_day?: number | null;
  perf_due_time?: string | null;
}): PolicyOffsets {
  return {
    ...DEFAULT_POLICY_OFFSETS,
    confidence_due: {
      dayOffset: location.conf_due_day ?? DEFAULT_POLICY_OFFSETS.confidence_due.dayOffset,
      time: location.conf_due_time ?? DEFAULT_POLICY_OFFSETS.confidence_due.time,
    },
    performance_due: {
      dayOffset: location.perf_due_day ?? DEFAULT_POLICY_OFFSETS.performance_due.dayOffset,
      time: location.perf_due_time ?? DEFAULT_POLICY_OFFSETS.performance_due.time,
    },
  };
}
```

Only `confidence_due` and `performance_due` are overridable. `checkin_open`, `checkin_visible`, `checkout_open`, and `week_end` stay system defaults.

**5. Thread offsets through wrappers**

- `src/v2/time.ts` `getWeekAnchors(now, tz)` -- add optional `offsets?: PolicyOffsets` parameter, pass through to `getSubmissionPolicy`
- `src/lib/centralTime.ts` `getWeekAnchors(now, tz)` -- same optional `offsets` parameter

Existing callers without `offsets` continue to use defaults (backward compatible).

**6. Update callers to pass location-specific offsets**

- `src/lib/locationState.ts` `getLocationWeekContext` -- already fetches the location record; read the 4 new columns and pass `getPolicyOffsetsForLocation(loc)` to `getWeekAnchors`
- `src/pages/Confidence.tsx` -- currently hardcodes `'America/Chicago'`; fetch user's location to get timezone + offsets
- `src/pages/Performance.tsx` -- same pattern
- `src/pages/ConfidenceWizard.tsx` -- already has staff location; pass offsets
- `src/pages/PerformanceWizard.tsx` -- same
- `src/pages/coach/RemindersTab.tsx` -- already iterates per-location; pass offsets from location data
- `src/lib/backlog.ts` `areSelectionsLocked` -- fetch user's location for offsets

**7. LocationFormDrawer -- add Submission Deadlines section**

Add a "Submission Deadlines" section below the cycle length field with:

- **Confidence due**: Day-of-week dropdown (Monday-Sunday) + time input (HH:MM). Default: Tuesday 2:00 PM
- **Performance due**: Day-of-week dropdown (Monday-Sunday) + time input (HH:MM). Default: Friday 5:00 PM
- Helper text: "Submissions after this time are flagged as late"
- Validation: performance due must be later in the week than confidence due

The Location interface in the drawer gets 4 new optional fields. The `useEffect` populates them from the location record when editing; defaults apply for new locations.

No changes to `AdminLocationsTab.tsx` -- deadlines are only visible/editable from the drawer.

**8. Update Supabase types**

Add the 4 new columns to the `locations` type in `src/integrations/supabase/types.ts`.

---

### Files Summary

| Action | File | Notes |
|--------|------|-------|
| Migration | SQL | Add 4 columns to `locations`, update `view_staff_submission_windows` |
| Edit | `src/lib/submissionPolicy.ts` | Fix 2 defaults, add `getPolicyOffsetsForLocation` |
| Edit | `src/v2/time.ts` | Accept optional offsets param |
| Edit | `src/lib/centralTime.ts` | Accept optional offsets param |
| Edit | `src/components/admin/LocationFormDrawer.tsx` | Add deadline day/time fields |
| Edit | `src/lib/locationState.ts` | Pass location offsets to policy |
| Edit | `src/pages/Confidence.tsx` | Fetch location offsets + fix toast text |
| Edit | `src/pages/Performance.tsx` | Fetch location offsets |
| Edit | `src/pages/ConfidenceWizard.tsx` | Pass location offsets |
| Edit | `src/pages/PerformanceWizard.tsx` | Pass location offsets |
| Edit | `src/pages/coach/RemindersTab.tsx` | Pass location offsets |
| Edit | `src/lib/backlog.ts` | Fetch location offsets |
| Edit | `src/integrations/supabase/types.ts` | Add 4 columns to locations type |

### What Does NOT Change

- `checkin_open`, `checkin_visible`, `checkout_open`, and `week_end` remain system-wide (not per-location)
- Historical `confidence_late` / `performance_late` values already in `weekly_scores` are untouched
- `AdminLocationsTab.tsx` table layout unchanged
- `get_staff_all_weekly_scores` reads late flags from `weekly_scores` (write-time), not recomputed -- no change needed
