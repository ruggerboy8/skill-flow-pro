

# Plan: Six fixes for coaching workflow

## 1. Show agenda in "Capture Meeting Outcome" (`MeetingOutcomeCapture.tsx`)

**Problem**: The coach's agenda (HTML from `coaching_sessions.coach_note`) and doctor's note (`doctor_note`) are not displayed during outcome capture.

**Fix**: After the "Discussion Topics" card, add two new sections:
- **Coach Agenda**: Render `session.coach_note` as sanitized HTML (using DOMPurify, already in the project)
- **Doctor's Notes**: Parse `session.doctor_note` as JSON (progress entries + freeNote) similar to `CombinedPrepView.tsx`'s `parseDoctorNote` pattern. Display progress statuses with icons and any free-text note.

## 2. AI-generated summary already uses second person

The `extract-insights` edge function's coaching prompt (lines 71-76) already instructs: "Write...as a post-meeting note FROM the coach TO the doctor" using second person. The `MeetingOutcomeCapture` summary textarea placeholder should be updated to reinforce this: "Write a warm note to the doctor summarizing what you discussed..."

**Fix**: Update the placeholder text on the summary `Textarea` in `MeetingOutcomeCapture.tsx` to guide manual entry in second person as well.

## 3. Remove coach column from doctor's Pro Move picker (`DoctorReviewPrep.tsx`)

**Problem**: Previous edits were supposed to remove the coach column but it may have been partially left. Looking at the current code (lines 517-525), there is only a "Self" column header and line 555 shows only one `ScoreCircle`. This appears already done. Will verify no remnants remain and clean up if needed.

## 4. Show doctor notes in "Capture Meeting Outcome"

Covered by item #1 above — parsing `session.doctor_note` JSON.

## 5. Save meeting invite emails as templates (already implemented)

The `SchedulingInviteComposer` already has session-type-aware template keys (`scheduling_invite_baseline_review` / `scheduling_invite_check_in`) and a "Save as Template" button for super admins. This is already working per the previous implementation. No changes needed.

## 6. Fix DoctorCoachingHistory not rendering

**Problem**: `scheduled_at` can be `null` (sessions where no meeting date was set). Line 87 calls `format(new Date(session.scheduled_at), ...)` which crashes when `scheduled_at` is null, causing the entire component to fail silently.

**Fix**: 
- Handle null `scheduled_at` with a fallback display (e.g., "Date not set")
- Also consider showing sessions with status `meeting_pending` in addition to `doctor_confirmed`, since those have completed meetings too

## Files to modify

1. **`src/components/clinical/MeetingOutcomeCapture.tsx`** — Add coach agenda display (sanitized HTML) and doctor notes section after Discussion Topics card
2. **`src/pages/doctor/DoctorCoachingHistory.tsx`** — Guard against null `scheduled_at`; broaden status filter to include `meeting_pending`

