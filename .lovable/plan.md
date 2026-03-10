

## Current State

The DoctorDetail page currently has three separate sections:
1. **DoctorDetailOverview** — action cards (release baseline, build prep, invite to schedule, etc.)
2. **DoctorDetailThread** — a list of session cards with status badges and expandable details
3. **Growth Timeline** and **Baseline** as collapsible sections below

### Bugs to fix
- `doctor_prep_submitted` is missing from `statusLabels` in DoctorDetailThread, so it shows the raw status string
- `doctor_prep_submitted` is not in the `canCapture` list, so "Start Meeting" button doesn't appear when it should
- The "Build Meeting Agenda" card in DoctorDetailOverview still shows even after the doctor has submitted prep (because `canBuildPrep` only checks for `scheduled`/`director_prep_ready`/`scheduling_invite_sent` statuses, not `doctor_prep_submitted`)

### Proposed Redesign: Thread as the Single Hub

Merge DoctorDetailOverview's action cards **into** the thread so each session row is self-contained. The page becomes:

```text
[Header + Status Pill]
[Next Action Panel]
[+ Add Check-in] button          ← creates a new follow-up session
[Session Row: Check-in #1]       ← newest first (desc by sequence_number)
[Session Row: Baseline Review]   ← always present once created
[Growth Timeline — collapsible]
[Baseline Assessment — collapsible]
```

Each **Session Row** (collapsible card) surfaces the right actions based on its status:

| Status | Badge Label | Actions Available |
|---|---|---|
| `scheduled` | Draft | "Build Agenda" button |
| `director_prep_ready` | Agenda Ready | "Invite to Schedule" + "Edit Agenda" |
| `scheduling_invite_sent` | Pending Scheduling | "Start Meeting" button |
| `doctor_prep_submitted` | Doctor Prepped | "Start Meeting" button |
| `doctor_revision_requested` | Doctor Left a Note | "Start Meeting" button |
| `meeting_pending` | Summary Shared | (expandable: prep + record) |
| `doctor_confirmed` | Confirmed | (expandable: prep + record) |

When expanded, each row shows: prep view (CombinedPrepView), meeting record, action steps — same as today.

### Implementation Plan

**1. Fix immediate bugs in DoctorDetailThread**
- Add `doctor_prep_submitted` to `statusLabels` (label: "Doctor Prepped", green/amber styling)
- Add `doctor_prep_submitted` to `canCapture` so "Start Meeting" appears
- Add `doctor_prep_submitted` to `isExpandable`

**2. Merge action buttons into SessionCard**
- Add "Build Agenda" button for `scheduled` status (opens DirectorPrepComposer)
- Add "Invite to Schedule" + "Edit Agenda" for `director_prep_ready`
- Keep "Start Meeting" for `scheduling_invite_sent`, `doctor_prep_submitted`, `doctor_revision_requested`
- Thread component receives new props: `doctorStaffId`, `doctorEmail`, `onPrepSession` callback

**3. Add "Add Check-in" button to the thread header**
- Renders above the session list
- Only visible when no session is in an active mid-flow status (`scheduled`, `director_prep_ready`, `scheduling_invite_sent`, `doctor_prep_submitted`)
- Creates a new `coaching_session` row with `session_type: 'follow_up'` and next `sequence_number`

**4. Simplify DoctorDetailOverview → only pre-session actions**
- Keep: Release Baseline card (pre-journey)
- Keep: Notify Doctor card (optional, pre-first-session)
- Remove: "Build Meeting Agenda" card (moved to thread)
- Remove: "Invite to Schedule" card (moved to thread)
- Remove: "Pending scheduling" card (moved to thread)
- Remove: "Continue building agenda" card (moved to thread)

**5. Sort thread descending** (newest first, which is already the query order)

### Files to modify
- `src/components/clinical/DoctorDetailThread.tsx` — major: add statuses, inline actions, "Add Check-in" button, accept new props for prep/invite flows
- `src/components/clinical/DoctorDetailOverview.tsx` — simplify to only baseline-release and notify-doctor cards
- `src/pages/clinical/DoctorDetail.tsx` — pass additional props to thread, remove separate Overview section header if empty
- No database changes needed; no new tables or columns

