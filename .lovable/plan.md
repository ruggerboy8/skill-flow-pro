## Goal
Remove the manual "Save Changes" button from the Week Builder and make pro-move assignments persist automatically as soon as a move is selected (via picker, drag-and-drop, or slot clear).

## Current behavior
- Selecting a pro move, dragging one in, or clearing a slot updates local React state and flips `hasUnsavedChanges = true`
- A 💾 "Save Changes" button appears in the card header; the user must click it to call `handleSaveAll`, which batch-saves all modified weeks via the `planner-upsert` edge function

## Proposed change
1. **Remove the save button** from the `WeekBuilderPanel` card header (remove the `hasUnsavedChanges` conditional block and the `hasUnsavedChanges` / `savingChanges` state variables).

2. **Extract a `saveWeek` helper** from `handleSaveAll` that persists a single week's 3 slots to the `planner-upsert` edge function.

3. **Auto-save on every mutation:**
   - `handleSelectProMove` → after updating local state, call `saveWeek` for the affected week
   - `onDrop` (drag-and-drop) → after updating local state, call `saveWeek` for the affected week  
   - `handleClearSlot` → after updating local state, call `saveWeek` for the affected week
   - Show a brief toast on success or error so the user knows the action persisted

4. **Keep `handleSaveAll` as a thin wrapper** around `saveWeek` for the rare case any other code still calls it, or delete it if unused.

5. **Remove `hasUnsavedChanges` and `savingChanges` state** entirely; replace with per-slot lightweight `savingSlot` state if a loading indicator on the specific slot is desired (otherwise drop loading indicators entirely since saves are fast and asynchronous).

## Out of scope
- Auto-fill (`handleAutoFill`) already persists server-side via `sequencer-auto-assign`; no change needed
- Month view is read-only navigation; no change needed
- Exempt / delete / unlock flows already trigger their own server calls; no change needed

## Files to change
- `src/components/planner/WeekBuilderPanel.tsx` — remove save button, add auto-save helpers, wire to picker/drop/clear handlers

## Validation
- Open Builder → pick a role tab → select a week → click a slot → pick a pro move from the dialog → dialog closes and assignment is persisted immediately without an explicit save step
- Drag a pro move from the recommender panel into a slot → persists immediately
- Clear a slot → persists immediately
- No "Save Changes" button is visible at any point