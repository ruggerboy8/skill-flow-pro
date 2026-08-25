# Spec: SEC-3c, lock the staff INSERT path

**Status:** built 2026-08-25, awaiting supervised apply + live test.
**Lane:** cross-cutting (auth/tenancy; single idempotent DB migration).
**Ticket:** SEC-3c (Motion, MyProMoves Dev Board), split from SEC-3 by the Gate 2 review.
**Branch:** fix/sec-3c-lock-staff-insert
**Priority:** ASAP (live escalation in production).

## What and why

SEC-3 phase 1 closed the UPDATE self-promotion path but the Gate 2 review found
the escalation is still reachable through INSERT. Any logged-in user, using only
the public anon key, can promote themselves to org admin and clinical director,
and attach themselves to another tenant, by INSERTing a **second** staff row for
their own `auth.uid()` rather than editing their existing row.

Super admin stays blocked (the phase-1 `uc_admin_write` pin on
`is_platform_admin` holds), so this is org-admin + clinical-director +
cross-tenant, not full super admin. It is still a P1.

### Why it works (verified live 2026-08-25)

1. `authenticated` and `anon` both hold the table-level INSERT grant on `staff`.
2. The INSERT policy `"Users can create own profile"` pins only
   `WITH CHECK (user_id = auth.uid() AND is_coach = false AND is_super_admin = false)`.
   It leaves `is_org_admin`, `is_clinical_director`, `is_doctor`, `is_lead`,
   `is_office_manager`, `role_id`, `organization_id`, `coach_scope_*` unconstrained.
   This is the exact "pin a couple columns and forget the rest" mistake phase 1
   set out to kill, sitting on INSERT instead of UPDATE.
3. No unique constraint or index on `staff.user_id` (only `email` and the `id`
   PK are unique). A user may hold two rows, and every gate
   (`is_clinical_or_admin`, `is_coach_or_admin`, `current_user_org_id`,
   `uc_admin_write` USING) reads staff by `EXISTS` across all rows for a
   `user_id`, so the injected row is enough.

## The fix

Invert the failed pattern the way phase 1 did for UPDATE: lock INSERT by
default rather than pinning columns. Three steps, one migration
(`supabase/migrations/20260825200000_sec3c_lock_staff_insert_path.sql`):

1. **REVOKE INSERT on `staff` from `authenticated` and `anon`.** `service_role`
   and `postgres` keep it, so the `admin-users` edge function (which creates all
   staff rows on the service role) is unaffected.
2. **DROP the `"Users can create own profile"` INSERT policy.** With the grant
   gone it is already dead. Dropping it removes the landmine: if a future
   migration ever re-grants INSERT to `authenticated`, there is then no INSERT
   policy, so RLS denies all inserts and the mistake fails loudly instead of
   silently re-opening the hole.
3. **ADD a UNIQUE constraint on `staff.user_id`.** Defense in depth at the data
   layer: one staff row per auth user regardless of grants or policies, which
   kills the "second row" mechanism directly. Verified clean to add: 114 rows,
   0 null `user_id`, 0 duplicates.

The migration ends with a `DO $$` self-check that raises an exception if any of
the four post-conditions is not met (no `authenticated`/`anon` INSERT, no legacy
policy, unique constraint present).

### Why this does not need to lag a Lovable deploy

Per the `db-ddl-must-lag-deploy` rule, DDL that removes something the deployed
frontend relies on must lag the deploy. This does not: the app never inserts
`staff` from the client. Verified 2026-08-25, there is no
`.from('staff').insert` or `.upsert` anywhere in `src/`, no `handle_new_user`
signup trigger, and all staff creation flows through the `admin-users` edge
function on the service role. So this can be applied directly, like phase 1,
without a deploy dependency.

## How staff rows are actually created (verified, so we know the revoke is safe)

- **Only path:** the `admin-users` edge function
  (`supabase/functions/admin-users/index.ts`), which builds a `staffInsert`
  object and calls `.insert()` on a client created with
  `SUPABASE_SERVICE_ROLE_KEY`. Service role bypasses both grants and RLS, so
  revoking the `authenticated`/`anon` grant does not touch it.
- **No client insert:** the only client-side writes to `staff` are UPDATEs,
  `src/pages/Profile.tsx` (name, scheduling_link) and
  `src/components/clinical/DoctorLocationEditor.tsx` (primary_location_id).
- **No signup trigger:** there is no `handle_new_user` / `on_auth_user_created`
  trigger inserting staff.

## Acceptance script

Two parts. Part A is SQL verification I run (or the supervised apply runs) right
after applying. Part B is the real-signed-in-user regression test, because the
standing lesson from the SEC-2b outage and the SEC-3 INSERT miss is that
apply-and-requery is not enough on its own.

### Part A, SQL verification (right after apply)

1. `authenticated` and `anon` have **no** INSERT on `staff`
   (`information_schema.role_table_grants`).
2. The `"Users can create own profile"` policy is **gone** (`pg_policies`).
3. A unique constraint `staff_user_id_key` exists on `staff(user_id)`
   (`pg_constraint`).
4. Simulated attacker insert is rejected: in a transaction, `SET LOCAL ROLE
   authenticated` with a non-admin JWT claim and attempt
   `INSERT INTO staff (user_id, is_org_admin) VALUES (auth.uid(), true)`; expect
   a permission-denied error; `ROLLBACK`. (The migration self-check already
   asserts 1 to 3 and aborts if any fails.)

### Part B, real signed-in user (John, in the live app)

5. Sign in as a normal (non-admin) participant. Use the app normally:
   open the dashboard, submit or view a check-in, open the profile page. Nothing
   errors. (The revoke only touches INSERT on staff, which the app never does,
   so this should be completely unaffected; we confirm it rather than assume it.)
6. On the Profile page, edit display name and scheduling link and save.
   Confirm it still saves (this is an UPDATE, untouched by SEC-3c, but it shares
   the surface so we re-confirm).
7. As a super admin, create a new user through the admin users screen. Confirm
   the new staff row is still created (this exercises the service-role insert
   path that must keep working).

## Personas to test as

- **Participant / non-admin:** app works normally; cannot self-insert a
  privileged staff row.
- **Super admin:** can still create users through admin-users (service-role
  insert path intact).

## Out of scope / deliberate follow-ups

- **Audit coverage of privilege-granting INSERTs.** `audit_staff_changes` fires
  `AFTER UPDATE` only and logs only `is_coach`/`is_super_admin`. With INSERT now
  revoked the INSERT-path attack cannot happen, so widening the audit is no
  longer urgent; tracked as a follow-up (candidate to fold into SEC-2e or a
  dedicated audit ticket), not required to close SEC-3c.
- **SEC-3b (phase 2):** move `DoctorLocationEditor`'s `primary_location_id`
  write to an RPC, then revoke that column. Independent of SEC-3c; still valid.
- The anon-callable SECURITY DEFINER function surface (SEC-1 / SEC-2 / SEC-2e).

## DB impact

One idempotent migration: two grant revokes, one policy drop, one unique
constraint add, plus a self-check block. No DELETE of platform data. Applied via
the Supabase SQL Editor (the known-good path), supervised, then verified with
Part A before John runs Part B.

## Docs the builder must read

- `docs/specs/sec-3-close-self-promotion-escalation.md` (the parent fix)
- CLAUDE.md "Applying migrations" and the RLS dependency rule
- the `db-ddl-must-lag-deploy` memory (why this one does NOT need to lag)
- `supabase/functions/admin-users/index.ts` (the service-role insert path)
