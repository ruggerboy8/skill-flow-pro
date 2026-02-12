

# Voice-to-Notes: Viewport-Aware Recording with Direct Note Population

## What's Changing

The observation recorder will become "competency-aware." As the evaluator scrolls and speaks, the system tracks which competency is in view. After transcription, an AI step splits the transcript into polished, per-competency notes and populates them directly -- replacing the current "Analyze & Extract Insights" flow for observations.

The Insights/Summary tab simplifies to show only self-assessment interview insights.

## User Experience

1. Evaluator taps **Start** on the recorder card (same as today)
2. As they scroll through competencies, the **FloatingRecorderPill** shows: "Recording for: Patient Greeting"
3. Active competency row gets a subtle highlight ring
4. Evaluator taps **Done** -- transcription runs as before
5. New: A **"Map to Notes"** button appears after transcription (replaces "Analyze & Extract Insights")
6. Clicking it calls an AI function that splits the transcript into per-competency notes, written in polished coach-style language
7. Each competency's note field is populated (appended if note already exists, with a separator)
8. The Summary/Insights tab now only shows self-assessment interview analysis, titled "Self-Assessment Insights"

## Implementation Steps

### Phase 1: Viewport Tracking in EvaluationHub.tsx

**New state:**
- `activeCompetencyId: number | null` -- currently highlighted row
- `competencyTimeline: Array<{ competency_id: number, t_start_ms: number }>` -- timestamped log of focus changes
- `isMappingToNotes: boolean` -- loading state for the mapping call

**New refs:**
- `rowRefs: Map<number, HTMLElement>` -- per-competency row elements
- `recordingStartTime: number` -- timestamp when recording began

**IntersectionObserver effect:**
- Gated by `recordingState.isRecording && activeTab === 'observation'`
- Thresholds: `[0, 0.2, 0.5, 0.8, 1]`, rootMargin: `'-10% 0px -35% 0px'`
- Picks highest `intersectionRatio` row, tie-breaks by closest to viewport top
- Updates `activeCompetencyId` with ~200ms debounce to prevent flicker
- Appends to `competencyTimeline` on each change
- Freezes tracking while recording is paused
- Cleans up on stop/unmount/tab change

**Row markup changes (line ~1758):**
- Add `data-competency-id={item.competency_id}`
- Add ref callback to populate `rowRefs` map
- Add conditional `ring-2 ring-primary/30` class when row matches `activeCompetencyId` during recording

### Phase 2: Update FloatingRecorderPill

- New optional prop: `activeCompetencyLabel?: string`
- Display below the timer: small text showing the active competency name
- Falls back to nothing when no competency is in view

### Phase 3: Update RecordingStartCard

- New optional prop: `activeCompetencyLabel?: string`
- Show active competency label in the subtitle area while recording
- Change `hasExistingInsights` logic: instead of checking `insightsSummary` (observer insights), check whether any `observer_note` fields are populated -- this determines "Re-record" vs "Start" label and the replace confirmation dialog

### Phase 4: Remove Observation Analysis UI

**In EvaluationHub.tsx, remove:**
- `handleAnalyzeObservation` function (lines 482-533)
- `isAnalyzingObservation` state variable
- `analysisJustCompleted` state variable
- `insightsSummary` memo (lines 278-291)
- `handleViewInsights` callback (lines 294-298)
- The "Analyze & Extract Insights" button block (lines 1934-1968)
- The "View Insights" success banner (lines 1972-1988)
- The transcription toast text referencing "Analyze" -- update to mention "Map to Notes"

**Keep untouched:**
- All interview analysis code (`handleAnalyzeInterview`, interview Analyze CTA, `analysisJustCompletedInterview`)
- `extract-insights` edge function (still used by interview flow)

### Phase 5: Add "Map to Notes" Button

**Location:** In the observation transcript card (replacing the removed Analyze button area, lines 1934-1988)

**Behavior:**
- Visible after transcription is complete and transcript exists
- On click, sets `isMappingToNotes = true` and calls the new `map-observation-notes` edge function with:
  - `transcript`: the `summaryRawTranscript`
  - `timeline`: the `competencyTimeline` array
  - `competencies`: array of `{ id, name, domain }` from `evaluation.items`
