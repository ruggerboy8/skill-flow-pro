
# Implementation Plan: Three Admin/UI Fixes

This plan addresses three issues you reported:

1. **Staff location changes in admin panel** - Enable org admins and super admins to change staff locations
2. **Completion rates widget for Office Managers** - Fix the widget not loading on the "My Location" page
3. **Home page CTA skip logic** - Allow skipping confidence submission when only confidence is excused

---

## Issue 1: Staff Location Changes in Admin Panel

### Current State
The `EditUserDrawer` component shows name, email, hire date, role presets, and pause controls, but **lacks a location selector**. The backend `admin-users` edge function already supports `location_id` in the `update_user` action (line 280-307), but the UI doesn't expose this field.

### Solution
Add a location dropdown to the `EditUserDrawer` component that allows org/super admins to change a staff member's `primary_location_id`.

### Changes Required
- **`src/components/admin/EditUserDrawer.tsx`**:
  - Add state for `selectedLocationId` initialized from `user.location_id`
  - Add a `<Select>` dropdown with all available locations (grouped by organization for clarity)
  - Include the `location_id` in the payload when calling `admin-users` with `action: 'update_user'`
  - Placed between the Email field and Hire Date field for logical grouping

---

## Issue 2: Completion Rates Widget for Office Managers

### Current State
The `LocationSubmissionWidget` calls `get_staff_submission_windows` RPC for each staff member in the location. This RPC depends on `view_staff_submission_windows`, which queries the `staff` table.

The issue is that the underlying view and RPC have RLS applied, and Office Managers may not have the proper read permissions on the data needed for the widget.

### Root Cause
The `get_staff_submission_windows` function uses `SECURITY DEFINER` mode, which should bypass RLS. However, when the widget fetches staff IDs first (lines 48-53 in `LocationSubmissionWidget.tsx`), it queries the `staff` table directly, which **does have RLS**.

Office Managers need read access to staff records in their scoped location.

### Solution
Add an RLS policy on the `staff` table allowing Office Managers to read staff in their scoped locations.

### Changes Required
- **Database Migration**:
  - Create a new RLS policy on `staff` table: "Office managers can read staff in their scoped locations"
  - The policy will check if the requesting user is an Office Manager with a matching location scope via `coach_scopes`

---

## Issue 3: Home Page CTA Skip Confidence When Excused

### Current State
The `computeWeekState` function in `locationState.ts` determines the current week state (e.g., `can_checkin`, `wait_for_thu`, `can_checkout`). It checks if confidence and performance scores are complete, but does not account for individual excused submissions.

When confidence is excused but performance is not, the user should skip directly to the performance state rather than being prompted to rate confidence.

### Root Cause
The state computation at lines 576-588 in `locationState.ts` calculates `confComplete` and `perfComplete` based on actual scores, but doesn't query the `excused_submissions` table to mark excused metrics as "complete."

### Solution
Modify `computeWeekState` to check for individual excused submissions and treat excused metrics as complete.

### Changes Required
- **`src/lib/locationState.ts`**:
  - After fetching the staff record, query `excused_submissions` for the current staff and week
  - If confidence is excused, set `confComplete = true`
  - If performance is excused, set `perfComplete = true`
  - This will cause the state machine to skip the excused step correctly

---

## Technical Details

### File Changes Summary

| File | Change |
|------|--------|
| `src/components/admin/EditUserDrawer.tsx` | Add location selector dropdown |
| `supabase/migrations/[new].sql` | Add RLS policy for Office Manager staff read access |
| `src/lib/locationState.ts` | Query excused_submissions and adjust completion flags |

### Database Migration SQL (Issue 2)

```sql
-- Allow Office Managers to read staff in their scoped locations
CREATE POLICY "Office managers can read staff in scoped locations"
  ON public.staff FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.staff s
      JOIN public.coach_scopes cs ON cs.staff_id = s.id
      WHERE s.user_id = auth.uid()
        AND s.is_office_manager = true
        AND cs.scope_type = 'location'
        AND cs.scope_id = staff.primary_location_id
    )
  );
```

### locationState.ts Changes (Issue 3)

```typescript
// After line 567 (const staffId = staff.id;)
// Query excused submissions for this staff and week
const { data: excusedSubmissions } = await supabase
  .from('excused_submissions')
  .select('metric')
  .eq('staff_id', staffId)
  .eq('week_of', mondayStr);

const excusedMetrics = new Set(
  (excusedSubmissions ?? []).map(e => e.metric)
);

// Later, after calculating confComplete/perfComplete:
// Apply excused overrides
if (excusedMetrics.has('confidence')) {
  confComplete = true;
}
if (excusedMetrics.has('performance')) {
  perfComplete = true;
}
```

---

## Testing Plan

1. **Location Change**: Edit a user in admin panel, change their location, verify the staff table updates
2. **OM Completion Widget**: Log in as the Office Manager, navigate to "My Location", verify the completion widget loads
3. **CTA Skip Logic**: Excuse a user's confidence for current week, verify the home page shows "Rate Performance" instead of "Rate Confidence"
