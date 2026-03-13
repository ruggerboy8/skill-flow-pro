

## Practice Type on Roles + Multi-Select Practice Type on Pro Moves

**Status: ✅ Complete**

### What changed

1. **Practice types expanded** to three region-specific values: `pediatric_us`, `general_us`, `general_uk`
2. **`roles.practice_type`** column added — each role belongs to one practice type
3. **`pro_moves.practice_type`** converted to **`pro_moves.practice_types TEXT[]`** — array-based multi-select
4. All existing data backfilled (`pediatric` → `pediatric_us`, `general` → `general_us`, `all` → all three)

### Files changed

| File | Change |
|------|--------|
| Migration SQL | Schema: expanded CHECK on orgs, added practice_types array on pro_moves, added practice_type on roles |
| `RoleFormDrawer.tsx` | Added practice type Select (3 options) |
| `PlatformRolesTab.tsx` | Shows practice type badge on role cards, fetches practice_type |
| `ProMoveForm.tsx` | Replaced single Select with multi-checkbox for practice_types |
| `DoctorProMoveForm.tsx` | Defaults practice_types to `['pediatric_us']` |
| `OrgBootstrapDrawer.tsx` | 3 radio options with new labels |
| `PlatformOrgsTab.tsx` | Badge display for all 3 practice types |
| `OrgProMoveLibraryTab.tsx` | Uses `.overlaps('practice_types', [orgPracticeType])` |
| `ProMoveList.tsx` | Uses `.overlaps('practice_types', [filter])` |
| `ProMoveLibrary.tsx` | Updated filter chips to 4 options (All + 3 types) |
