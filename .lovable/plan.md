

# UX Polish for Viewport-Aware Recording

Four targeted changes to improve the recording flow.

## 1. Earlier Floating Pill Trigger

Currently the floating pill only appears when the "Record Your Observations" card is nearly fully out of view (threshold 0.1). Change the trigger so the pill appears as soon as the card starts scrolling off the top of the viewport.

**File:** `src/pages/coach/EvaluationHub.tsx` (lines 256-262)
- Change the IntersectionObserver threshold from `0.1` to `0.9`
- This means: the pill appears when less than 90% of the start card is visible (i.e., as soon as it starts going off-screen at the top)

## 2. "Start Over" / Delete Button

Add a way to discard the current recording and start fresh, available in two places:

**RecordingStartCard (top):** When recording is active, add a small ghost "Start Over" button next to the Pause/Resume controls. This stops the recording, resets state, and clears the timeline.

**RecordingProcessCard (bottom):** The existing "Re-record" button already serves this purpose when the recording is stopped. In the paused state, add a "Start Over" option alongside "Finish & Add Notes."

**Files:** `src/components/coach/RecordingStartCard.tsx`, `src/components/coach/RecordingProcessCard.tsx`
- RecordingStartCard: new `onStartOver` prop, renders a ghost button with RotateCcw icon when `isRecording` is true
- RecordingProcessCard: add a "Start Over" ghost button in the paused state section (alongside the existing "Finish & Transcribe" button)

## 3. Rename "Finish & Transcribe" to "Finish & Add Notes"

The button text should reflect the new flow -- notes get populated, not just transcribed.

**File:** `src/components/coach/RecordingProcessCard.tsx` (line 183)
- Change label from "Finish & Transcribe" to "Finish & Add Notes"
- Update the transcription-complete message (line 124-125) from "Review the transcript below, then click 'Analyze' to extract insights" to "Your recording has been processed and mapped to competency notes below."

## 4. Update Observation Instructions

Replace the current "Speak naturally -- we'll organize by domain" subtitle and the "Observation starters" section with clear instructions about the new system.

**File:** `src/components/coach/RecordingStartCard.tsx`

When not recording, change subtitle (line 115) from:
> "Speak naturally -- we'll organize by domain"

To:
> "Record verbal feedback as you scroll through competencies"

When recording, replace the "Observation starters" block (lines 189-198) with new instructions:

> **How this works:**
> - The recorder follows you as you scroll
> - Speak clearly about strengths and growth areas for each competency
> - Your feedback will be automatically mapped to each competency's notes

---

## Technical Details

### Files Changed

| File | Change |
|------|--------|
| `src/pages/coach/EvaluationHub.tsx` | Change floating pill observer threshold from 0.1 to 0.9; pass `onStartOver` handler to RecordingStartCard |
| `src/components/coach/RecordingStartCard.tsx` | Add `onStartOver` prop + button; update instruction copy |
| `src/components/coach/RecordingProcessCard.tsx` | Rename "Finish & Transcribe"; add "Start Over" in paused state; update completion message |

### Start Over Handler (in EvaluationHub)

The `onStartOver` callback will:
1. Call `recordingControls.resetRecording()` (existing function)
2. Clear `activeCompetencyId` and `competencyTimeline`
3. Reset `recordingStartTimeRef` to 0
4. Clear any segment transcripts

This reuses the existing reset logic already wired to the "Re-record" button.
