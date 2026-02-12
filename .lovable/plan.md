

# Clinical Director + Doctor Portal Redesign -- Full Plan (Phased Implementation)

This plan covers the entire redesign from status scaffolding through follow-up check-ins, organized into four implementation phases. Each phase ships and gets tested before moving to the next.

---

## Data Model

All coaching interactions share a single session model that supports baseline reviews and follow-up check-ins.

### New Tables

**`coaching_sessions`** -- one row per scheduled meeting

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| doctor_staff_id | uuid FK staff | |
| coach_staff_id | uuid FK staff | the clinical director |
| session_type | text | `baseline_review`, `followup` |
| sequence_number | smallint | 1 for baseline, 2+ for follow-ups |
| status | text | see status model below |
| scheduled_at | timestamptz | meeting date/time |
| meeting_link | text nullable | optional video/zoom link |
| coach_note | text | formatted HTML (Quill) |
| doctor_note | text nullable | plain text from doctor |
| created_at | timestamptz | |
| updated_at | timestamptz | |

**`coaching_session_selections`** -- ProMove picks (max 2 per role per session)

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| session_id | uuid FK coaching_sessions | |
| action_id | bigint FK | references doctor pro moves |
| selected_by | text | `coach` or `doctor` |
| display_order | smallint | 1 or 2 |
| created_at | timestamptz | |

Unique constraint: `(session_id, selected_by, display_order)`

**`coaching_meeting_records`** -- outcomes captured during/after the meeting

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| session_id | uuid FK coaching_sessions | |
| calibration_confirmed | boolean default false | |
| summary | text | director's meeting summary |
| experiments | jsonb | structured array of experiments |
| submitted_at | timestamptz | |
| doctor_confirmed_at | timestamptz nullable | locks record when set |
| doctor_revision_note | text nullable | if doctor requests edit |
| created_at | timestamptz | |

### Session Status Values

```text
scheduled -> director_prep_ready -> doctor_prep_submitted -> meeting_pending -> doctor_confirmed (locked)
                                                                  |
                                                          doctor_revision_requested (reopens)
```

### RLS Policies

- Coach can INSERT/UPDATE `coaching_sessions` when they are `coach_staff_id`
- Doctor can UPDATE only `doctor_note` and status transitions (`director_prep_ready` to `doctor_prep_submitted`)
- Doctor can UPDATE `coaching_meeting_records` only for `doctor_confirmed_at` and `doctor_revision_note`
- Both can SELECT their own sessions
- Coach private baseline (`coach_baseline_assessments`) remains restricted to clinical directors

---

## Derived Doctor Status

Rather than adding a status column, status is computed client-side from existing data. A utility function `getDoctorJourneyStatus()` checks in priority order:

1. Latest `coaching_sessions` status (follow-up or baseline review pending actions)
2. `coach_baseline_assessments` status (director baseline pending)
3. `doctor_baseline_assessments` status (baseline in progress / completed)
4. Fall back to `invited`

Returns a label + color + next action description for display across all pages.

---

## Phase A -- Status Visibility + Layout Scaffolding

### 1. Doctor Journey Status Utility

**New file:** `src/lib/doctorStatus.ts`

- `getDoctorJourneyStatus(baseline, coachBaseline, sessions[])` returns `{ label, variant, nextAction, nextActionUrl }`
- Maps all states: invited, baseline_in_progress, baseline_submitted, director_baseline_pending, baseline_review_scheduled, waiting_for_doctor_prep, prep_complete, meeting_pending, confirmed, followup_N_scheduled/completed

### 2. Doctor Management Table Upgrade

**Edit:** `src/pages/clinical/DoctorManagement.tsx`

- Replace "Baseline Status" column with "Stage" using the journey status pill
- Add "Next Action" column showing the computed next step
- Add "Next Meeting" column pulling from `coaching_sessions.scheduled_at`
- Add filter dropdown: "All", "Needs My Action", "Waiting on Doctor", by stage

### 3. Doctor Detail Tabs

**Edit:** `src/pages/clinical/DoctorDetail.tsx`

Replace the current single-scroll layout with three tabs:

- **Overview** tab: status header, next action card, upcoming meeting summary, latest commitments
- **Baseline** tab: existing baseline results + coach private assessment card (moved here)
- **Coaching Thread** tab: chronological timeline of all sessions (empty initially, populated in Phase B+)

### 4. Doctor Home Redesign

**Edit:** `src/pages/doctor/DoctorHome.tsx`

Replace baseline-only logic with a task-card system:

- **Primary CTA card**: computed from journey status (complete baseline, start prep, review meeting summary, etc.)
- **Upcoming meetings section**: lists scheduled sessions with date/time
- **Completed records section**: read-only links to past confirmed sessions
- Baseline card logic preserved but wrapped in the new card framework

---

## Phase B -- Baseline Review Cycle MVP

### 5. Schedule + Director Prep

**New file:** `src/components/clinical/MeetingScheduleDialog.tsx`

- Date/time picker + optional meeting link input
- On submit: creates `coaching_sessions` row with `status = 'scheduled'`
- Triggered from Doctor Detail Overview tab via "Schedule Baseline Review" button