- On success, iterates the returned notes array and:
  - For each `{ competency_id, note_text }`, appends to the existing note with separator `\n---\n` if note already has content, or sets directly if empty
  - Uses existing `setObserverNote()` function for persistence
  - Updates `pendingObserverNotes` local state so UI reflects changes immediately
  - Auto-opens the note section for populated competencies via `setShowObserverNotes`
- Shows success toast with count of notes populated
- Shows error toast on failure

### Phase 6: New Edge Function -- `map-observation-notes`

**File:** `supabase/functions/map-observation-notes/index.ts`

**Config:** Add to `supabase/config.toml` with `verify_jwt = true`

**Input:** `{ transcript, timeline, competencies: [{ id, name, domain }] }`

**AI call:** Uses `LOVABLE_API_KEY` with Gemini Flash via tool calling for structured output

**System prompt directives:**
- Split the transcript into per-competency notes based on content matching and timeline hints
- Write in second person ("You demonstrated...", "Consider trying...")
- Use clear, supportive, coach-style language
- Fix grammar, remove filler words and false starts
- Keep each note to 2-4 sentences max
- Preserve specific examples and observations from the transcript
- Do not fabricate information not present in the transcript
- If no relevant content exists for a competency, omit it (do not return empty notes)
- No duplicate competency IDs in output

**Tool calling schema:**
```text
{
  notes: [{
    competency_id: number,
    note_text: string  // max 500 chars
  }]
}
```

**Error handling:** Surface 429/402 errors with user-friendly messages

### Phase 7: Simplify Insights Display

**InsightsDisplay.tsx:**
- Remove observer perspective column and `observerPerspective` logic
- Remove side-by-side grid layout
- Show only self-assessment perspective, full-width
- Rename card title to "Self-Assessment Insights"
- Update empty state: "Complete the self-assessment interview to see insights here"
- Keep legacy `summaryFeedback` rendering for historical evaluations where `extracted_insights.observer` does not exist but `summary_feedback` does (soft deprecation)

**EvaluationViewer.tsx (read-only viewer, lines 476-536):**
- Remove "Coach Observations" `PerspectiveCard` block (lines 498-505)
- Update `hasAnyInsights` to check only `selfAssessmentPerspective` (and legacy `summary_feedback` for old records)
- Keep tab name as "Insights" but content is self-assessment only

**SummaryTab.tsx:**
- Keep `summaryFeedback` prop for now (legacy support) but it will only render for old evaluations via InsightsDisplay's fallback path

## Backward Compatibility

- Historical evaluations with `extracted_insights.observer` data: the observer section is removed from display. This data remains in the database but is no longer rendered. These older evals likely also have `observer_note` fields that were manually entered, so the competency-level view still shows their notes.
- Historical evaluations with `summary_feedback` only (no structured insights): the legacy feedback card is preserved in InsightsDisplay as a fallback.
- No schema changes needed. Timeline is ephemeral React state. Notes use existing `observer_note` columns.

## Files Summary

| File | Action |
|------|--------|
| `src/pages/coach/EvaluationHub.tsx` | Add viewport tracking state/effect/refs, row highlights, "Map to Notes" button, remove observation analyze flow |
| `src/components/coach/FloatingRecorderPill.tsx` | Add `activeCompetencyLabel` prop and display |
| `src/components/coach/RecordingStartCard.tsx` | Add `activeCompetencyLabel` prop, update `hasExistingInsights` to check notes instead of insights |
| `src/components/coach/InsightsDisplay.tsx` | Remove observer column, simplify to self-assessment only, keep legacy fallback |
| `src/pages/EvaluationViewer.tsx` | Remove observer section from Insights tab |
| `src/components/coach/SummaryTab.tsx` | Keep as-is (legacy prop preserved) |
| `supabase/functions/map-observation-notes/index.ts` | New edge function |
| `supabase/config.toml` | Register new function |

## Edge Cases

- **Fast scrolling**: 200ms debounce on `activeCompetencyId` updates prevents flicker
- **No competency visible**: Label shows nothing; no timeline entry appended
- **Paused recording**: Freeze viewport tracking (no timeline entries while paused)
- **Empty/short transcript segments**: AI omits competencies with no relevant content
- **Existing notes**: Append with `\n---\n` separator, never overwrite
- **No timeline data**: AI falls back to pure content matching against competency names/descriptions
- **`polish-note` function**: Not reused here because `map-observation-notes` handles polishing inline in one pass (avoids N extra API calls). `polish-note` remains for the separate "AI Help" button on manual note editing

