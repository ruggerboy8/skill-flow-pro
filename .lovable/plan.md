

# Enterprise Cleanup Workflow: Gap Analysis and Architecture Fixes

## Current state of play

You have two sessions:
- **Platform Admin (superadmin)**: Access to Platform Console (`/platform`)
- **Org Admin (test account)**: Access to Admin page (`/admin`)

You want to delete the Test Org and its associated user, then re-run onboarding fresh.

## The deadlock you identified

Here is the step-by-step cleanup and where each action must happen:

```text
Step  Action                         Who can do it today?       Problem?
────  ─────────────────────────────   ────────────────────────   ──────────────────────────
1     Delete staff/auth user          Org Admin only (via        Org admin would be deleting
      (Johno Oberly)                  /admin Users tab)          their own account — locked out
                                                                 mid-operation

2     Delete location                 Org Admin (/admin          Can't if staff still assigned
                                      Locations tab)

3     Delete practice group           Org Admin (/admin          Can't if locations exist
                                      Groups tab)

4     Delete organization             Platform Admin (/platform  Can't if groups exist
                                      Orgs tab)
```

**Blocker 1 — Self-deletion**: The org admin cannot delete themselves. The `delete_user` action already requires `is_super_admin`, so even the backend blocks it. But the **Platform Console Users tab is read-only** — it has no actions at all. So the superadmin has no UI to delete users from other orgs.

**Blocker 2 — No cascade delete for orgs**: The Platform Console requires you to manually remove groups before deleting an org. There is no "nuke this org and everything under it" capability — which is what you need for test teardown and what any SaaS platform admin needs.

## What standard SaaS platforms provide

1. **Platform admin can manage any user** — not just read-only view
2. **Cascade org deletion** — platform admin can delete an org and all its children (groups, locations, staff, capabilities, scopes, assignments, scores, etc.)
3. **Platform admin user management** supersedes org admin — the higher role should always be able to do what the lower role can

## Plan: Three changes

### 1. Add user actions to Platform Console Users tab
**File**: `src/components/platform/PlatformUsersTab.tsx`

Add a dropdown menu per row with: Delete User, Reset Password, Resend Invite. These call the same `admin-users` edge function actions that already exist and already require `is_super_admin`. The backend is ready — only the UI is missing.

### 2. Add cascade org deletion to Platform Console
**File**: `src/components/platform/PlatformOrgsTab.tsx`
**File**: `supabase/functions/admin-users/index.ts` (new action: `delete_organization`)

Add a new edge function action `delete_organization` that:
- Resolves all practice groups under the org
- Resolves all locations under those groups
- Resolves all staff under those locations
- Cascades deletion in reverse order: user_capabilities, coach_scopes, weekly_scores, evaluations/items, coaching sessions/records, baseline assessments/items, staff, locations, groups, org role names, org pro move overrides, organization

Update the Platform Console org delete button to call this instead of the simple client-side delete. Remove the "has groups" guard — the cascade handles it.

### 3. Allow Platform Console org deletion even with children
**File**: `src/components/platform/PlatformOrgsTab.tsx`

Replace the current "Cannot delete — has groups" toast with a confirmation dialog that warns: "This will permanently delete the organization, all groups, locations, users, and their data. This cannot be undone."

### Technical detail

**New edge function action** (`delete_organization`):
```
Input:  { action: "delete_organization", organization_id: uuid }
Guard:  is_super_admin only
Steps:  1. Load practice_groups by org_id
        2. Load locations by group_ids
        3. Load staff by location_ids (primary_location_id)
        4. Also load staff by organization_id (roaming users)
        5. For each staff: run the same cascade delete logic already in delete_user
        6. Delete locations, groups, org_role_names, org_pro_move_overrides, org row
        7. Return { ok: true, deleted: { users: N, locations: N, groups: N } }
```

**Platform Users tab actions** — reuses existing edge function calls (`delete_user`, `reset_link`, `resend_invite`) with a `DropdownMenu` matching the pattern in `AdminUsersTab.tsx`.

### Correct cleanup sequence after implementation

```text
Step  Action                              Session
────  ──────────────────────────────────   ──────────────
1     Delete Test Org (cascade)            Platform Admin
      → automatically deletes user,
        location, group, and all data
2     Re-run onboarding wizard             Platform Admin
      with same or new auth account
```

One click instead of four manual steps.

