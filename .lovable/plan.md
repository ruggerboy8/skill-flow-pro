

# Plan: Deputy Integrations settings page

## Where it lives
There's no standalone "Settings" nav today — settings already live as the **Settings tab** inside `/admin` (`AdminPage.tsx` → `AdminGlobalSettingsTab`). I'll add **Integrations** as a new top-level tab in that same shell, and expose `/settings/integrations` as a friendly route that redirects there.

- New tab: `/admin?tab=integrations` (icon: `Plug`)
- New route: `/settings/integrations` → redirects to `/admin?tab=integrations`
- Access gate is already enforced by `AdminPage` (`canAccessAdmin` = org admin or super admin)

## Files to add / change

### 1. `src/components/admin/AdminIntegrationsTab.tsx` (new)
Top-level container for the Integrations tab. Renders the Deputy card and (when connected) the mappings table. Resolves `organizationId` from `useUserRole()`.

- On mount, parse `?deputy=connected` / `?deputy=error&reason=…`, fire a sonner toast, then strip those params via `setSearchParams`.
- Handles the connection-state query and passes `connection` down.

### 2. `src/components/admin/integrations/DeputyConnectionCard.tsx` (new)
The Deputy card section.

- React Query: `select('deputy_install, deputy_region, last_sync_at, last_sync_status, last_sync_error')` from `deputy_connections` `.eq('organization_id', orgId).maybeSingle()` — never selects token columns.
- **Disconnected state**: Deputy logo, title, subtext, **Connect Deputy** button → calls `supabase.functions.invoke('deputy-initiate-oauth')`, then `window.location.href = data.url`.
- **Connected state**:
  - Green "Connected" badge using `--status-complete`
  - Install info: `{deputy_install}.{deputy_region}.deputy.com`
  - "Last synced": `formatDistanceToNow(last_sync_at, { addSuffix: true })` or "Never"
  - Sync status badge (success/error/—) using `--status-complete` / `--status-missing` / muted
  - `last_sync_error` shown as small `text-muted-foreground` block when present
  - **Sync Now** → `supabase.functions.invoke('deputy-sync', { body: {} })`. Shows spinner; on success toasts `"Synced — N staff excused for week of {weekOf}"` (using `staff_absent_all_week` + `week_of` from response); invalidates connection + mappings queries.
  - **Disconnect** → AlertDialog confirm → `supabase.from('deputy_connections').delete().eq('organization_id', orgId)` → invalidate query.

### 3. `src/components/admin/integrations/DeputyMappingsTable.tsx` (new)
Only rendered when a connection exists.

- Queries:
  - `deputy_employee_mappings` for org, ordered `is_confirmed asc, deputy_display_name asc`
  - `staff` where org + `active = true` + `is_participant = true`, selecting `id, name` (dropdown source)
- Top callout: "Only confirmed mappings trigger automatic excusals. Run a sync first to populate this list."
- Yellow banner when there are rows with `is_confirmed=false AND is_ignored=false AND staff_id IS NOT NULL`: "X employee mappings need your review before auto-excusals will apply."
- Table columns: Deputy Name | Matched Staff | Status | Actions
  - **Status badges** use CSS vars: confirmed → `--status-complete`, ignored → `--status-pending`, needs review → amber via `--status-pending` (per spec)
  - **Actions**: Confirm / Ignore / Unconfirm / Unignore (state-dependent), plus a Select for "Change match" that updates `staff_id` and resets `is_confirmed = false`.
- All mutations call `supabase.from('deputy_employee_mappings').update(...)` and invalidate the mappings query.

### 4. `src/pages/AdminPage.tsx` (edit)
Add a new tab entry: `{ value: "integrations", label: "Integrations", icon: Plug, content: <AdminIntegrationsTab /> }`.

### 5. `src/App.tsx` (edit)
Add inside `<Layout>` route block:
```
<Route path="settings/integrations" element={<Navigate to="/admin?tab=integrations" replace />} />
```

### 6. Build error fix — `supabase/functions/deputy-sync/index.ts` (edit)
The build is currently broken because `deputy_connections` isn't in generated `types.ts` yet (the generic resolves to `never`). Apply the project's documented "defensive querying" pattern:
- Cast the supabase client passed to `refreshDeputyToken` as `any`
- Cast the `.update({...})` payload arg as `any`

Two minimal `as any` casts, no logic changes. This unblocks deploy.

## Technical notes

- **No new edge functions.** Both `deputy-initiate-oauth` and `deputy-sync` already exist and are wired correctly in `supabase/config.toml` with `verify_jwt = true`. `supabase.functions.invoke` automatically forwards the user JWT.
- **No DB migrations.** Tables `deputy_connections` and `deputy_employee_mappings` already exist with appropriate RLS (org admins manage their own org's rows).
- **Type casts.** Per `mem://architecture/defensive-querying-for-pending-migrations`, the deputy tables aren't in `types.ts`; client queries will use `(supabase as any).from('deputy_connections')...` etc.
- **Org id.** `useUserRole()` exposes `organizationId` — used for all `.eq('organization_id', …)` filters (matches `mem://security/command-center-data-isolation`).
- **Icons.** Section header `Plug` at `h-6 w-6`; in-row action icons at `h-4 w-4` per project icon-size convention; button icons inline at `h-4 w-4` (button slot already enforces 16px via `[&_svg]:size-4`).
- **Toasts.** Use `sonner` (`import { toast } from "sonner"`).

