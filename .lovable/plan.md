

## Roles & Competency Builder — Implementation Plan

### Summary

Add a 5th tab ("Roles & Competencies") to the Platform Console that lets super admins create, clone, and edit roles and their competencies. This is the foundation for supporting new organizational structures (UK practices, general dentistry) without SQL-level changes.

### Database Migration

One migration that does four things:

1. **Auto-increment sequences** — so new records get IDs automatically:
   - `roles.role_id`: sequence starting at 5 (current max is 4)
   - `competencies.competency_id`: sequence starting at 500 (current max is 414)

2. **`active` column on `roles`** — `boolean NOT NULL DEFAULT true` for soft-delete without breaking FK references

3. **RLS write policies for `roles`** — INSERT, UPDATE, DELETE for `is_super_admin(auth.uid())`

4. **RLS write policies for `competencies`** — INSERT, UPDATE, DELETE for `is_super_admin(auth.uid())`

### New Components

| File | Purpose |
|------|---------|
| `src/components/platform/PlatformRolesTab.tsx` | Two-panel layout: role list (left) + competencies grouped by domain (right). Includes new/clone/edit role actions and competency CRUD. |
| `src/components/platform/RoleFormDrawer.tsx` | Drawer for creating or editing a role (fields: `role_name`, `role_code`). |
| `src/components/platform/CompetencyFormDrawer.tsx` | Drawer for creating or editing a competency (fields: `name`, `tagline`, `description`, `friendly_description`, `interview_prompt`, `code`, `domain_id`). |
| `src/components/platform/CloneRoleDialog.tsx` | Dialog to pick a source role + enter new name/code, then duplicate all competencies. |

### Modified Files

| File | Change |
|------|--------|
| `src/pages/PlatformPage.tsx` | Add 5th tab trigger + content. Update grid-cols from 4 to 5. Import `PlatformRolesTab`. |

### UI Layout

```text
┌──────────────────────┬───────────────────────────────────────┐
│  ROLES               │  COMPETENCIES for "DFI"               │
│                      │                                       │
│  [+ New] [Clone]     │  ▸ Clinical (4)                       │
│                      │    Patient Flow Coordination    [Edit] │
│  ● DFI        (16)   │    Clinical Team Communication  [Edit] │
│  ● RDA        (16)   │    ...                                │
│  ● Office Mgr (16)   │  ▸ Clerical (4)                       │
│  ● Doctor     (14)   │  ▸ Cultural (4)                       │
│                      │  ▸ Case Acceptance (4)                │
│                      │                                       │
│                      │  [+ Add Competency]                   │
└──────────────────────┴───────────────────────────────────────┘
```

- Left panel: card list of roles showing name, code, competency count, active badge
- Right panel: accordion grouped by the 4 domains, each competency row shows name + tagline + edit button
- Clone workflow: select source role → enter new name → system creates role + duplicates all competencies with new `role_id`

### Clone Logic (in `CloneRoleDialog`)

1. Insert new row into `roles` (name, code)
2. Fetch all competencies for source `role_id`
3. Bulk insert copies with new `role_id`, adjusted `code` prefix (e.g., "DFI.CLIN 1" → "NEWCODE.CLIN 1")
4. Refresh role list, auto-select new role

### What This Does NOT Change

- Domains remain fixed (4 domains, read-only in this phase)
- `organization_role_names` aliasing is untouched
- Pro move `practice_type` filtering is unchanged
- Existing hardcoded `roleDefinitions.ts` content stays for backward compatibility

