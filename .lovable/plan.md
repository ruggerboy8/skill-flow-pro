

## Batch of UI/UX Improvements

This plan covers 8 distinct changes across multiple files.

### 1. Rename Tabs in Doctor Detail (DoctorDetail.tsx)
- "Overview" becomes "Up Next"
- "Coaching Thread" becomes "Coaching" and moves to the second tab position (before Baseline)

### 2. Fix Doctor "View My Prep" Not Showing Selections (DoctorReviewPrep.tsx)
The read-only view uses `CombinedPrepView` which expects `selections` with nested `pro_moves` data. But when the doctor views their submitted prep, the `allSelections` query joins via `pro_moves:action_id(...)` which may not resolve. The same two-step fetch pattern used in `DoctorDetailOverview` needs to be applied here -- fetch selections first, then fetch pro_moves separately and merge.

### 3. Rename "Capture Outcome" to "Start Meeting" (DoctorDetailThread.tsx)
- Button label changes from "Capture Outcome" to "Start Meeting"
- Icon stays `ClipboardEdit`

### 4. Remove Calibration Checkbox from MeetingOutcomeCapture (MeetingOutcomeCapture.tsx)
- Remove the calibration Card (lines 189-206)
- Remove `calibrationConfirmed` state variable
- Still pass `calibration_confirmed: false` in the insert (or remove it entirely)

### 5. Simplify MeetingConfirmationCard for Doctor Review (MeetingConfirmationCard.tsx)
- Remove "Request Edit" button and revision form entirely
- Remove "Confirming locks this record permanently" helper text
- Remove "By {coachName}" CardDescription from the summary card
- Change toast from "Meeting confirmed / The record is now locked." to something friendlier like "All set! Your meeting record has been saved."

### 6. Doctor Home Post-Confirmation State (DoctorHome.tsx)
Currently after confirming, the doctor falls through to the "Baseline Complete" card. Instead:
- Add a check for `doctor_confirmed` sessions. If the most recent session is confirmed and the baseline is complete, show a friendly static message instead of the baseline card.
- The message: a warm card like "You're on track" with a brief note about the coaching journey continuing.
- Change "Completed Records" heading to "Past Coaching Sessions"
- The baseline-complete card should only show if there are NO coaching sessions at all (i.e., the coaching journey hasn't started yet).

### 7. Pro Move Color Improvements in MeetingOutcomeCapture
- Use `DomainBadge` component instead of plain `Badge variant="outline"` for domain labels in the discussion topics list.

### Technical Changes Summary

**DoctorDetail.tsx (lines 139-167)**
- Rename tab triggers and reorder: "Up Next", "Coaching", "Baseline"
- Reorder TabsContent accordingly

**DoctorDetailThread.tsx (line ~172)**
- Change "Capture Outcome" text to "Start Meeting"

**MeetingOutcomeCapture.tsx**
- Remove calibration checkbox Card (lines 189-206)
- Remove `calibrationConfirmed` state (line 26)
- Remove `calibration_confirmed` from insert or set to false
- Import and use `DomainBadge` instead of plain Badge for domain display

**MeetingConfirmationCard.tsx**
- Remove lines 131-137 (calibration badge)
- Remove line 143 (CardDescription "By {coachName}")
- Remove lines 218-235 (Request Edit button, revision form, helper text) -- just keep the Confirm button
- Remove revision mutation, revisionNote state, showRevisionForm state
- Update toast to friendlier message

**DoctorReviewPrep.tsx (lines 62-86)**
- Refactor `allSelections` query to use two-step fetch: get selections, then fetch pro_moves by action_id, then merge -- matching the pattern in DoctorDetailOverview

**DoctorHome.tsx**
- Reorder the `renderPrimaryCTA` logic: after checking for meeting_pending, check if there's a confirmed session and baseline is complete -- show a friendly "You're on track" message instead of the baseline complete card
- Only show baseline-complete if no coaching sessions exist
- Rename "Completed Records" to "Past Coaching Sessions" (line 287)
