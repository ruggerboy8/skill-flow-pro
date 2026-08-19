# Spec: SEC-3, close the self-promotion privilege escalation

**Status:** approved by John 2026-08-19 (in session). Phase 1 applied to
production 2026-08-19 via supervised MCP migration and verified live.
**Lane:** cross-cutting (auth/tenancy; DB migration in two ordered phases)
**Ticket:** SEC-3 (Motion, MyProMoves Dev Board)
**Branch:** fix/sec-3-close-self-promotion (phase 1)

## What and why

Any logged-in user can promote themselves to org admin, to platform (super)
admin, to clinical director, or move themselves into another tenant, by sending
one direct API update to their own `staff` row. Live verification on 2026-08-19
confirmed the mechanism end to end from policy, grant, trigger, and app-code
definitions.

The research corrected the ticket in two ways that changed the fix:

1. **It was worse than "8 columns."** `authenticated` and `anon` held
   column-`UPDATE` on all 34 columns of `staff` (verified live). This was a
   table-wide grant. The self-edit RLS policy pinned only 2 columns
   (`is_coach`, `is_super_admin`).
2. **The guard the policy protects is not the one the app trusts.** Since
   2026-07-25 the UI reads super-admin from
   `user_capabilities.is_platform_admin` (`src/hooks/deriveUserRole.ts:29-30`),
   not `staff.is_super_admin`, so the real promotion path routed around the one
   column the policy pinned.

## The confirmed escalation chains

- **Chain A (the money chain): participant -> org admin -> platform admin.**
  Self-set `staff.is_org_admin = true`, which satisfies `uc_admin_write` on
  `user_capabilities` (no org predicate, null WITH CHECK), then self-set
  `user_capabilities.is_platform_admin = true`. `deriveUserRole` reads that as
  super admin.
- **Chain B: participant -> clinical director, globally.** Self-set
  `staff.is_clinical_director = true`. `is_clinical_or_admin()` has no org
  filter, so clinical surfaces open across every tenant.
- **Chain C: participant -> another tenant.** Self-set `organization_id`
  directly, or repoint `primary_location_id` and let the fill trigger recompute
  the org. `current_user_org_id()` then follows into the new tenant.

## The fix

Primary approach: REVOKE the table-wide column grants from `authenticated` and
`anon` so `staff` columns are locked by default and only the safe self-service
columns stay writable. This inverts the failed pattern (RLS pinning specific
columns and forgetting the rest); a future privilege column is then safe without
anyone remembering to pin it.

Legitimate app writes to `staff` are known and small (a scan of all 59 files
touching `staff` found exactly two client-side writes): `src/pages/Profile.tsx`
writes only `name` and `scheduling_link`; `src/components/clinical/DoctorLocationEditor.tsx`
writes `primary_location_id`. All role/privilege changes go through the
`admin-users` edge function on the service role, which no `authenticated` grant
change affects.

### Deploy ordering (two phases)

Per the `db-ddl-must-lag-deploy` rule (a dashboard migration hits prod instantly,
the frontend deploys separately via Lovable), the work splits so no live code
path breaks.

**Phase 1 (applied to production 2026-08-19, verified):** REVOKE UPDATE from
`authenticated` and `anon` on every privilege/tenancy/identity column of `staff`,
keeping only `name`, `scheduling_link`, and `primary_location_id` writable
(`primary_location_id` is deferred to phase 2 because a live screen still writes
it directly). Also tightened `user_capabilities.uc_admin_write` with a WITH CHECK
that pins `is_platform_admin` (a caller cannot set their own unless already a
super admin) and org-scopes org-admin writes. Migration
`supabase/migrations/20260819225559_sec3_phase1_lock_staff_privilege_columns.sql`.
Post-apply verification confirmed: `anon` has no UPDATE on `staff`;
`authenticated` retains UPDATE only on `name, scheduling_link, primary_location_id`;
`uc_admin_write` now carries a WITH CHECK.

**Phase 2 (outstanding, must lag a Lovable deploy):** move
`DoctorLocationEditor.tsx`'s `primary_location_id` write to a narrow SECURITY
DEFINER RPC (for example `admin_set_staff_location(staff_id, location_id)` with
its own coach/org-scope + super-admin authorization), ship it via Lovable
Publish, confirm it is live, then REVOKE `primary_location_id` from
`authenticated`. That closes the location-repoint form of Chain C.

## Acceptance script (for John)

Phase 1 (done, verified via SQL before/after):
1. A participant can no longer set any privilege flag, `role_id`, or
   `organization_id` on their own `staff` row.
2. An org admin can no longer set their own `user_capabilities.is_platform_admin`.
3. Real app still works: edit display name and scheduling link on the Profile
   page and save.

Phase 2 (after the deploy + final revoke):
4. An admin can still change a staff member's location through the app (now via
   the RPC), and a direct `authenticated` write to `primary_location_id` is
   rejected.

## Personas to test as

Participant (cannot escalate), org admin (cannot self-promote to platform
admin), admin editing another staff member's location (legitimate path still
works after phase 2).

## Out of scope

- The anon-callable function surface (SEC-1 / SEC-2).
- The `admin-users` edge function hardening (SEC-6).
- Widening `audit_staff_changes` beyond `is_coach` / `is_super_admin`
  (worthwhile follow-up, not required to close the escalation).

## DB impact

Two migrations applied in order with a Lovable deploy between them. Phase 1 is
grant revokes on `staff` plus a policy tightening on `user_capabilities`, applied
and verified. Phase 2's revoke on `primary_location_id` must lag the frontend
deploy. Both idempotent. No `DELETE` of platform data.

## Docs the builder must read

- `docs/data-model.md`; CLAUDE.md "Applying migrations" and the RLS dependency
  rule; the `db-ddl-must-lag-deploy` memory (the phase-ordering constraint)
- `docs/dev/assessment-2026-08-18.md` SEC-3
- `src/hooks/deriveUserRole.ts`, `src/pages/Profile.tsx`,
  `src/components/clinical/DoctorLocationEditor.tsx`

## Ticket breakdown

1. **SEC-3a (phase 1):** DONE, applied to production and verified 2026-08-19.
2. **SEC-3b (phase 2):** move `DoctorLocationEditor` to an RPC/edge path, deploy
   via Lovable, then REVOKE `primary_location_id`. Depends on 3a and a confirmed
   deploy.
