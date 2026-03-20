

# Support Location-less Admin Users in the Invite Flow

## Problem
The current invite dialog requires Group and Location for every user. Central office admins (e.g., regional coordinators, data analysts) don't belong to a specific clinic location and shouldn't need a clinical role. They are also never participants.

## Solution
Add an early branching question at the top of the invite form and adjust the backend to accept invites without a `location_id`.

## Changes

### 1. Frontend: `src/components/admin/InviteUserDialog.tsx`
- Add a toggle/radio at the top: **"Will this person work at a clinic location?"**
  - **Yes (default)**: Current flow — Group, Location required; participant enrollment available; role optional.
  - **No (Central office / Admin)**: Hide Group, Location, Role, and participant enrollment sections. Auto-expand the permissions panel. `is_participant` forced to `false`.
- Update `isFormValid`: only require `email` + `name` when the user is a central-office admin. At least one capability must be selected (they need some reason to exist in the system).
- When submitting without a location, do NOT send `location_id`. Instead, send the caller's `organization_id` so the edge function can resolve org membership.

### 2. Backend: `supabase/functions/admin-users/index.ts` — `invite_user` action
- Relax the `location_id` requirement: accept either `location_id` OR `organization_id`.
- When `location_id` is absent but `organization_id` is provided:
  - Skip the location-based org ownership check; instead verify the `organization_id` matches the caller's org (unless super admin).
  - Pick the first active location in that org as a "home" `primary_location_id` for the staff record (the staff table has a NOT NULL constraint on this column). Alternatively, set it to a designated "central" location — but using the first available location is simpler and avoids schema changes.
- The rest of the flow (auth invite, staff insert, capabilities insert) stays the same.

### 3. No database migration needed
The `staff.primary_location_id` column is NOT NULL, so we still assign one — we just auto-select it from the org rather than requiring the user to choose. No schema changes required.

## Technical Details

**Frontend validation change:**
```
// Central office admin: just need email + name + at least one capability
const isFormValid = isCentralOffice
  ? !!email && !!name && hasAnyCapability
  : !!email && !!name && !!location_id && (!isParticipant || !!roleId);
```

**Edge function change (invite_user):**
- Accept `organization_id` as an alternative to `location_id`
- When only `organization_id` is provided, resolve a default location: `practice_groups` → `locations` (first active one)
- Use that resolved location as `primary_location_id`

**UI flow:**
```text
┌─────────────────────────────────┐
│  Email *                        │
│  Name *                         │
│                                 │
│  ○ Clinic staff (default)       │
│  ○ Central office / Admin       │
│                                 │
│  [if clinic: Group, Location,   │
│   Role, Participant toggle]     │
│                                 │
│  [if central: permissions       │
│   panel auto-expanded]          │
│                                 │
│  [Send invite]                  │
└─────────────────────────────────┘
```

