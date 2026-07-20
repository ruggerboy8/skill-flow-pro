
## Problem

8 of 12 doctors in the system are "roaming" — they have `organization_id` set but no `primary_location_id`. Most of our org-resolution logic (RLS helpers, RPCs, edge functions, coach dashboard) walks `staff → locations → practice_groups → organizations`, so any staff row without a `primary_location_id` is invisible or org-less. This is what made Ayah invisible to Kasey and has caused recurring visibility bugs.

Rather than patch one call site at a time, treat `staff.organization_id` as the canonical org anchor and make the location join a fallback only.

## Verified current state

- `staff.organization_id` column exists and is populated for all 12 doctors (0 doctors are missing it).
- 8/12 doctors are roaming (`primary_location_id IS NULL`).
- `public.current_user_org_id()` (defined in `20260306190002_link_practice_groups_to_organizations.sql`) resolves org **only** via `staff.primary_location_id → locations → practice_groups`. It does not consult `staff.organization_id`. Roaming users therefore resolve to NULL org.
- `public.org_id_of_staff()` (in `20260612162540_...sql`) already does `COALESCE(s.organization_id, <location join>)` — good, but its counterpart `current_user_org_id()` does not.
- ~40+ migrations contain `AND s.primary_location_id IS NOT NULL` filters, most inside `get_staff_weekly_scores` and related RPCs. These silently drop roaming doctors from coach dashboards and admin lists.
- Client code in `DoctorManagement.tsx`, `ClinicalHome.tsx`, and `RegionalDashboard.tsx` already scopes by `organization_id`, but relies on RLS + RPCs returning roaming rows.

## Fix strategy

Make `staff.organization_id` authoritative. Everything else falls back to it.

### 1. Patch org-resolution helpers (single migration)

Rewrite two SECURITY DEFINER SQL functions so they prefer `staff.organization_id` and fall back to the location join:

- `public.current_user_org_id()` → `COALESCE(s.organization_id, <join via primary_location_id>)` for `auth.uid()`.
- Keep `public.org_id_of_staff()` as-is (already does COALESCE).
- Add an index: `CREATE INDEX IF NOT EXISTS idx_staff_user_id_org ON public.staff(user_id) INCLUDE (organization_id);` (helps the hot path).

Because `current_user_org_id()` is `CREATE OR REPLACE`d, all existing RLS policies that call it inherit the fix immediately — no policy rewrites needed.

### 2. Backfill `staff.organization_id` for any non-doctor stragglers

Populate `staff.organization_id` from the location chain for every staff row where it's NULL but `primary_location_id` is set. Then add a database trigger on `INSERT/UPDATE` of `staff` that auto-fills `organization_id` from `primary_location_id`'s org whenever it's NULL. This guarantees the invariant going forward.

### 3. Fix roaming-hostile RPCs

The `get_staff_weekly_scores` family of RPCs explicitly excludes roaming staff with `AND s.primary_location_id IS NOT NULL`. That filter exists because the query joins `locations` to resolve site cycle state. Change the join to `LEFT JOIN` and drop the NOT NULL guard, so roaming staff are returned (with NULL location fields, which the UI already tolerates for pending doctors).

Scope of the RPC edit: the current live definition only (latest migration in the chain). One new migration that `CREATE OR REPLACE`s the function — we do not touch historical migration files.

### 4. Fix the doctor invite path

`invite_doctor` edge function was patched last week to set `organization_id`. Add an assertion: **refuse to create a doctor row without an `organization_id`**. This prevents future orphan roaming doctors.

### 5. Client verification

Spot-check that the three places that show doctor lists don't add their own `primary_location_id`-based filters:
- `src/pages/clinical/DoctorManagement.tsx`
- `src/pages/clinical/ClinicalHome.tsx`
- `src/pages/coach/CoachDashboardV2.tsx` (may need a small change to render roaming doctors under a "Roaming / No location" bucket instead of dropping them).

## Deliverables

1. Migration `2026072x_roaming_doctor_org_resolution.sql`:
   - `CREATE OR REPLACE FUNCTION public.current_user_org_id()` with COALESCE.
   - Backfill `staff.organization_id` where NULL.
   - Trigger `staff_set_organization_id_from_location` to auto-fill on insert/update.
   - `CREATE OR REPLACE FUNCTION public.get_staff_weekly_scores(...)` dropping the `primary_location_id IS NOT NULL` filter and switching to LEFT JOIN.
2. Edge function edit: `supabase/functions/invite_doctor/index.ts` — require org_id, error otherwise.
3. Client tweak in `CoachDashboardV2.tsx` to render roaming staff (roaming section, or under "All").

## Non-goals

- Not renaming or removing `primary_location_id` (still meaningful for on-site staff).
- Not touching the ~40 historical migrations that reference `primary_location_id IS NOT NULL` — only the currently-live RPC definition.
- Not changing RLS policy bodies (they inherit via helper functions).

## Risk

Low. The helper function fix is backwards compatible (adds a code path, doesn't remove one). The RPC change widens the result set — UI code that consumes it already handles null location fields (verified for `DoctorManagement`; will verify for `CoachDashboardV2` during implementation).
