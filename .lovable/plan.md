

## Plan: Filter Timeline to Only Meaningful Pauses

### Problem
The timeline captures every Pro Move the coach scrolls past, even momentary ones where no feedback was spoken. This floods the AI with irrelevant action IDs.

### Approach
Apply a **minimum dwell time filter** in the edge function before building the prompt. Each timeline entry has `t_start_ms`, so we can compute how long the coach paused on each Pro Move by looking at the gap to the next entry. Entries below a threshold get dropped.

### Threshold
**3 seconds minimum dwell time.** Typical scrolling past a card takes ~0.5-1.5s. Speaking even a single sentence takes 3-5s. This cleanly separates "scroll-through" from "paused to give feedback."

### Changes

**`supabase/functions/map-baseline-domain-notes/index.ts`**

1. After receiving `timeline`, compute duration for each entry and filter:
   - For each entry `i`, duration = `timeline[i+1].t_start_ms - timeline[i].t_start_ms`
   - Last entry gets duration = `totalRecordingDuration - timeline[last].t_start_ms` (or treated as always included since the coach stopped recording while on it)
   - Drop entries with duration < 3000ms
2. Use filtered timeline to build the pro move list sent to the AI -- only include pro moves that appear in the filtered timeline
3. Rewrite the prompt to be deterministic: "Here are N pro moves the coach commented on, in order. Split the transcript accordingly."
4. Keep the broad fallback only when timeline is empty/missing

**No client-side changes needed** -- the timeline data already contains everything we need. The `t_start_ms` values let us compute dwell duration server-side.

### Example
Recording: 15 seconds total. Timeline:
- Action 192 at 0ms → Action 4017 at 2000ms → Action 189 at 3500ms → Action 4005 at 9000ms

Durations: 192=2s, 4017=1.5s, 189=5.5s, 4005=6s+

After filter (≥3s): only Action 189 and Action 4005 sent to AI. The model gets 2 pro moves instead of 46, and the prompt says "split this transcript between these two."

