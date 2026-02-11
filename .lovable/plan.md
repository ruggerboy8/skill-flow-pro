

# Delivery Tab Layout Overhaul

## Summary

Replace the rigid 5-column grid layout with flexible, purpose-driven rows. The goal: location rows become "summary strips" with progress chips, staff rows become simple indented 3-part rows, and the whole thing reads like a triage dashboard.

## Changes

### 1. Add a Delivery Summary strip at the top

A thin line above the location list showing aggregate counts across all filtered locations:

"Not released: 32 -- Released: 18 -- Viewed: 9 -- Reviewed: 4 -- Focus: 2"

Computed from the filtered locations' staffDetails. Gives instant "are we in good shape?" signal.

### 2. Location row: flex-based summary strip (not grid)

Replace `grid grid-cols-[1rem_1fr_10rem_7rem_auto]` with a simple `flex items-center justify-between`.

**Left cluster** (flex, items-center, gap-2):
- Chevron
- Location name (font-medium)
- Org name (muted, text-sm)

**Middle cluster** (flex, gap-2): progress chips -- small inline badges showing:
- "Submitted 8/12" (always)
- "Released 6" (if > 0)
- "Viewed 4" (if > 0)
- "Reviewed 2" (if > 0)
- "Focus 1" (if > 0)

These replace both the "8/12 submitted" text and the ReleaseStatusBadge. The badge ("Partial", "Released") is now redundant since the chips tell you exactly where things stand.

**Right cluster** (flex, gap-1, shrink-0):
- "Release All" button -- only shown when there are unreleased submitted evals
- "Hide All" -- only shown when expanded (not in collapsed view)

### 3. Staff row: simple 3-part flex with indent

Replace the 5-column grid + 2 empty spacer divs with:

```
flex items-center justify-between pl-10 py-1.5 px-4
```

**Left** (flex, items-center, gap-2, min-w-0):
- Staff name (text-sm)
- Role (text-xs, muted)

**Middle**:
- DeliveryStatusPill (single pill)

**Right** (shrink-0):
- Release or Hide button (same as today, just no spacers)

### 4. Sort staff by "needs attention" order

Within each location, sort staff by this priority:
1. not_released (actionable -- needs release)
2. released (waiting on staff to view)
3. viewed (waiting on staff to review)
4. reviewed (waiting on staff to set focus)
5. focus_set (complete)
6. draft (not actionable from delivery tab)
7. no_eval (not actionable)

Within each group, alphabetical.

### 5. DeliveryStatusPill tweaks

- `reviewed`: switch to green outline only (border-green-500, no fill) to differentiate from `focus_set`
- `focus_set`: keep green filled background + star icon (visually "done")
- No other changes needed

### 6. Filter annotation

When `statusFilter !== 'all'`, show a small muted line under the location name in the expanded view: "Showing 3 of 16 staff (Viewed)" so the subset is clear.

### 7. Hide "Hide All" in collapsed state

Only show "Hide All" when the location card is expanded. "Release All" remains visible in collapsed state since it's the primary action.

---

## Technical Details

### Files changed

**`src/components/admin/eval-results-v2/DeliveryTab.tsx`**:
- Add `DeliverySummary` component -- computes counts from `filteredLocations[].staffDetails` and renders a single-line strip
- Rewrite `LocationCard` button from grid to flex with 3 clusters (left/middle/right)
- Remove `ReleaseStatusBadge` component (replaced by progress chips)
- Add progress chip computation: count staffDetails by status bucket per location
- Move "Hide All" inside `CollapsibleContent` instead of the trigger row
- Rewrite `StaffRow` from grid to `flex items-center justify-between pl-10`
- Remove the 2 empty spacer divs
- Add sort logic: define `STATUS_SORT_ORDER` map and sort `staffDetails` (or `filteredStaff`) before rendering
- When `statusFilter !== 'all'`, render a small annotation line showing "Showing X of Y staff (Status)"

**`src/components/admin/eval-results-v2/DeliveryStatusPill.tsx`**:
- Change `reviewed` config: remove `bg-green-50`, use outline-only style (`bg-transparent border-green-500 text-green-700`)
- Keep `focus_set` as-is (filled green + star)

No hook changes, no new dependencies.
