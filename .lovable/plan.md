

## Plan: Replace scroll-distance tracking with IntersectionObserver in CoachBaselineWizard

### Problem
The current tracking uses a "reading line" algorithm that picks whichever card's center is closest to 30% of viewport height. With small, tightly-stacked cards, this frequently highlights the wrong neighbor.

### Solution
Port the proven IntersectionObserver pattern from `EvaluationHub.tsx` (lines 284-341) into `CoachBaselineWizard.tsx`, replacing the `requestAnimationFrame` + center-distance logic (lines 64-137).

### Changes

**File: `src/components/clinical/CoachBaselineWizard.tsx`**

1. **Replace the scroll tracking effect (lines 60-137)** with an IntersectionObserver that:
   - Maintains a `visibilityMap<number, { ratio, top }>` keyed by `action_id`
   - Observes all pro move card refs via `proMoveRefs`
   - Uses `data-action-id` attribute on each card element
   - Picks the card with the highest `intersectionRatio` (tie-break by closest to top)
   - Uses thresholds `[0, 0.2, 0.5, 0.8, 1]` and `rootMargin: '-10% 0px -35% 0px'` (same as EvaluationHub)
   - Debounces at 200ms before committing `setActiveActionId` and pushing to `proMoveTimeline`

2. **Update pill anchor position**: After selecting the best card via IntersectionObserver, read `getBoundingClientRect()` from `proMoveRefs.current.get(bestId)` to set `pillAnchorTop` so the floating pill still tracks vertically.

3. **Remove stale refs**: Drop `pendingSwitchRef`, `rafRef`, and the `READING_LINE` / `DEBOUNCE_MS` constants — no longer needed.

4. **No changes** to the edge function, timeline format, FloatingRecorderPill, or any other files. The `proMoveTimeline` data shape (`{ action_id, t_start_ms }[]`) stays identical.

### Why this should work better
- IntersectionObserver reports how much of each card is actually visible in the viewport, not just center proximity
- A card that is 80% visible beats a neighbor that is only 20% visible, even if the neighbor's center is slightly closer to an arbitrary line
- This is the same approach that works reliably for the observation recorder in EvaluationHub

