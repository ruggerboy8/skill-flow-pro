

## Combine "Finish & Add Notes" into a Single Action

### Current Flow (after recording)
1. Coach clicks **"Finish & Add Notes"** -- stops recording and transcribes audio
2. Transcript card auto-expands for review
3. Coach clicks **"Map to Notes"** -- AI maps transcript snippets into competency note fields

### Proposed Flow
1. Coach clicks **"Finish & Add Notes"** -- stops recording, transcribes, and automatically maps to notes in one pipeline

The transcript card will still be available for review/editing afterward, and "Re-map Notes" will remain for coaches who want to edit the transcript and re-run mapping.

---

### Technical Details

**File: `src/pages/coach/EvaluationHub.tsx`**

Modify `handleFinishAndTranscribe` (lines ~617-625) to chain both operations:

- After `handleTranscribeObservation` completes and the transcript is saved, immediately call the mapping logic (the same code in `handleMapToNotes`).
- Since `handleMapToNotes` reads from `summaryRawTranscript` state (which may not be updated yet due to React batching), the function will need to either:
  - Accept the transcript as a parameter and pass it through, OR
  - Refactor `handleMapToNotes` to accept an optional transcript argument, falling back to `summaryRawTranscript` if not provided.
- The chosen approach: refactor `handleMapToNotes` to accept an optional `transcriptOverride` parameter.

- Remove the `transcriptionJustCompleted` intermediate state -- since we no longer pause between transcribe and map, the "Transcription Complete" card state in `RecordingProcessCard` is no longer needed for this flow.
- The processing step text will update through the full pipeline: "Transcribing audio..." then "Mapping transcript to notes..."
- Keep the transcript card and "Re-map Notes" button intact for manual re-runs.

**File: `src/components/coach/RecordingProcessCard.tsx`**

- Remove or simplify the `transcriptionComplete` state rendering (the card that says "Transcription Complete" with an "Edit Transcript" button). Since the flow now goes straight through, the card should show the processing spinner through both phases, then disappear.
- The button label stays **"Finish & Add Notes"** -- it now does exactly what it says in one click.

