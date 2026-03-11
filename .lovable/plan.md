

# Audit and Unify the Coaching Session State Labels

## Problem

There are **three independent status label maps** across the codebase, each showing different text for the same underlying `coaching_sessions.status` value:

| `status` value | Journey Pill (doctorStatus.ts) | Thread (DoctorDetailThread) | Timeline (DoctorGrowthTimeline) |
|---|---|---|---|
| `scheduled` | "Scheduled" | "Draft" | "Draft" |
| `director_prep_ready` | "Prep Complete — Ready to Invite" | "Agenda Ready" | "Send Invite" |
| `scheduling_invite_sent` | "Pending Scheduling" | "Invite Sent" | "Invite Sent" |
| `doctor_prep_submitted` | "Doctor Prep Submitted" | "Doctor Prepped" | "Ready for Meeting" |
| `meeting_pending` | "Summary Shared" | "Summary Shared" | "Awaiting Confirmation" |
| `doctor_confirmed` | "Baseline Review Complete" / "Follow-up N Complete" | "Confirmed" | "Confirmed" |
| `doctor_revision_requested` | "Summary Shared — Doctor Left a Note" | "Doctor Left a Note" | "Revision Requested" |

The user's specific complaint: `doctor_confirmed` shows "Confirmed" in the timeline/thread, but should say "Completed" since the meeting is done.

## Proposed Canonical Labels

One unified set of human-readable labels, used everywhere:

| `status` | Label | Color | Rationale |
|---|---|---|---|
| `scheduled` | Draft | muted | Session created, no agenda yet |
| `director_prep_ready` | Agenda Ready | amber | Coach finished prep, ready to send invite |
| `scheduling_invite_sent` | Invite Sent | blue | Doctor received scheduling link |
| `doctor_prep_submitted` | Doctor Prepped | emerald | Doctor submitted their prep |
| `meeting_pending` | Summary Shared | purple | Coach shared meeting summary |
| `doctor_confirmed` | Completed | green | Doctor acknowledged, session done |
| `doctor_revision_requested` | Doctor Left a Note | amber | Doctor responded with feedback |

## Changes

### 1. Create shared status config (`src/lib/coachingSessionStatus.ts`)

New file exporting a single canonical map:

```typescript
export const SESSION_STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  scheduled:                  { label: 'Draft',              className: 'bg-muted text-muted-foreground' },
  director_prep_ready:        { label: 'Agenda Ready',       className: 'bg-amber-100 text-amber-800' },
  scheduling_invite_sent:     { label: 'Invite Sent',        className: 'bg-blue-100 text-blue-800' },
  doctor_prep_submitted:      { label: 'Doctor Prepped',     className: 'bg-emerald-100 text-emerald-800' },
  meeting_pending:            { label: 'Summary Shared',     className: 'bg-purple-100 text-purple-800' },
  doctor_confirmed:           { label: 'Completed',          className: 'bg-green-100 text-green-800' },
  doctor_revision_requested:  { label: 'Doctor Left a Note', className: 'bg-amber-100 text-amber-800' },
};
```

### 2. Update `DoctorDetailThread.tsx`

- Remove the local `statusLabels` map (lines 27-35)
- Import from `@/lib/coachingSessionStatus`

### 3. Update `DoctorGrowthTimeline.tsx`

- Remove the local `SESSION_STATUS_CONFIG` map (lines 18-26)
- Import from `@/lib/coachingSessionStatus`
- Add dark mode variants in the shared config

### 4. Update `doctorStatus.ts`

- For `doctor_confirmed`, change label from "Baseline Review Complete" / "Follow-up N Complete" to just "Completed" to match
- The journey pill already uses its own richer labels for pre-session stages (baseline flow), which is fine — those are journey-level, not session-level. But for session-derived statuses, align the labels.
- Specifically update:
  - `doctor_confirmed` → label: "Completed" (both baseline review and followup cases)
  - `director_prep_ready` → label: "Agenda Ready"

### 5. Summary of label changes by location

- **Thread "Confirmed" → "Completed"**
- **Timeline "Confirmed" → "Completed"**
- **Timeline "Awaiting Confirmation" → "Summary Shared"**
- **Timeline "Revision Requested" → "Doctor Left a Note"**
- **Timeline "Send Invite" → "Agenda Ready"**
- **Journey pill "Baseline Review Complete" → "Completed"**
- **Journey pill "Follow-up N Complete" → "Completed"**
- **Journey pill "Prep Complete — Ready to Invite" → "Agenda Ready"**

This gives users a single, consistent vocabulary across every view of the coaching lifecycle.

