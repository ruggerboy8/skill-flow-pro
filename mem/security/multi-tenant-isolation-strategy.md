---
name: Multi-tenant isolation strategy
description: Org-scoped RLS for staff/locations/groups/excused_*/coaching_*; SECURITY DEFINER helpers; super-admin escape hatches; edge-function caller-org enforcement
type: security
---
Multi-tenant isolation (post 2026-06-12 hardening):

- **RLS scope rule**: every cross-tenant readable table scopes SELECT to `current_user_org_id()` or `is_super_admin(auth.uid())`. Applies to: `staff`, `locations`, `practice_groups`, `excused_locations`, `excused_submissions`, `coaching_sessions`, `coaching_meeting_records`.
- **Helpers**: use `org_id_of_location(uuid)` and `org_id_of_staff(uuid)` (SECURITY DEFINER, public schema) for org resolution in policies — avoids join recursion.
- **Edge function rule**: any edge function that uses `SUPABASE_SERVICE_ROLE_KEY` MUST first call `getClaims(authHeader)`, resolve caller's staff row, and verify org via `current_user_org_id()` RPC before honoring any caller-supplied `orgId`/`organization_id`. Non-super-admin requests with mismatched org → 403.
- **OAuth callbacks (Deputy)**: state is attacker-controllable; verify `state.staff_id`'s actual org matches `state.org_id` server-side before writes.
- **`weekly_assignments.org_id`**: stores `organizations.id`, NOT `practice_groups.id`. Resolve via `staff.organization_id` or `locations → practice_groups.organization_id`. Never pass a `group_id`.
- **Masquerade**: protected structurally by the staff SELECT policy — non-super-admins can't read staff rows outside their org. No app-level check required after the RLS fix.
