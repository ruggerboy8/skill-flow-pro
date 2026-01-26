

# Location Excuse System: Complete Data Waterfall Fix

## Problem Analysis

When a location is marked as "Excused", the system currently:
- Shows excuse badges on the `LocationHealthCard` in the Regional Dashboard
- Updates `get_staff_submission_windows` RPC to exclude excused location/week/metric combinations from historical rates

However, the system **fails** to:
1. **Filter the staff roster display** - Staff at excused locations still show as "Missing" in the embedded `CoachDashboardV2` table on the `LocationDetail` page
2. **Update the Location Detail page summary stats** - The `LocationHealthCard` on the detail page doesn't receive excuse status
3. **Adjust the Coach Dashboard calculations** - Missing counts, reminder buttons, and sorting still treat excused staff as incomplete
4. **Show contextual "Excused" badges per staff member** - Instead of "Missing", staff should show "Excused" for the relevant metric

---

## Complete Data Flow (Current vs. Expected)

```text
┌───────────────────────────────────────────────────────────────────────────────┐
│ EXCUSE CREATED IN excused_locations TABLE                                     │
│ (location_id, week_of, metric='confidence'|'performance', reason)             │
└───────────────────────────────────────────────────────────────────────────────┘
                                      │
           ┌──────────────────────────┼──────────────────────────┐
           ▼                          ▼                          ▼
┌─────────────────────┐    ┌─────────────────────┐    ┌─────────────────────┐
│ HISTORICAL RATES    │    │ LOCATION CARDS      │    │ STAFF ROSTER        │
│ (get_staff_         │    │ (RegionalDashboard) │    │ (CoachDashboardV2)  │
│  submission_windows)│    │                     │    │                     │
├─────────────────────┤    ├─────────────────────┤    ├─────────────────────┤
│ ✅ WORKING          │    │ ✅ WORKING          │    │ ❌ BROKEN           │
│ Excused weeks are   │    │ Shows "Excused"     │    │ Staff show as       │
│ excluded from       │    │ badge with reason   │    │ "Missing" even      │
│ denominators        │    │                     │    │ when location is    │
│                     │    │                     │    │ excused             │
└─────────────────────┘    └─────────────────────┘    └─────────────────────┘
                                                                 │
                           ┌─────────────────────────────────────┤
                           ▼                                     ▼
                ┌─────────────────────┐               ┌─────────────────────┐
                │ LOCATION DETAIL     │               │ MISSING COUNTS      │
                │ HEALTH CARD         │               │ & REMINDER BUTTONS  │
                ├─────────────────────┤               ├─────────────────────┤
                │ ❌ BROKEN           │               │ ❌ BROKEN           │
                │ No excuse status    │               │ Excused staff still │
                │ passed to this      │               │ counted as missing  │
                │ component           │               │                     │
                └─────────────────────┘               └─────────────────────┘
```

---

## Required Changes

### 1. LocationDetail.tsx - Pass Excuse Status to Health Card

**Current state**: The `LocationDetail` page embeds a `LocationHealthCard` but doesn't fetch or pass `excuseStatus`.

**Fix**: Import and use `useLocationExcuses` hook, pass excuse status to the health card.

```typescript
// Add to LocationDetail.tsx
const { getExcuseStatus } = useLocationExcuses(weekOf);
const excuseStatus = getExcuseStatus(locationId);

// Pass to LocationHealthCard
<LocationHealthCard 
  stats={locationStats} 
  excuseStatus={excuseStatus}
  submissionGates={submissionGates}
/>
```

### 2. CoachDashboardV2.tsx - Add Location Excuse Awareness

**Current state**: The `StatusPill` component only knows about `hasAll` and `hasAnyLate`. It has no concept of location-level excuses.

**Fix**: 

A. Accept optional `locationExcuseStatus` prop (map of locationId -> ExcuseStatus)
B. Update `StatusPill` to accept and display "Excused" status
C. Filter excused staff from "missing" counts used for reminder buttons
D. Show appropriate badge when metric is excused

```typescript
// Updated StatusPill signature
function StatusPill({ 
  hasAll, 
  hasAnyLate, 
  isExcused 
}: { 
  hasAll: boolean; 
  hasAnyLate: boolean;
  isExcused?: boolean;
}) {
  if (isExcused) {
    return (
      <Badge variant="secondary" className="bg-muted text-muted-foreground">
        Excused
      </Badge>
    );
  }
  // ... existing logic
}
```

### 3. CoachDashboardV2.tsx - Fetch Location Excuses

**Current state**: The component doesn't fetch any excuse data.

**Fix**: Fetch excuses for the selected week and build a lookup map.

