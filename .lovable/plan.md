

# Deputy Integration Rollout — Detailed Build Plan

## Phase 1 — Preview (no DB writes)

**Goal:** Confirm we're talking to Deputy correctly and the data shape is what we expect, without writing anything.

**UI changes** — `DeputyConnectionCard.tsx`:
- Add a **"Pull 7-Day Preview"** button (only visible when connected)
- Calls `deputy-sync` with `{ dry_run: true, days: 7 }`
- Renders an inline preview panel with:
  - Employee count (e.g. "69 employees found in Deputy")
  - First 5 employees: name, Deputy ID, active status
  - Timesheet count for last 7 days (e.g. "142 timesheets in last 7 days")
  - First 5 timesheets: employee name, date, start/end, total hours
  - "Absent all week" candidates: count + names
- Collapsible "View raw response" details for debugging

**Edge function changes** — `deputy-sync/index.ts`:
- Honor existing `dry_run: true` flag (already supported) — confirm it returns sample data, not just counts
- Accept new optional `days` parameter (default 7) to scope the timesheet query window
- Response shape: `{ dry_run, employee_count, employee_sample, timesheet_count, timesheet_sample, absent_all_week_sample, week_of }`

---

## Phase 2 — Mapping

**Goal:** Get every Deputy employee correctly tied to a staff record (or marked ignore) before any metric writes happen.

**One-time import** — new button **"Import Deputy Employees"** on the connection card:
- Calls `deputy-sync` with `{ dry_run: false, employees_only: true }` — pulls roster, writes to `deputy_employee_mappings`, **does not** touch excused_submissions
- For each new mapping, runs name-similarity match against org's `staff` (active, participant) and pre-fills `staff_id` with the best suggestion (token-overlap on first+last name, normalized — same `normalizeName` helper already in the function)
- Leaves `is_confirmed = false` so suggestions still need approval

**Mapping table changes** — `DeputyMappingsTable.tsx`:
- Auto-suggested `staff_id` is shown pre-selected in the dropdown (not blank)
- New **"Confirm All Suggested"** bulk button at top — confirms all rows where `staff_id IS NOT NULL AND is_confirmed = false AND is_ignored = false`
- Per-row Ignore checkbox (uses existing `is_ignored` column)
- Status summary at top: `X confirmed · Y need review · Z ignored · W unmatched`
- The existing manual confirm/ignore/change-match controls stay

**Edge function changes** — `deputy-sync/index.ts`:
- Accept `employees_only: true` to skip timesheet processing entirely
- When inserting a new `deputy_employee_mappings` row with no exact match, do fuzzy matching against org staff and write the suggested `staff_id` (still `is_confirmed = false`)

---

## Phase 3 — Go Live

**Goal:** Explicit, deliberate switch-on with a date floor, so turning it on doesn't retroactively excuse anyone.

**UI changes** — `DeputyConnectionCard.tsx`:
- New **"Sync Settings"** section visible when connected:
  - **Sync enabled** toggle (`Switch` component) — writes `deputy_connections.sync_enabled`
  - **Sync data from** date picker — writes `deputy_connections.sync_start_date`; defaults to today on first enable
  - Helper text: "Timesheets before this date will be ignored even if Deputy returns them"
- Existing "Sync Now" button:
  - Disabled with tooltip when `sync_enabled = false`
  - Disabled with tooltip when there are unconfirmed mappings (`needsReviewCount > 0`)
  - When enabled, runs full sync (`{ dry_run: false }`)

**Edge function changes** — `deputy-sync/index.ts`:
- Read `sync_enabled` and `sync_start_date` from the connection row
- If `sync_enabled = false` AND `dry_run = false` AND `employees_only = false` → return `{ skipped: true, reason: 'sync_disabled' }`
- Filter timesheets where `date < sync_start_date` before creating any `excused_submissions`
- Only process mappings where `is_confirmed = true AND is_ignored = false` for excusal writes

---

## Phase 4 — Backfill *(deferred, not built)*

---

## Technical details

**Files to edit:**
- `src/components/admin/integrations/DeputyConnectionCard.tsx` — add Preview panel, Import button, Sync Settings section, gating on Sync Now
- `src/components/admin/integrations/DeputyMappingsTable.tsx` — pre-fill suggestions, bulk confirm, ignore checkbox refinements, status summary
- `supabase/functions/deputy-sync/index.ts` — `dry_run` returns samples, `employees_only` short-circuit, fuzzy-match on insert, honor `sync_enabled` + `sync_start_date`

**No new tables or migrations** — `sync_enabled` and `sync_start_date` columns already added in the prior approved migration; `is_confirmed` and `is_ignored` already exist on `deputy_employee_mappings`.

**Defensive querying:** `deputy_connections` and `deputy_employee_mappings` aren't in `types.ts` yet, so all client queries use `(supabase as any).from(...)` per project convention.

**Name matching:** Reuse the existing `normalizeName()` helper in `deputy-sync`. Suggestion algorithm: normalize both sides, then exact match on `first + last`; if no exact match, score by token overlap (Jaccard) and pick the top scorer above a 0.6 threshold.

**Ordering of work (each phase independently shippable):**
1. Phase 1 first — you preview, confirm shape is correct
2. Phase 2 next — you import + map your roster
3. Phase 3 last — flip the toggle when you're ready