**New file:** `src/components/clinical/DirectorPrepComposer.tsx`

- Shown after scheduling (or when editing a `scheduled` session)
- ProMove picker: checkboxes from doctor's baseline items, max 2 enforced client-side
- ReactQuill rich text editor for coach note
- "Ready for Doctor" button: inserts selections, updates status to `director_prep_ready`
- Confirmation banner: "Doctor can now see and complete their prep"

### 6. Doctor Prep

**New file:** `src/pages/doctor/DoctorReviewPrep.tsx`

- Route: `/doctor/review-prep/:sessionId`
- Shows coach's note (read-only HTML)
- Shows coach's ProMove selections as "suggested" chips
- Doctor picks 1-2 ProMoves (coach picks pre-highlighted)
- Plain text note textarea
- Submit: inserts doctor selections, updates doctor_note, status to `doctor_prep_submitted`

**Edit:** `src/pages/doctor/DoctorHome.tsx`

- Query `coaching_sessions` for pending prep. Show prep card when `status = 'director_prep_ready'`

### 7. Combined Prep View

**New file:** `src/components/clinical/CombinedPrepView.tsx`

- Reused by both coach (from Doctor Detail) and doctor (after submission)
- Meeting details, coach section (2 ProMoves + formatted note), doctor section (2 ProMoves + plain text note)
- Read-only shared agenda for the meeting

**Edit:** `src/App.tsx`

- Add route `/doctor/review-prep/:sessionId`

---

## Phase C -- Meeting Capture + Confirmation

### 8. Meeting Outcome Capture

**New file:** `src/components/clinical/MeetingOutcomeCapture.tsx`

- Context strip: date, participants, prep highlights
- Agenda ProMoves with overlap highlighted
- Calibration confirmed checkbox
- Experiments repeater: structured inputs for 1-2 experiments (title + description)
- Summary text area
- Submit: creates `coaching_meeting_records` row, updates session status to `meeting_pending`

Accessible from Doctor Detail Coaching Thread tab.

### 9. Doctor Confirmation

**New file:** `src/components/doctor/MeetingConfirmationCard.tsx`

- Doctor Home card: "Review meeting summary" when status is `meeting_pending`
- Opens read-only meeting record with "Confirm" and "Request Edit" buttons
- Confirm: sets `doctor_confirmed_at`, locks record
- Request Edit: sets `doctor_revision_note`, reopens to director

---

## Phase D -- Follow-ups + Thread Timeline

### 10. Follow-up Sessions

Reuse the same scheduling, prep, and capture flow with:

- `session_type = 'followup'` and incrementing `sequence_number`
- Director prep composer shows prior commitments/experiments from the previous session
- "Schedule Follow-up" button appears on Doctor Detail after baseline review is confirmed

### 11. Coaching Thread Timeline

**New file:** `src/components/clinical/CoachingThreadTimeline.tsx`

- Chronological list of all sessions for a doctor
- Each entry shows: type, date, status pill, key selections
- Click to expand into the combined view or meeting record
- Prior experiments carry forward with attempted/not-attempted indicators

### 12. Doctor History View

**Edit:** `src/pages/doctor/DoctorHome.tsx`

- "Completed records" section shows confirmed sessions as read-only cards
- Each links to the combined prep + meeting record

---

## Files Summary

### New Files

| File | Phase |
|------|-------|
| `src/lib/doctorStatus.ts` | A |
| `src/components/clinical/DoctorJourneyStatusPill.tsx` | A |
| `src/components/clinical/DoctorNextActionPanel.tsx` | A |
| `src/components/clinical/MeetingScheduleDialog.tsx` | B |
| `src/components/clinical/DirectorPrepComposer.tsx` | B |
| `src/components/clinical/CombinedPrepView.tsx` | B |
| `src/pages/doctor/DoctorReviewPrep.tsx` | B |
| `src/components/clinical/MeetingOutcomeCapture.tsx` | C |
| `src/components/doctor/MeetingConfirmationCard.tsx` | C |
| `src/components/clinical/CoachingThreadTimeline.tsx` | D |
| Migration SQL for `coaching_sessions`, `coaching_session_selections`, `coaching_meeting_records` | A (schema), B (RLS refinement) |

### Edited Files

| File | Phase | Change |
|------|-------|--------|
| `src/pages/clinical/DoctorManagement.tsx` | A | Stage column, next action, filters |
| `src/pages/clinical/DoctorDetail.tsx` | A | Tab layout (Overview / Baseline / Thread) |
| `src/pages/doctor/DoctorHome.tsx` | A+B | Task-card system, prep card |
| `src/App.tsx` | B | Add `/doctor/review-prep/:sessionId` route |

---

## UX Copy Guidelines

All copy uses coaching tone:

- "Experiments to try" not "assignments"
- "Discussion focus" not "deficiencies"  
- "Ready for doctor" helper: "Publishes this prep so the doctor can complete their part"
- "Prep complete" means "Both sides submitted. Ready for meeting."
- "Confirmed" means "Doctor reviewed and confirmed. Record locked."

---

## Implementation Order

We will build and ship Phase A first, then B, then C, then D. Each phase is testable independently. The database migration creates all tables up front so the schema is stable, but UI features are gated by which components exist.

