
# Add Optional "Start Date" to Invite Teammate Flow

## Summary

Add an optional date picker to the "Invite Teammate" dialog that allows managers to specify when a new user should be required to start submitting ProMoves. This sets the `participation_start_at` field in the staff record, enabling managers to invite people ahead of time while delaying their submission requirements.

## What Changes

### User Experience
- A new optional "Start Date" field appears below the Role selector in the invite dialog
- Presented as a simple date input with helper text explaining its purpose
- When left empty, the user's submission requirements follow the default logic (based on hire date + onboarding buffer)
- When set, submissions become required starting from that date

### How It Works
1. Manager opens "Invite Teammate" and fills in the required fields
2. Optionally selects a "Start Date" (e.g., next Monday, or 2 weeks from now)
3. On invite, the edge function saves this date to `participation_start_at` in the staff record
4. The new user receives their invite email immediately
5. Their ProMoves submission requirements don't kick in until the selected start date

---

## Technical Details

### Frontend Changes

**File: `src/components/admin/InviteUserDialog.tsx`**

1. Add `participation_start_at` to form state (as optional string in YYYY-MM-DD format)
2. Add a date input field below the Role selector with:
   - Label: "Start Date (optional)"
   - Helper text: "When left blank, submissions follow the standard onboarding timeline. Set a date to delay when ProMoves are required."
3. Include `participation_start_at` in the edge function payload when set

### Backend Changes

**File: `supabase/functions/admin-users/index.ts`**

1. Accept optional `participation_start_at` parameter in the `invite_user` action
2. When inserting the staff record, include `participation_start_at` if provided

### Database

No schema changes needed - the `participation_start_at` column already exists in the `staff` table as a nullable `timestamp with time zone`.

### Code Snippets

**Frontend form state addition:**
```typescript
const [formData, setFormData] = useState({
  email: "",
  name: "",
  organization_id: "",
  role_id: "",
  location_id: "",
  participation_start_at: "", // New optional field
});
```

**Frontend date input:**
```tsx
<div className="space-y-2">
  <Label htmlFor="start-date">Start Date (optional)</Label>
  <Input
    id="start-date"
    type="date"
    value={formData.participation_start_at}
    onChange={(e) => setFormData({ ...formData, participation_start_at: e.target.value })}
  />
  <p className="text-xs text-muted-foreground">
    When left blank, submissions follow the standard onboarding timeline. 
    Set a date to specify when ProMoves become required.
  </p>
</div>
```

**Edge function modification (invite_user action):**
```typescript
const { email, name, role_id, location_id, participation_start_at } = payload ?? {};

// In staff insert:
.insert({ 
  name, 
  email, 
  role_id, 
  primary_location_id: location_id, 
  is_participant: true,
  is_office_manager: isOfficeManager,
  user_id: invite.user.id,
  participation_start_at: participation_start_at || null  // New field
})
```

### Existing System Integration

The `participation_start_at` field is already used throughout the app for filtering staff accountability. The pattern `week_start_date >= COALESCE(participation_start_at::date, hire_date)` is already in place in views like `view_staff_submission_windows`, so setting this field during invite will automatically integrate with:
- Submission tracking
- On-time rate calculations  
- Week visibility filtering
