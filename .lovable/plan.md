

# Plan: Session Ownership + Duplicate Prevention + Data Cleanup

## Current State

Dr. Johno has 3 coaching sessions:
- **Session 1** (seq 1): Created by Dr. Alex Otto → status `meeting_pending`, has selections + meeting record
- **Session 2** (seq 1): Created by Johno Oberly → status `scheduled`, no selections (duplicate)
- **Session 3** (seq 2): Created by Dr. Alex Otto → status `scheduled`, no selections

The duplicate happened because two clinical directors both clicked "Build Agenda" independently.

## Architecture: Ownership on Action

Per user choices: open access, ownership on action, read-only for non-owners, super admins get read-only + reassign.

### Database Changes

**1. Add unique constraint to prevent duplicate sessions per doctor per sequence number:**
```sql
ALTER TABLE coaching_sessions 
ADD CONSTRAINT uq_doctor_sequence UNIQUE (doctor_staff_id, sequence_number);
```

**2. Clean up duplicate data:**
- Delete session `549ddaec` (Johno's duplicate seq 1, no child data)

### Code Changes

**3. `DoctorDetailThread.tsx` — Ownership-aware UI**

The session already stores `coach_staff_id`. Compare it to `myStaff.id`:
- If `session.coach_staff_id !== myStaff.id`: hide "Build Agenda", "Start Meeting", "Delete" buttons. Show a read-only badge like "Managed by [coach name]".
- The "Add Coaching Session" button inserts with `coach_staff_id = myStaff.id`, so the unique constraint prevents duplicates at seq level.

Need to fetch `coach_staff_id` + coach name in the sessions query (currently only fetches `id, session_type, sequence_number, status, scheduled_at, meeting_link`).

**4. `DoctorDetail.tsx` — Pass coach info through**

Update the sessions query to include `coach_staff_id` and join `staff.name` for the coach. Pass this down to `DoctorDetailThread`.

**5. `DirectorPrepComposer.tsx` — Read-only guard**

When the session's `coach_staff_id !== myStaff.id`, render the prep in read-only mode (show agenda HTML, selections, but disable editing/publishing). Currently it freely edits any session.

**6. `MeetingOutcomeCapture.tsx` — Read-only guard**

Same pattern: if the session belongs to another coach, show the outcome summary read-only.

**7. `DoctorManagement.tsx` — No filtering changes**

Per "open access" choice, all clinical directors see all doctors. No scoping needed here.

**8. Super admin reassign**

Add a small "Reassign Coach" dropdown (visible only to super admins) on the session card that updates `coaching_sessions.coach_staff_id`. This lets super admins transfer ownership without creating duplicates.

### Session Interface Update

Add `coach_staff_id` and `coach_name` to the `Session` interface used by `DoctorDetailThread`:

```typescript
interface Session {
  id: string;
  session_type: string;
  sequence_number: number;
  status: string;
  scheduled_at: string | null;
  meeting_link?: string | null;
  coach_staff_id: string;
  coach_name?: string;
}
```

### Files to Modify

1. **Migration** — unique constraint + delete duplicate row
2. **`src/pages/clinical/DoctorDetail.tsx`** — expand sessions query to include `coach_staff_id` and coach name
3. **`src/components/clinical/DoctorDetailThread.tsx`** — ownership-aware action buttons, "Managed by" badge, reassign UI for super admins
4. **`src/components/clinical/DirectorPrepComposer.tsx`** — read-only guard when not owner
5. **`src/components/clinical/MeetingOutcomeCapture.tsx`** — read-only guard when not owner

### Summary of Behavior

| Actor | Can see doctors | Can create sessions | Can edit sessions | Can reassign |
|-------|----------------|--------------------|--------------------|-------------|
| Clinical Director | All | Yes (owns new ones) | Only their own | No |
| Super Admin | All | Yes (owns new ones) | Only their own | Yes |

