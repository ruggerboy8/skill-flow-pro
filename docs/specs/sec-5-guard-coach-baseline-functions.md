# Spec: SEC-5, guard the coach-baseline staff-scoped functions

**Status:** draft, awaiting John's approval
**Lane:** DB migration (SECURITY DEFINER caller-authorization guard)
**Ticket:** SEC-5 (Motion, MyProMoves Dev Board)
**Branch:** fix/sec-5-guard-coach-baseline

## What and why

While drafting SEC-4 (which guarded `get_staff_all_weekly_scores` and
`get_staff_submission_windows`), a sweep for the same defect class turned up
two more `SECURITY DEFINER` functions on the Alcan doctor-coaching track that
take a staff/doctor id and never check the caller is authorized over it. Both
are granted to `authenticated`, so any logged-in user can reach them.

1. **`get_or_create_coach_baseline_assessment(uuid)` — the serious one, a
   WRITE path.** It resolves `auth.uid()` to a staff id only to stamp
   `coach_staff_id`, but never checks the caller is authorized over the
   `_doctor_staff_id` argument. So any authenticated user can create (or read)
   a coaching-baseline record for any doctor and record **themselves** as that
   doctor's coach. This writes rows, so it is not just a read leak — it lets a
   user insert coaching relationships that did not happen.

2. **`coach_baseline_exists_for_doctor(uuid)` — low-sensitivity read.** Returns
   a boolean "does a baseline exist for this doctor" with no caller check. Only
   discloses existence, so low severity, but it is the same missing-guard
   shape and should be closed in the same pass.

These are narrow (doctor-coaching track, small population) but real and live.

## Why this is a separate ticket from SEC-4

SEC-4's guard, `can_current_user_view_staff(p_staff_id)`, answers "may the
caller VIEW this staff member." These two functions need a different
predicate: "is the caller this doctor's **assigned coach** (or a super
admin)." The repo already has `is_assigned_doctor_coach(uuid, uuid)`, which is
almost certainly the right building block. Because the authorization question
differs, reusing SEC-4's guard verbatim would be wrong; SEC-5 gets its own.

## Approach (to verify against the live schema before writing)

1. Read the live bodies of both functions (`pg_proc.prosrc`) and reproduce
   them **verbatim** with only a guard prepended (the SEC-4 experience:
   preserve the body exactly; watch for `\r\n` line endings on
   Lovable-authored functions — normalize nothing).
2. For the write function, prepend:
   `if not (public.is_assigned_doctor_coach(auth.uid(), _doctor_staff_id)
   or public.is_super_admin(auth.uid())) then raise exception 'not authorized
   ...' using errcode = '42501'; end if;` — but first confirm
   `is_assigned_doctor_coach` takes `(caller_uid, doctor_staff_id)` in that
   order and encodes the intended rule; if the intended rule is broader (e.g.
   a doctor may create their own baseline), widen the guard to match, and
   record the decision.
3. Guard the exists() function with the same predicate.
4. Idempotent (CREATE OR REPLACE), `app.change_reason` set, and a `DO $$`
   sanity block that asserts both functions are still SECURITY DEFINER and now
   contain the guard call (mirror SEC-4's block).
5. Do **not** apply; land the migration file for supervised apply via the
   dashboard SQL editor (or the MCP apply-then-verify path SEC-4 used, which
   includes a body-integrity md5 check and a functional caller test).

## Acceptance

- A plain authenticated user calling `get_or_create_coach_baseline_assessment`
  for a doctor they do not coach is rejected (42501), and no row is written.
- An assigned doctor-coach (and super admin) still succeeds — verified by
  simulating the caller's `auth.uid()` in a transaction, as SEC-4 was.
- `coach_baseline_exists_for_doctor` returns its boolean only for authorized
  callers.
- Function bodies otherwise byte-equivalent to the originals (integrity check).

## Notes

- Blast radius: find all callers first (`is_assigned_doctor_coach` and the two
  functions) so the guard does not break a legitimate coach-baseline flow.
- Related: SEC-4 (applied 2026-08-20) and the SEC-2 family established the
  shared pattern — a caller-scope guard mirroring an existing access rule,
  failing loudly, applied idempotently.
