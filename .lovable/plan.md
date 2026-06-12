## Picker review (quick functional pass)

`PlannerWorkspace` = `HistoryStrip` on top + 2-column `WeekBuilderPanel` (55%) / `LibraryPanel` (45%) below. Library tabs: Bench, Struggling, Revisit, Stale, Never, Browse, AI. Selection flow: click a slot in the builder → "Picking for slot #N — Week of …" header lights up in the library → click a card → `planner-upsert` autosave. Clicking a library card without an active slot toasts "Select a slot first".

## Changes in this pass

### 1. Remove the "Last 6 weeks" / "Mix" strip
- Drop the `<HistoryStrip />` instance and its import from `src/components/planner/PlannerWorkspace.tsx`.
- Leave `src/components/planner/HistoryStrip.tsx` on disk (dead code) — safe to delete later.

### 2. Make the builder ↔ library divider drag-resizable
- Replace the `flex` two-column layout in `PlannerWorkspace.tsx` with shadcn `ResizablePanelGroup` / `ResizablePanel` / `ResizableHandle` (already in `src/components/ui/resizable.tsx`, backed by `react-resizable-panels` — already a dep).
- Left: `defaultSize={55}`, `minSize={35}`. Right: `defaultSize={45}`, `minSize={25}`.
- `autoSaveId={`planner-workspace-${roleId}`}` so the split persists per role tab.
- Visible grip via `withHandle`.

### 3. Fix autosave so picks reliably persist
Root cause is unconfirmed but two structural issues make it brittle:

- **Stale slot selection across week navigation.** `selectedSlot` lives in `PlannerWorkspace` while week navigation lives in `WeekBuilderPanel`. If the user activates a slot, scrolls to a different week, then clicks a library card, the save lands on the original (now off-screen) week and looks like nothing happened. → When `WeekBuilderPanel`'s visible week range changes, call a new `onActiveWeeksChange(mondays[])` prop; `PlannerWorkspace` clears `selectedSlot` if its `weekStart` is no longer in view.

- **Silent save outcomes.** `WeekBuilderPanel.saveWeek` only surfaces failures via toast and has no success signal, and the latest `planner-upsert` invocations in edge logs show only boot/shutdown (no body logs) so we can't tell from logs whether saves are firing. → Add a `[Planner.save]` console group in `WeekBuilderPanel.saveWeek` and in `PlannerWorkspace.handleSelectMove` logging `{weekStart, displayOrder, actionId, orgMoveId, orgId, response, error}`; add `console.info` at the top of `planner-upsert`'s `saveWeek` branch logging the parsed body so future invocations show up in edge function logs.

- **Brief save indicator.** Surface the existing `savingWeek` state as a small "Saving…" / "Saved" pill on the relevant week card so the user can see autosave fire.

- **Clear-slot bug while we're here.** `handleClearSlot` currently only nulls `actionId`; also null `orgMoveId` (and reset `status` to `'empty'`) so clearing works for custom moves too.

### 4. Verify
- Pick a slot → pick a platform move → navigate weeks → return: row persists in `weekly_assignments` with the right `org_id` / `action_id`.
- Same flow with a custom (org) move: persists with `org_move_id` set.
- `planner-upsert` edge logs now show the body log line, confirming invocation.

### Out of scope
- Picker UX redesign (parked).
- Any multi-tenant isolation work beyond what already shipped.

## Technical notes
- No DB schema, RLS, or migrations.
- Touched files:
  - `src/components/planner/PlannerWorkspace.tsx`
  - `src/components/planner/WeekBuilderPanel.tsx`
  - `supabase/functions/planner-upsert/index.ts` (logging only — auto-deploys)
