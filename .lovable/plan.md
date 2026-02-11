

# Add Required Observer Notes for Scores of 1 or 2

## Overview
When a coach gives an observer score of 1 or 2 on any competency, the note field should automatically appear and be required before the evaluation can be submitted. This provides staff with actionable feedback on their lowest-scoring areas.

## Changes

### 1. Auto-show note field when score is 1 or 2 (`EvaluationHub.tsx`)

In `handleObserverScoreChange`, when the selected score is 1 or 2, automatically expand the note textarea for that competency (set `showObserverNotes[competencyId] = true`). This gives the coach an immediate visual cue that a note is expected.

### 2. Add visual indicator on required notes (`EvaluationHub.tsx`)

In the observation scoring UI (around line 1793), when an item has `observer_score` of 1 or 2:
- Always show the textarea (don't show the "Add Note" button)
- Add a small label like "Note required for scores of 1-2" beneath the textarea
- Apply a warning border style if the note is still empty

### 3. Block submission when notes are missing (`EvaluationHub.tsx`)

In `handleSubmitClick` (line 813), after flushing pending notes, check all items: if any item has `observer_score` of 1 or 2 and its `observer_note` is empty/blank, show an error toast listing the competencies that need notes, and prevent submission.

### 4. Update completion status display (`lib/evaluations.ts`)

Extend `isEvaluationComplete` to return a new field `missingObserverNotes: number` -- a count of items where `observer_score` is 1 or 2 and `observer_note` is null/empty. Update `canSubmit` to also require `missingObserverNotes === 0`. This keeps the progress bar accurate.

## Technical Details

**`src/lib/evaluations.ts` - `isEvaluationComplete`**
- Add `missingObserverNotes` count: items where `observer_score <= 2` and `(!observer_note || observer_note.trim() === '')`
- Update `canSubmit` to include `&& missingObserverNotes === 0`

**`src/pages/coach/EvaluationHub.tsx` - `handleObserverScoreChange`**
- After updating local state, if `score <= 2`, set `showObserverNotes` for that competency to `true`

**`src/pages/coach/EvaluationHub.tsx` - Observation UI (around line 1793)**
- Change the conditional: show textarea if `showObserverNotes[id]` OR `observer_score <= 2` (in addition to existing read-only check)
- When `observer_score <= 2`, add a helper text and warning style if note is empty

**`src/pages/coach/EvaluationHub.tsx` - `handleSubmitClick`**
- After `flushAllPendingNotes()`, merge pending notes into local state, then check for missing notes on 1-2 scored items
- If any are missing, show a toast with the competency names and return early

**`src/pages/coach/EvaluationHub.tsx` - Progress bar**
- Display `missingObserverNotes` count in the progress bar when > 0, e.g. "Observation (18/20) -- 2 notes needed"

