

# Redesign Delivery Tab: Expandable Rows with Staff-Level Actions

## What Changes

The current 10-column table is replaced with a cleaner, expandable layout. Each location row shows a compact summary and can be expanded to reveal individual staff members with status pills and per-staff delivery actions.

### Location Row (collapsed)
5 columns instead of 10:
- **Location** (with expand chevron)
- **Organization**
- **Coverage** -- e.g. "8/10 submitted" (merges Staff + Submitted + Coverage into one readable cell)
- **Release status** -- badge: "Released" / "Partial" / "Not released" / "No evals"
- **Actions** -- dropdown with "Release All" and "Hide All" (same bulk actions as today)

### Location Row (expanded)
Indented list of staff members showing:
- **Staff name**
- **Status pill** indicating progress:
  - "No eval" (gray outline) -- no evaluation exists
  - "Draft" (amber outline) -- eval in draft
  - "Not released" (gray) -- submitted but not visible
  - "Released" (blue) -- visible, not yet viewed
  - "Viewed" (amber) -- viewed but not acknowledged
  - "Reviewed" (green) -- acknowledged
  - "Focus set" (green + icon) -- acknowledged with focus selected
- **Individual action button** -- appears for staff with submitted but unreleased evals:
  - "Release" button to deliver that single evaluation
  - "Hide" option if already released

This lets a coach release evaluations one at a time as they finish them, or release the whole location at once.

### Filter Chips
Simplified to match the new status vocabulary: All, Not released, Released, Viewed, Reviewed, Focus set.

---

## Technical Details

### 1. Update `useEvalDeliveryProgress` hook

Expand the evaluations query to include `staff_id` and join staff name. Add a `staffDetails` array to `LocationProgress`:

```
staffDetails: Array<{
  staffId: string;
  staffName: string;
  evalId: string | null;
  status: 'no_eval' | 'draft' | 'not_released' | 'released' | 'viewed' | 'reviewed' | 'focus_set';
}>
```

The hook already fetches active staff per location and evaluations per location. The change is:
- Staff query: also select `id, first_name, last_name` (not just `primary_location_id`)
- Evaluations query: also select `staff_id`
- Cross-reference to build per-staff status, including staff with no eval record

### 2. Rewrite `DeliveryTab.tsx`

- Replace the `<Table>` with a list of collapsible location cards (using Radix Collapsible, already installed)
- Each collapsed row is a simple flex layout with the 5 summary fields
- Expanded section shows the staff list with pills
- Location-level "Release All" / "Hide All" use existing `bulkSetVisibilityByLocation`
- Staff-level "Release" / "Hide" use existing `setEvaluationVisibility` (single eval RPC)
- Both actions already exist in `src/lib/evaluations.ts` and route through the correct RPCs

### 3. Add `DeliveryStatusPill` component

A small inline component that maps status to a colored Badge. Reused for each staff row.

### Files Changed
- `src/hooks/useEvalDeliveryProgress.tsx` -- add staff-level detail
- `src/components/admin/eval-results-v2/DeliveryTab.tsx` -- full redesign

No new RPCs, migrations, or dependencies needed. All delivery actions already exist.

