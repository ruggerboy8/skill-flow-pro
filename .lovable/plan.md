

## Role Aliases Editor in Admin Settings Tab

### Context

The `organization_role_names` table and `resolve_role_display_name()` function already exist. What's missing is a UI for org admins to manage their aliases. This goes in the Settings tab of the Admin page.

### How It Works

1. Fetch the org's `practice_type` from the current user's staff → location → practice_group → organization chain
2. Fetch all `roles` where `practice_type` matches the org's practice_type
3. Fetch existing `organization_role_names` rows for this org
4. Display a simple table/list: each row shows the platform role name (read-only) and an editable "Display Name" input field
5. Save button upserts rows into `organization_role_names`

### UI Design

Added as a new Card inside `AdminGlobalSettingsTab`, below the existing "Submission Timing" card:

```text
┌─────────────────────────────────────────────────┐
│  🏷️ Role Display Names                          │
│  Customize how role titles appear to your team  │
│                                                 │
│  Platform Role          Your Display Name       │
│  ─────────────────────  ─────────────────────   │
│  Front Desk             [ DFI              ]    │
│  Dental Assistant       [ RDA              ]    │
│  Office Manager         [ Office Manager   ]    │
│                                                 │
│                              [Save Changes]     │
└─────────────────────────────────────────────────┘
```

- Empty input = uses platform default (shown as placeholder)
- Only roles matching the org's practice_type are shown

### Database Changes

None needed. The `organization_role_names` table already has the right structure and RLS policies allowing org admins to read/write their own org's records. The `roles` table already has `practice_type`.

### Files to Change

| File | Change |
|------|--------|
| `src/components/admin/AdminGlobalSettingsTab.tsx` | Add a "Role Display Names" card that fetches roles by org practice_type, shows existing aliases, and upserts on save |

### Data Flow

1. Get `organizationId` from `useUserRole()` (already available)
2. Fetch org's `practice_type` from `organizations` table
3. Fetch `roles` filtered by that `practice_type`
4. Fetch existing `organization_role_names` for this org
5. Render editable inputs, upsert on save (insert if no row exists, update if it does)

### Considerations

- The `useUserRole` hook already exposes `organizationId` — we use that directly
- For the upsert: use Supabase's `.upsert()` with the `org_id + role_id` unique constraint (need to verify this exists, or use insert-on-conflict logic)
- Only show this card to org admins (not just super admins viewing the admin page)

