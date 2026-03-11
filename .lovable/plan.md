
## Platform Console Audit

### Bug 1: `ImpersonationTab.tsx` — `display_name` column doesn't exist on `staff` (BUILD ERROR)
**Line 97**: The query selects `display_name` from `staff`, but the column is actually `name`.
- This causes the TS2589/TS2339 cascade of type errors.
- **Fix**: Change `select('id, display_name, is_org_admin, user_capabilities(is_org_admin)')` to `select('id, name, is_org_admin, user_capabilities(is_org_admin)')`.
- Update the `AdminStaff` interface to use `name` instead of `display_name`.
- Update all references: line 111 (`s.display_name` → `s.name`), line 130 (`admin.display_name` → `admin.name`), line 222 (`admin.display_name` → `admin.name`).

### Bug 2: `OrgBootstrapDrawer.tsx` — Missing `slug` on location insert (BUILD ERROR)
**Line 93-104**: The `locations` insert is missing the required `slug` field. The `locations` table schema requires `slug: string` (non-nullable, no default).
- **Fix**: Generate a slug from the org name (e.g., `toSlug(orgName)`) and include it in the insert payload.

### Bug 3: `PlatformOrgsTab.tsx` — No edit/detail action on org rows
The organizations table is read-only display. There's no way to click into an org to manage its groups, locations, or settings. This is a functionality gap but not a crash — noting for awareness.

### Bug 4: `OrgBootstrapDrawer.tsx` — `program_start_date` uses today's date without Monday validation
**Line 92**: Sets `program_start_date` to today. The `LocationDialog` component validates that start dates must be Mondays, but the bootstrap drawer skips this. Could create downstream issues with cycle calculations.
- **Fix**: Snap the date to the next Monday if today isn't a Monday.

### Implementation Plan

1. **Fix ImpersonationTab** — Replace `display_name` with `name` in the query, interface, and all UI references.
2. **Fix OrgBootstrapDrawer** — Add `slug: toSlug(orgName)` to the location insert. Snap `program_start_date` to the nearest Monday.

Both fixes are straightforward single-file edits that resolve the build errors.

---

## Build Error Fixes

There are 7 build errors across 4 files. All are straightforward type-safety issues.

### 1. `coach-remind/index.ts` — `locations` is an array, not an object (lines 145-146)

The `.select('primary_location_id, locations(timezone)')` join returns `locations` as `{ timezone: string }[]` (array) since the relationship isn't declared as `.single()`. The code accesses `.locations?.timezone` as if it's a single object.

**Fix**: Access `staffData?.locations?.[0]?.timezone` instead of `staffData?.locations?.timezone`.

### 2. `planner-upsert/index.ts` — `error` is `unknown` (line 234)

**Fix**: Change `error.message` to `(error as Error).message`.

### 3. `sequencer-rank/index.ts` — Three errors

- **Line 477**: Parameter `e` implicitly has `any` type. **Fix**: Type the callback `(e: { competencyId: number; score?: number }) =>`.
- **Line 550**: `nextPicks` implicitly `any[]`. **Fix**: Add explicit type `const nextPicks: typeof scored = [];`.
- **Line 742**: `error` is `unknown`. **Fix**: `(error as Error).message`.

### 4. `OrgProMoveLibraryTab.tsx` — `organization_pro_move_overrides` not in generated types (lines 80-82, 131-140)

The table `organization_pro_move_overrides` doesn't exist in the auto-generated Supabase types. The typed client rejects it, causing TS2589/TS2769 cascades.

**Fix**: Use `(supabase as any).from('organization_pro_move_overrides')` for both the select query (line 80) and the upsert (line 131), then type-cast the results. This matches the pattern used in `ImpersonationTab.tsx`.

### Summary

| File | Error | Fix |
|------|-------|-----|
| `coach-remind/index.ts` | `.locations.timezone` on array | `locations?.[0]?.timezone` |
| `planner-upsert/index.ts` | `error` is `unknown` | `(error as Error).message` |
| `sequencer-rank/index.ts` | implicit `any` on `e` | Add type annotation |
| `sequencer-rank/index.ts` | `nextPicks` implicit `any[]` | `const nextPicks: typeof scored = []` |
| `sequencer-rank/index.ts` | `error` is `unknown` | `(error as Error).message` |
| `OrgProMoveLibraryTab.tsx` | table not in types | Cast to `any` for both queries |

All six fixes are single-line or minimal changes. No logic or behavior changes.

