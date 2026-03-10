

## Plan: Click-to-Select Pro Move Recording System

### The Clinical Director's Workflow Today

The director scrolls through ~46 pro move cards across 4 domains, rating each 1-4 and optionally speaking verbal notes. The problem: automatic scroll-tracking (whether center-distance or IntersectionObserver) keeps guessing wrong about which card the director is talking about.

### Proposed Click-Based UX

**How it works visually:**

1. Director clicks "Start Recording" — recording begins but **no card is highlighted yet**. A floating pill shows recording time + "Tap a Pro Move to begin."
2. Director **taps a pro move card** — that card gets the glow ring, the pill slides to it and shows the card's label. The director speaks their feedback about that pro move.
3. When the director scrolls to the next card and **taps it**, the previous card's highlight clears, the new card gets the glow, and the pill slides over. A new timeline entry is pushed.
4. If the director wants to speak general/unattributed feedback, they can tap the active card again to **deselect** it. The pill shows "General notes" and the timeline records a `null` action_id segment.
5. Director taps "Stop & Transcribe" when done — same two-step pipeline as today.

**Key visual details:**
- Cards get a subtle "tap me" affordance during recording: a faint pulsing border or a small mic icon appears on hover/focus
- The active card keeps the existing glow ring + shadow treatment
- The floating pill shows the truncated action statement of the selected card (same as today)
- Only one card can be active at a time

```text
┌──────────────────────────────────────┐
│  🔴 0:42  │ "I always verbalize..."  │  ← floating pill
└──────────────────────────────────────┘

  ┌─ Clinical Domain ──────────────────┐
  │                                    │
  │  ┌─ Pro Move 189 ─── ✨ ACTIVE ─┐ │  ← glowing ring
  │  │  I always verbalize the exam  │ │
  │  │  [1] [2] [3] [4] [N/A]       │ │
  │  └───────────────────────────────┘ │
  │                                    │
  │  ┌─ Pro Move 190 ────────────────┐ │  ← tap to switch
  │  │  I always sign clinical notes │ │
  │  │  [1] [2] [3] [4] [N/A]       │ │
  │  └───────────────────────────────┘ │
  └────────────────────────────────────┘
```

### Backend / Processing Logic

**Timeline accuracy is now 100%.** Each timeline entry `{ action_id, t_start_ms }` corresponds to an explicit user tap, not a scroll guess. This means the edge function can use the timeline deterministically:

1. **Transcript splitting**: The AI receives the transcript with exact action_id segments. Since the director explicitly selected each card, we can tell the AI: "The coach was discussing Action 189 from 0:00–0:42, then Action 193 from 0:42–1:15." This is a **hard partition** — no ambiguity.

2. **Edge function change** (`map-baseline-domain-notes`): Revert from the domain-scoped content-matching approach back to a **deterministic per-action prompt**, since the timeline is now trustworthy. The AI only needs to clean up grammar and tone for each segment — no guessing which pro move was being discussed.

3. **Processing time reduction**: With deterministic segments, the prompt is smaller (only the relevant action statements per segment), and the AI does less reasoning work — just polishing, not matching.

### Changes Required

**File: `src/components/clinical/CoachBaselineWizard.tsx`**

1. **Remove the entire IntersectionObserver effect** (lines 60-138) — no more automatic tracking
2. **Add a click handler on each pro move card** that, during recording:
   - Sets `activeActionId` to the tapped card (or `null` if tapping the already-active card to deselect)
   - Pushes `{ action_id, t_start_ms: recState.recordingTime * 1000 }` to `proMoveTimeline`
   - Updates `pillAnchorTop` from the card's `getBoundingClientRect()`
3. **Remove the "auto-highlight first card on record start" effect** (lines 221-230) — recording starts with no card selected
4. **Update the floating pill's `activeCompetencyLabel`**: show "Tap a Pro Move…" when `activeActionId` is null during recording
5. **Add a visual recording-mode affordance** on cards: during recording, non-active cards get a subtle dashed border or mic icon to indicate they're tappable

**File: `supabase/functions/map-baseline-domain-notes/index.ts`**

6. **Restore deterministic splitting**: Since the timeline is now reliable, build a prompt that assigns transcript time-ranges to specific action_ids. The AI's job becomes "clean up this text segment for action X" rather than "figure out which action this text belongs to." This is faster, cheaper, and more accurate.

### What stays the same
- Two-step pipeline (stop → transcribe → review → map)
- FloatingRecorderPill component (no changes needed, it already accepts `activeCompetencyLabel`)
- Rating buttons, note collapsibles, complete assessment flow
- The `proMoveTimeline` data shape `{ action_id, t_start_ms }[]`

