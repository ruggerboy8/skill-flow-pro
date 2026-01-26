
# Enhanced Location Excuse System

## Overview

Replace the current three-dot dropdown menu on location cards with a centralized "Excuse Submissions" button in the dashboard header. This button opens a wizard dialog that allows org managers and super admins to:

1. Select a specific week (not just current week)
2. Multi-select locations they oversee
3. Choose which metric(s) to excuse (Confidence, Performance, or both)
4. View existing excuses for selected locations
5. Optionally add a reason (e.g., "Weather closure")

---

## UI Changes

### 1. Regional Dashboard Header

Add an "Excuse Submissions" button next to the location count badge:

```
┌─────────────────────────────────────────────────────────────────────┐
│ Regional Command Center                                             │
│ Week of Jan 27, 2025                              [3 Locations]     │
│                                          [Excuse Submissions]       │
└─────────────────────────────────────────────────────────────────────┘
```

The button only appears for users with `canManageExcuses` (super admin or org admin).

### 2. Excuse Submissions Dialog (Wizard)

A dialog with the following sections:

```
┌─────────────────────────────────────────────────────────────────────┐
│ Excuse Submissions                                              [X] │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│ Week                                                                │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ [◄] Week of Jan 27, 2025                                    [►] │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│ Locations                                                           │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ [South Phoenix ✕] [Mesa ✕]              Select locations...     │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│ Metrics to Excuse                                                   │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ [✓] Confidence                                                  │ │
│ │ [✓] Performance                                                 │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│ Reason (optional)                                                   │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ Weather closure - ice storm                                     │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│ ─────────────────────────────────────────────────────────────────── │
│                                                                     │
│ Current Status for Selected Week:                                   │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ South Phoenix:   [Conf ✓] [Perf ✓]  ← Already fully excused     │ │
│ │ Mesa:            [Conf ✓] [Perf —]  ← Conf excused only         │ │
│ │ Gilbert:         [Conf —] [Perf —]  ← No excuses                │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│                               [Cancel]  [Apply Excuses]             │
└─────────────────────────────────────────────────────────────────────┘
```

### 3. LocationHealthCard Updates

- **Remove**: Three-dot dropdown menu and all excuse toggle callbacks
- **Keep**: Visual badges showing excuse status
- **Enhance**: Show contextual badge based on submission period:
  - Before Tuesday 2pm (confidence period): Show "Conf Excused: Weather" if confidence is excused
  - After Thursday (performance period): Show "Perf Excused: Weather" if performance is excused
  - If both excused: Show "Excused: Weather" (single badge)

---

## Component Changes

### New Component: `ExcuseSubmissionsDialog.tsx`

Located at: `src/components/dashboard/ExcuseSubmissionsDialog.tsx`

Features:
- Week navigation with chevron buttons (prev/next week)
- MultiSelect for locations (filtered to managed locations)
- Checkboxes for Confidence and Performance
- Optional reason text input
- Real-time status display showing existing excuses for selected week
- Submit button that creates/updates excuses in batch

### Modified: `LocationHealthCard.tsx`

- Remove dropdown menu imports and code
- Remove excuse action props (`onToggleExcuse`, `onExcuseBoth`, `onRemoveAllExcuses`)
- Keep `excuseStatus` prop for display purposes
- Add `submissionGates` prop to show contextual badges
- Update badge logic to show reason and be period-aware

### Modified: `RegionalDashboard.tsx`

- Add dialog state management
- Add "Excuse Submissions" button in header (conditionally rendered)
- Remove per-card excuse handlers
- Pass `submissionGates` to each LocationHealthCard

### Modified: `useLocationExcuses.tsx`

- Update to accept optional `weekOf` parameter (for fetching any week)
- Add new mutation: `bulkExcuseLocations` for batch operations
- Keep existing query logic but make it more flexible

---

## Data Flow

```
User clicks "Excuse Submissions"
        ↓
Dialog opens with current week selected
        ↓
User selects week (can navigate to past weeks)
        ↓
Dialog fetches excused_locations for that week
        ↓
User multi-selects locations
        ↓
Status panel shows which are already excused
        ↓
User checks Confidence/Performance boxes
        ↓
User clicks "Apply Excuses"
        ↓
Batch INSERT into excused_locations (skip already-excused)
        ↓
Cache invalidation → UI updates
```

---

## Submission Period Logic for Badges

The LocationHealthCard will receive `submissionGates` and display contextual badges:

```typescript
// Before confidence deadline (before Tue 2pm):
// - Primary focus is confidence, so show conf excuse status prominently

// After performance opens (after Thu 00:01):
// - Primary focus is performance, so show perf excuse status prominently

// Badge display logic:
if (isFullyExcused) {
  // Show single "Excused" badge with reason
} else if (isConfExcused && !isPastConfidenceDeadline) {
  // During confidence period, show "Conf Excused: {reason}"
} else if (isPerfExcused && isPerformanceOpen) {
  // During performance period, show "Perf Excused: {reason}"
}
```

---

## Technical Details

### Week Navigation

Use existing `getWeekAnchors` pattern with `addDays(monday, -7)` and `addDays(monday, 7)` for navigation. Format week display using `formatInTimeZone(mondayZ, CT_TZ, 'MMM d, yyyy')`.

### Location Filtering

Super admins see all locations. Org admins see locations from their managed organizations. Query locations table filtered by `managedOrgIds`.

### Batch Excuse Mutation

```typescript
async function bulkExcuseLocations({
  locationIds: string[],
  weekOf: string,
  metrics: ('confidence' | 'performance')[],
  reason?: string
}) {
  // For each location + metric combo, check if already exists
  // Insert only new combinations
  // Use upsert with on_conflict to handle edge cases
}
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/components/dashboard/ExcuseSubmissionsDialog.tsx` | New component - wizard dialog |
| `src/components/dashboard/LocationHealthCard.tsx` | Remove dropdown, add contextual badges |
| `src/pages/dashboard/RegionalDashboard.tsx` | Add button, wire up dialog |
| `src/hooks/useLocationExcuses.tsx` | Add bulk mutation, flexible week param |

---

## Edge Cases Handled

1. **Already excused**: Status panel shows existing excuses; submission skips duplicates
2. **Mixed states**: Some locations excused for confidence only - clearly shown in status
3. **Past weeks**: Can excuse a past week retroactively (for late documentation)
4. **Remove excuses**: Not in scope for this wizard (keep manual removal via different flow if needed, or add a "Remove" section later)
