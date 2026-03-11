

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

