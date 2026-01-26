
# Location-Level Excuse System for Weather Closures

## Overview

Implement a "1-click" location excuse system that allows org managers or super admins to excuse an entire location's staff from confidence and/or performance submissions for a specific week. This mirrors the existing individual excuse functionality but operates at the location level.

---

## Database Design

### New Table: `excused_locations`

```sql
CREATE TABLE public.excused_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id UUID NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  week_of DATE NOT NULL,
  metric TEXT NOT NULL CHECK (metric IN ('confidence', 'performance')),
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  UNIQUE(location_id, week_of, metric)
);
```

This follows the same pattern as `excused_submissions` but keys on `location_id` instead of `staff_id`.

### RLS Policies

- **SELECT**: Authenticated users can view all location excuses (needed for UI checks)
- **INSERT/DELETE**: Only super admins or org admins can manage (using existing `is_admin()` helper)

---

## RPC Modification

### Update `get_staff_submission_windows`

Add a second `NOT EXISTS` check to filter out location-level excuses:

```sql
AND NOT EXISTS (
  SELECT 1 FROM excused_locations el
  WHERE el.location_id = v.location_id
    AND el.week_of = v.week_of
    AND el.metric = v.metric
)
```

This ensures that when a location is excused, all staff submissions for that week/metric are automatically removed from expected counts—no individual entries needed.

---

## UI Implementation

### Location: Regional Command Center (`LocationHealthCard`)

Add a three-dots dropdown menu to each location card in the Regional Dashboard.

```text
┌─────────────────────────────────────┐
│ South Phoenix           ⋮          │  ← New dropdown trigger
│ 12 Active Staff                    │
│                                    │
│ This Week: 45%                     │
│ [4 Late Conf] [2 Missing Perf]     │
└─────────────────────────────────────┘

Dropdown Menu:
┌─────────────────────────────────────┐
│ ✓ Excuse Confidence (this week)    │
│ ✓ Excuse Performance (this week)   │
│ ─────────────────────────────────── │
│ ✓ Excuse Both                      │
│ ─────────────────────────────────── │
│ ✗ Remove All Excuses (destructive) │
└─────────────────────────────────────┘
```

### Visual Indicator

When a location has excuses active for the current week, show a badge:

```text
┌─────────────────────────────────────┐
│ South Phoenix   [⚡ Weather Closed] │
│ 12 Active Staff                    │
│                                    │
│ This Week: --                      │
│ [Location Excused]                 │
└─────────────────────────────────────┘
```

Or show which metrics are excused:
- `[Conf Excused]` (amber badge)
- `[Perf Excused]` (amber badge)
- `[Fully Excused]` (if both)

---

## Data Flow

```text
┌──────────────────────────────────────────────────────────────────┐
│                      REGIONAL DASHBOARD                          │
│                                                                  │
│   LocationHealthCard                                             │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │  Three-dots menu → ExcuseLocationDialog                 │   │
│   │                    ↓                                    │   │
│   │              INSERT into excused_locations              │   │
│   └─────────────────────────────────────────────────────────┘   │
│                           ↓                                      │
│              Cache Invalidation (React Query)                    │
│                           ↓                                      │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│                    SUBMISSION CALCULATIONS                       │
│                                                                  │
│   get_staff_submission_windows RPC                               │
│   ├─ Filters out individual excused_submissions                 │
│   └─ NEW: Filters out excused_locations by location_id          │
│                           ↓                                      │
│   Staff at excused location → No expected submissions for week   │
│   → On-time/completion rates unaffected by "missing" data        │
└──────────────────────────────────────────────────────────────────┘
```

---

## Component Changes

### 1. `LocationHealthCard.tsx`

- Add dropdown menu trigger (three-dots icon)
- Import `DropdownMenu` components
- Accept new props: `onExcuseLocation`, `excuseStatus` (to show current excuse state)

### 2. `RegionalDashboard.tsx`

- Query `excused_locations` for current week
- Pass excuse status to each `LocationHealthCard`
- Handle excuse mutations with cache invalidation

### 3. New Hook: `useLocationExcuses.tsx`

```typescript
// Fetches excused_locations for the current week
// Returns { isConfExcused, isPerfExcused } per location
// Provides mutation for toggling excuses
```

---

## Permission Model

| Action | Super Admin | Org Admin | Coach | Participant |
|--------|-------------|-----------|-------|-------------|
| View location excuses | ✓ | ✓ | ✓ | ✗ |
| Add/remove location excuse | ✓ | ✓ | ✗ | ✗ |

Coaches can see that a location is excused (explains missing data) but cannot modify.

---

## Optional Enhancement: Reason Field

Add a text input for the excuse reason (e.g., "Weather closure - ice storm"):

```text
┌─────────────────────────────────────────┐
│ Excuse Location This Week               │
│                                         │
│ [ ] Confidence                          │
│ [ ] Performance                         │
│                                         │
│ Reason (optional):                      │
│ ┌─────────────────────────────────────┐ │
│ │ Weather closure - ice storm         │ │
│ └─────────────────────────────────────┘ │
│                                         │
│          [Cancel]  [Excuse Location]    │
└─────────────────────────────────────────┘
```

This could be a simple dialog rather than inline menu items if you want the reason capture.

---

## Implementation Summary

| Component | Change |
|-----------|--------|
| **Migration** | Create `excused_locations` table + RLS |
| **Migration** | Update `get_staff_submission_windows` RPC |
| **Hook** | New `useLocationExcuses` for fetching/mutating |
| **LocationHealthCard** | Add dropdown menu + excuse badges |
| **RegionalDashboard** | Wire up excuse queries + mutations |

---

## Alternative Considered: Bulk Insert Individual Excuses

Instead of a new table, we could insert individual `excused_submissions` rows for every staff member at the location. However, this approach has drawbacks:
- More database writes (12 staff × 2 metrics = 24 rows vs. 2 rows)
- Harder to "undo" as a bulk action
- Doesn't distinguish "location closed" from "individual was excused"
- New staff hired during the week wouldn't be automatically covered

The location-level table is cleaner and more semantically accurate.