```typescript
// Add to CoachDashboardV2
const { excuses } = useLocationExcuses(weekOfString);

// Build lookup map
const locationExcuseMap = useMemo(() => {
  const map = new Map<string, { confExcused: boolean; perfExcused: boolean }>();
  excuses.forEach(e => {
    const existing = map.get(e.location_id) || { confExcused: false, perfExcused: false };
    if (e.metric === 'confidence') existing.confExcused = true;
    if (e.metric === 'performance') existing.perfExcused = true;
    map.set(e.location_id, existing);
  });
  return map;
}, [excuses]);
```

### 4. CoachDashboardV2.tsx - Update Missing Counts

**Current state**: Missing counts include all staff with incomplete submissions.

**Fix**: Exclude staff whose location has the relevant metric excused.

```typescript
// Updated missing counts
const missingConfCount = sortedRows.filter(s => {
  const excuse = locationExcuseMap.get(s.location_id);
  if (excuse?.confExcused) return false; // Don't count as missing
  return s.conf_count < s.assignment_count;
}).length;

const missingPerfCount = sortedRows.filter(s => {
  const excuse = locationExcuseMap.get(s.location_id);
  if (excuse?.perfExcused) return false; // Don't count as missing
  return s.perf_count < s.assignment_count;
}).length;
```

### 5. RegionalDashboard.tsx - Adjust Location Stats Calculation

**Current state**: `calculateLocationStats` doesn't know about excuses, so stats include "missing" counts for excused locations.

**Fix**: When a location is fully excused, set its submission rate to 100% (or display "—") and zero out missing counts.

```typescript
// In the locationStats mapping
const locStats = calculateLocationStats(staff, gates);
const excuseStatus = getExcuseStatus(locId);

// Adjust stats based on excuse status
let adjustedSubmissionRate = locStats.submissionRate;
let adjustedMissingConf = locStats.missingConfCount;
let adjustedMissingPerf = locStats.missingPerfCount;
let adjustedPendingConf = locStats.pendingConfCount;

if (excuseStatus.isConfExcused) {
  adjustedMissingConf = 0;
  adjustedPendingConf = 0;
  // Recalculate submission rate excluding confidence...
}
if (excuseStatus.isPerfExcused) {
  adjustedMissingPerf = 0;
  // Recalculate submission rate excluding performance...
}

// If fully excused, show 100% or special indicator
const isFullyExcused = excuseStatus.isConfExcused && excuseStatus.isPerfExcused;
```

### 6. LocationSubmissionWidget.tsx - Check if Needs Update

The historical submission widget uses `get_staff_submission_windows` which is already updated. But need to verify the display handles excused weeks gracefully.

---

## Display Logic Summary

| Scenario | Location Card Badge | Staff Row Badge | Counted as Missing? |
|----------|---------------------|-----------------|---------------------|
| Conf excused, before Tue deadline | "Conf Excused" | "Excused" (conf column) | No |
| Conf excused, after Tue deadline | "Conf Excused" | "Excused" (conf column) | No |
| Perf excused, before Thu | "Perf Excused" | "Excused" (perf column) | No |
| Perf excused, after Thu | "Perf Excused" | "Excused" (perf column) | No |
| Both excused | "Excused: {reason}" | "Excused" (both columns) | No |
| Not excused, incomplete | "X Late/Missing" | "Missing" | Yes |

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/pages/dashboard/LocationDetail.tsx` | Import `useLocationExcuses`, pass `excuseStatus` and `submissionGates` to `LocationHealthCard` |
| `src/pages/coach/CoachDashboardV2.tsx` | Import `useLocationExcuses`, build excuse lookup map, update `StatusPill`, adjust missing counts, filter reminder recipients |
| `src/pages/dashboard/RegionalDashboard.tsx` | Adjust location stats when excused (zero out missing counts, adjust submission rate) |
| `src/lib/submissionStatus.ts` | (Optional) Add helper function `calculateLocationStatsWithExcuses(staff, gates, excuseStatus)` |

---

## Edge Cases Handled

1. **Partially excused** (conf only or perf only): Only the excused metric shows "Excused"; the other still shows actual status
2. **Location excused mid-week**: Immediately reflected in UI after cache invalidation
3. **Week navigation in Coach Dashboard**: Excuse status updates per-week as user navigates
4. **Mixed locations in view**: When org manager views multiple locations, each location's excuse status is evaluated independently
5. **Reminder emails**: Staff at excused locations are excluded from reminder recipient lists

---

## Summary

The core issue is that the excuse system was implemented at the UI layer for location cards but not propagated down to the staff roster table. The fix requires:

1. Fetching location excuses in `CoachDashboardV2`
2. Passing excuse context to the `StatusPill` component
3. Filtering missing counts to exclude excused staff
4. Updating the `LocationDetail` page to pass excuse status
5. Optionally adjusting aggregated stats to reflect excuses

This ensures consistent "Excused" display throughout the entire drill-down hierarchy: Regional Dashboard, Location Detail, Staff Roster.

