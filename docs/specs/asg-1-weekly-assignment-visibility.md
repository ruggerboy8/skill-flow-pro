# Spec: ASG-1, weekly-assignment visibility fixes

**Status:** draft, awaiting John's approval (design decision in Fix 2 flagged).
**Lane:** cross-cutting (core weekly-assignment read/write path; live prod, just caused an outage).
**Ticket:** ASG-1 (Motion, MyProMoves Dev Board). Companion UX ticket: ASG-2.
**Date:** 2026-08-28
**Origin:** investigation of the 2026-08-28 "OMs see 'No Pro Moves configured'" outage.

## Background: what happened

Regional managers configured the Office Managers' pro moves for the week of
2026-08-24, but every OM in Alcan saw "No Pro Moves configured for this week."
Root cause: the moves were written as `status='draft'` and never advanced to
`locked`. The participant home (`ThisWeekPanel` -> `assembleCurrentWeek` ->
`locationState.assembleWeek`) only reads `weekly_assignments` with
`status='locked'`, so the drafts were invisible. John unblocked it live by
flipping those rows to `locked` via Lovable.

The investigation confirmed three distinct defects in the weekly-assignment
read/write path. This spec fixes all three as a set (John's call 2026-08-28).

## The write and read paths (verified)

- **Builder generate:** the planner's "auto-assign" button
  (`WeekBuilderPanel.tsx:438`) calls the `sequencer-auto-assign` edge function,
  which INSERTS `weekly_assignments` with `status='draft'`, `location_id=null`,
  `source='org'`, `generated_by='auto'` (`sequencer-auto-assign/index.ts:247`).
- **Builder save:** the planner's save calls `planner-upsert` (`saveWeek`),
  which writes `status='locked'` (`planner-upsert/index.ts:191,227`).
- **Participant read:** `assembleWeek` queries `weekly_assignments` by
  `role_id` + `week_start_date` + `status='locked'` + `org_id`
  (`locationState.ts` ~158-166).

So a row is only visible to staff once it is `locked`, and only `saveWeek`
locks it. Auto-assign alone leaves invisible drafts that LOOK set in the builder.

---

## Fix 1: eliminate the `draft` status for assignments

**Decision (John, 2026-08-28): generate publishes immediately.** A written move
beats an unwritten one. There is no product reason for an assignment row to be
`draft`; a row's true edit-lock is governed by whether a score has been
submitted, not by `status` (see below), so "published" and "still editable" are
not in tension.

**Data reality:** as of 2026-08-28 only **1** `draft` row exists in all of
`weekly_assignments` (a stale 2026-04-13 row) vs **1,422** `locked`. The draft
state is already vestigial; it exists only in the gap between generate and save.

Changes:
1. `sequencer-auto-assign/index.ts:247`: write `status:'locked'` instead of
   `'draft'`. Generate now publishes directly.
2. Re-examine the "delete previous drafts in empty slots" step
   (`sequencer-auto-assign/index.ts:211-219`). Today it deletes non-locked rows
   in empty slots before inserting. With drafts gone, regeneration must replace
   rows that have **no submitted score yet**, and must NEVER delete or overwrite
   a row that already has a score. Gate the replace on absence of `weekly_scores`
   for that (role, week, display_order), mirroring the "skippedLocked" check that
   `planner-upsert` already does (`planner-upsert/index.ts:145-156`). This is the
   real invariant: **editable until the first score is submitted, immutable
   after.**
3. `planner-upsert` already writes `locked`; no change beyond confirming the
   score-gated edit-lock is the single source of truth for immutability.
4. Clean up the 1 stale `draft` row (delete it; it is a past week with no
   scores).
5. `status` enum/column: after (1)-(4), `draft` is never written. Optionally
   retire it from the type/enum in a follow-up; not required for the fix. Keep
   `status` (always `locked`) for now to avoid a wider schema change, but add a
   code comment that `draft` is deprecated and the score-presence check is the
   real lock.

Acceptance:
- Clicking auto-assign in the planner makes the moves visible to staff
  immediately (no separate save required).
- Editing/regenerating a slot with no score replaces it; a slot with a score is
  never overwritten or deleted.
- No new `draft` rows appear in `weekly_assignments`.

---

## Fix 2: one canonical week-Monday for both write and read  (DESIGN DECISION)

**The defect:** the builder computes `week_start_date` in hardcoded
`America/Chicago` (`plannerUtils.ts:7`, `getChicagoMonday`). The participant read
computes its Monday in the LOCATION's own timezone plus policy/due-day offsets
(`locationState.ts` ~135-137, `getWeekAnchors(now, location.timezone, offsets)`).
When those disagree, the read's `week_start_date` filter misses the written row
and the staff member sees an empty week.

**Why this is a present risk, not just latent:** `weekly_assignments` rows are
**org-level** (`location_id = null`), so ONE row set per (org, role, week) serves
every location in the org. But **Alcan spans three timezones** (Chicago, Denver,
New York across 12 locations; verified 2026-08-28). A per-location lookup Monday
is therefore fundamentally incompatible with an org-level row: the Denver and
New York locations can compute a different Monday than the Central Monday the
builder wrote, and silently see nothing. Other orgs are single-tz today
(Confident Dentist Academy + Avenue Dental on Europe/London), but Alcan's own
multi-tz footprint means this can bite in production now.

**The fix direction is forced by the data model:** because the assignment row is
an org concept, its week key MUST be a single org-canonical Monday, computed
IDENTICALLY on write and read. Per-location timezone stays ONLY for due-date /
deadline display (which legitimately varies by location); it must NOT drive the
assignment-lookup key.

**Design decision for John (pick one):**
- **(A) Per-org canonical timezone (recommended).** Add `organizations.timezone`
  (default `America/Chicago` for existing orgs; set UK orgs to `Europe/London`).
  Introduce ONE shared helper, e.g. `getAssignmentWeekMonday(orgTimezone, now)`,
  used by BOTH `sequencer-auto-assign`/`planner` (write) and `assembleWeek`
  (read) to compute `week_start_date`. Due dates keep using
  `getWeekAnchors(location.timezone, offsets)`. Clean, supports the UK orgs
  correctly, and makes multi-tz orgs like Alcan coherent (one org week).
- **(B) Platform-fixed canonical timezone.** Both sides compute the Monday in a
  single platform timezone (Central). Minimal change, matches today's write, but
  wrong for a UK org whose week should start on a London Monday.
- **(C) Add `location_id` to assignments and write per-location rows.** Biggest
  change; contradicts the current org-level model; not recommended.

Recommendation: **(A)**. It is the only option that is correct for both Alcan
(multi-tz, Central-anchored) and the UK orgs, and it cleanly separates "which
assignment week am I in" (org-canonical) from "when are my deadlines"
(per-location).

Acceptance (after A):
- A Denver or New York Alcan location and a Central Alcan location, in the same
  calendar week, all resolve the SAME `week_start_date` and see the same locked
  moves.
- A UK-org location resolves its week in `Europe/London` on both write and read.
- Due-date display still reflects each location's own timezone/offsets.

---

## Fix 3: one org-id resolver for both write and read

**The defect:** role derivation prefers the staff row's own org
(`deriveUserRole.ts:105`: `staff.organization_id ?? location -> practice_groups`)
while the participant read resolves org strictly via
`location -> practice_groups.organization_id` (`locationState.ts` ~141-155). A
staff row whose `organization_id` disagrees with its location's org would be
written under one org and read under another -> silent empty week.

**Live blast radius:** as of 2026-08-28, **0** of 110 staff have a mismatch (all
have a direct `organization_id` equal to their location-derived org). So this is
a robustness/consistency fix, not an active break, but it is a latent trap the
same shape as the one that just cost a day.

Fix: define a SINGLE canonical org resolver used everywhere assignments are
written and read. Recommendation: canonicalize on
`location -> practice_groups.organization_id` (the RLS-aligned, location-derived
truth, and the same lineage as `current_user_org_id()`), and treat
`staff.organization_id` as a derived cache, not an independent source. Add a
lightweight data-integrity check (a query or a scheduled assertion) that flags
any staff row where `staff.organization_id` disagrees with its location-derived
org, so drift is caught rather than silently mis-routing.

Acceptance:
- Write and read resolve the same org for every staff member.
- A deliberately mismatched `staff.organization_id` no longer changes which
  assignments a participant sees.
- The integrity check reports 0 mismatches (and is re-runnable).

---

## Build order and blast radius

All three touch the core weekly-assignment path that just caused an outage, so
build behind careful QA and John's live test. Suggested order within the set:
1. Fix 1 (draft removal) - smallest, highest current value, unblocks the exact
   reported failure mode going forward.
2. Fix 3 (org resolver) - small, no live victims, pure consistency.
3. Fix 2 (canonical Monday) - the design decision; largest; needs the
   `organizations.timezone` addition if option A.

DB impact: Fix 2A adds `organizations.timezone` (nullable, backfilled). Fixes 1
and 3 are code + a one-row cleanup. No destructive changes. Edge-function
changes (`sequencer-auto-assign`) deploy via the CLI path; frontend via Lovable.

## Out of scope (separate ticket ASG-2)

The builder UX itself: the generate-vs-save model is unclear, and a manager can
believe moves are "set" when they are not. ASG-2 reconsiders/redesigns the
builder flow (John, 2026-08-28). This spec only makes the data correct; ASG-2
makes the interaction clear.

## Docs the builder must read

- this spec; `docs/data-model.md`; CLAUDE.md (migrations, RLS dependency rule,
  `db-ddl-must-lag-deploy`)
- `src/lib/plannerUtils.ts`, `src/lib/locationState.ts`,
  `src/hooks/deriveUserRole.ts`, `supabase/functions/sequencer-auto-assign/`,
  `supabase/functions/planner-upsert/`, `src/components/planner/WeekBuilderPanel.tsx`
- the `db-ddl-must-lag-deploy` and domain-model memories
