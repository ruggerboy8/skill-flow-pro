

## Practice Type on Roles + Multi-Select Practice Type on Pro Moves

### What changes

**1. Expand practice types to three region-specific values:**
- `pediatric_us` (replaces `pediatric`)
- `general_us` (replaces `general`)
- `general_uk` (new)

This affects three tables: `organizations`, `roles`, and `pro_moves`.

**2. Add `practice_type` column to `roles` table**
- New `TEXT NOT NULL DEFAULT 'pediatric_us'` column
- When creating/editing a role, you select which practice type it belongs to
- The PlatformRolesTab left panel will show the practice type badge on each role

**3. Change `pro_moves.practice_type` from single-value to multi-value**
- Replace the single `practice_type TEXT` column with `practice_types TEXT[]` (array)
- This lets a pro move be tagged to multiple practice types (e.g., both `pediatric_us` and `general_us`)
- The old `'all'` value goes away — instead you just check all the boxes

**4. Update CHECK constraints**
- Drop old CHECK on `organizations.practice_type` → new CHECK for `('pediatric_us', 'general_us', 'general_uk')`
- Drop old CHECK on `pro_moves.practice_type` → replaced by array column
- Add CHECK on `roles.practice_type` for the same three values

### Database migration (single SQL file)

1. **Rename practice type values** in `organizations` and `pro_moves`:
   - Drop old CHECK constraints
   - `UPDATE organizations SET practice_type = 'pediatric_us' WHERE practice_type = 'pediatric'`
   - `UPDATE organizations SET practice_type = 'general_us' WHERE practice_type = 'general'`
   - Add new CHECK on `organizations.practice_type`

2. **Convert `pro_moves.practice_type`** → `pro_moves.practice_types TEXT[]`:
   - Add new `practice_types` array column
   - Backfill: `'all'` → `'{pediatric_us,general_us,general_uk}'`, `'pediatric'` → `'{pediatric_us}'`, `'general'` → `'{general_us}'`
   - Drop old `practice_type` column, rename new column

3. **Add `practice_type TEXT` to `roles`**:
   - Default `'pediatric_us'`, with CHECK constraint
   - Backfill existing roles (1-3 as `pediatric_us`, 4/Doctor as `pediatric_us`)

### UI changes

| File | Change |
|------|--------|
| `RoleFormDrawer.tsx` | Add practice type Select (3 options) to the role create/edit form |
| `PlatformRolesTab.tsx` | Show practice type badge on each role card in the left panel |
| `ProMoveForm.tsx` | Replace practice type Select with MultiSelect checkboxes (3 options). Store as array. |
| `OrgBootstrapDrawer.tsx` | Update radio options from 2 to 3 practice types with new labels |
| `PlatformOrgsTab.tsx` | Update badge display to show all 3 practice type labels |
| `OrgProMoveLibraryTab.tsx` | Update filter: `.in('practice_type', ...)` → array overlap query using `.overlaps('practice_types', [...])` |
| `ProMoveList.tsx` | Update `practice_type` filter to use array overlap |
| `ProMovePickerDialog.tsx` | No change needed (doesn't filter by practice type currently) |

### Key query change pattern

Current: `.in('practice_type', [orgPracticeType, 'all'])`
New: `.overlaps('practice_types', [orgPracticeType])` — this checks if the pro move's array contains the org's practice type. No more `'all'` value needed.

### Risk consideration

This is a column rename + type change on `pro_moves` (text → text[]). The migration handles backfill atomically. All queries touching `practice_type` on `pro_moves` need updating in the same deploy — there are ~6 files that reference it.

