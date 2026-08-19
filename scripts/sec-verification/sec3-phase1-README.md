# SEC-3 phase 1: close the self-promotion escalation hole

## What the migration does

File: `supabase/migrations/20260819225559_sec3_phase1_lock_staff_privilege_columns.sql`

Two things, both DB-only, both idempotent (safe to run twice):

1. **Locks down `public.staff` column grants.** Today both `authenticated`
   and `anon` have UPDATE on every column of `staff`, including every
   privilege / tenancy / identity flag (`is_org_admin`,
   `is_clinical_director`, `is_doctor`, `role_id`, `organization_id`, and
   so on). The RLS policy that lets a signed-in user edit their own staff
   row ("Users can update own profile") only pins `is_coach` and
   `is_super_admin` back to their existing values -- it does not pin
   anything else. Row-level security cannot express column-level
   restrictions, so this was a real self-promotion path: a participant
   could, in principle, UPDATE their own row and set
   `is_clinical_director = true` or `is_org_admin = true`.

   The fix revokes UPDATE from `authenticated` and `anon` on the whole
   table, then grants UPDATE back to `authenticated` on exactly the three
   columns the app writes from the client: `name` and `scheduling_link`
   (the only two columns `src/pages/Profile.tsx` writes) and
   `primary_location_id` (written by
   `src/components/clinical/DoctorLocationEditor.tsx`, gated only by a
   client-side role check today -- see "Phase 2 still outstanding" below).
   `anon` gets nothing back; there is no legitimate anonymous write path.

2. **Tightens the `uc_admin_write` policy on `public.user_capabilities`.**
   That policy lets any caller who is already `staff.is_org_admin` or
   `staff.is_super_admin` write ANY column on ANY `user_capabilities` row,
   with no `WITH CHECK` narrowing it at all. That means an org_admin (an
   org-scoped role) could set `is_platform_admin = true` on their own row
   and self-escalate to a platform-wide admin. The migration adds a
   `WITH CHECK` that:
   - (a) blocks a caller from setting `is_platform_admin = true` on their
     own row unless they are already a super admin, and
   - (b) scopes an org_admin's writes to `user_capabilities` rows
     belonging to staff in their own org (super admins are exempt, since
     they legitimately manage capabilities across orgs).

   The real admin-write path, the `admin-users` edge function, uses the
   Supabase service-role key and bypasses RLS entirely, so this change
   does not touch that flow -- it only closes a direct-client-call path
   under an org_admin or participant session.

3. Ends with a `DO $$ ... $$` block that asserts the post-state and raises
   an exception if anything is wrong (authenticated lost UPDATE on the
   locked columns, still has it on the three writable ones, anon has none,
   and the `uc_admin_write` policy now carries a `WITH CHECK`).

## Exact apply steps (supervised, not run by the builder)

1. Open the Supabase dashboard for project `yeypngaufuualdfzcjpk` (Alcan
   ProMoves) -> **SQL Editor**.
2. Optionally run `sec3-phase1-before.sql` first (read-only) to see the
   hole for yourself.
3. Paste the full contents of
   `supabase/migrations/20260819225559_sec3_phase1_lock_staff_privilege_columns.sql`
   and run it. If the sanity block fails, it raises an exception and the
   migration does not "complete silently" -- read the error, it names the
   exact column or policy that didn't land as expected.
4. Run `sec3-phase1-after.sql` (read-only) and compare against the before
   output. `authenticated` should show exactly three writable columns on
   `staff` (`name`, `primary_location_id`, `scheduling_link`); `anon`
   should show none; `uc_admin_write` should show a non-null `with_check`.
5. Once confirmed, this migration file should also land on `main` (via a
   normal PR) so the repo matches production, the same pattern used for
   SEC-1.

## What the before/after scripts prove

`sec3-phase1-before.sql` and `sec3-phase1-after.sql` run the same four
read-only queries against `information_schema.column_privileges` and
`pg_policies` so the diff between them is the whole story:

- Query 1/2: the column-level UPDATE grants on `staff` for `authenticated`
  and `anon` -- wide-open before, three columns (or none, for anon) after.
- Query 3: the `staff` "Users can update own profile" RLS policy, included
  for completeness -- it is deliberately unchanged by this migration.
- Query 4: the `uc_admin_write` policy on `user_capabilities` --
  `with_check = null` before, a real predicate after.

## Phase 2 still outstanding

This migration deliberately leaves `primary_location_id` writable by
`authenticated` on `staff`, because
`src/components/clinical/DoctorLocationEditor.tsx` updates it directly from
the client and is gated only by a client-side `canEdit` check
(`is_clinical_director || is_super_admin || is_org_admin`), not by RLS or a
column grant. Revoking that column now would break that editor for
legitimate clinical directors, since nothing in the DB currently enforces
who may set it.

SEC-3 phase 2 needs to either move that write behind a `SECURITY DEFINER`
RPC that checks the caller's role server-side, or add a real RLS policy
scoped to clinical directors / org admins for that one column, and only
then revoke `authenticated`'s blanket UPDATE on `primary_location_id`. Not
done here -- out of scope for phase 1, which is DB-only and must ship with
zero risk to the currently-deployed frontend.
