

# Plan: Convert Observation Recording to Click-to-Select

## What Changes

Replace the scroll-based `IntersectionObserver` competency tracking in the Evaluation Hub's observation tab with explicit click-to-select behavior, matching the CoachBaselineWizard pattern.

## Current vs Target

```text
CURRENT (scroll-based):
  Coach hits Record → scrolls through competencies → IntersectionObserver
  tracks which competency is in viewport → debounced timeline entries
  → map-observation-notes uses competency_id timeline

TARGET (click-based):
  Coach hits Record → taps a competency row to select it → row highlights
  with domain color ring → speaks feedback → taps next competency
  → timeline entries on each click → same map-observation-notes flow
```

## Files to Change

### 1. `src/pages/coach/EvaluationHub.tsx`
- **Remove** the `IntersectionObserver` `useEffect` block (lines ~284-341) that auto-tracks viewport competency
- **Remove** `debounceTimerRef`, `activeCompetencyIdRef` refs (no longer needed)
- **Add** a `handleCompetencyTap(competencyId)` callback (mirrors `handleCardTap` from CoachBaselineWizard):
  - Toggle `activeCompetencyId` on/off
  - Push `{ competency_id, t_start_ms }` to `competencyTimeline`
  - Push `{ competency_id: 0, t_start_ms }` on deselect (general speech segment)
- **Update** competency row rendering (lines ~1844-1963):
  - Add `onClick={() => handleCompetencyTap(item.competency_id)}` to each row div
  - When recording + active: add domain-color ring/glow (like CoachBaseline's `outline: 3px solid`)
  - When recording + not active: dashed border + cursor-pointer + hover state
  - Keep row click passthrough for score/note interactions via `e.stopPropagation()`
- **Update** `RecordingStartCard` instructions: change "scroll through competencies" to "tap a competency to talk about it"
- **Update** `FloatingRecorderPill` usage: add `showArrow`, `alwaysShowStartOver`, and compute `anchorTop` from the active competency row ref (using `rowRefs`)

### 2. `src/components/coach/RecordingStartCard.tsx`
- Update the "How this works" text (lines 204-211):
  - "Tap a competency to start talking about it" instead of "The recorder follows you as you scroll"
  - "Tap the next competency when you move on"
- Update the subtitle text (line 116): "Tap a competency, speak your feedback, then tap the next one"

### 3. `src/components/coach/FloatingRecorderPill.tsx`
- No structural changes needed — already supports `activeCompetencyLabel`, `showArrow`, and `anchorTop` props from the baseline wizard integration

## Technical Details

- The `competencyTimeline` state and `map-observation-notes` edge function already accept the same `{ competency_id, t_start_ms }` timeline format, so no backend changes are needed
- Score buttons and note textareas within each row will use `e.stopPropagation()` to prevent triggering the tap-to-select behavior (same pattern as CoachBaselineWizard)
- The `IntersectionObserver`-based tracking is fully removed — no hybrid mode
- Recording start/stop/pause flows remain unchanged
- Draft audio save/restore remains unchanged

