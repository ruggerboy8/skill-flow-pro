# Skill Flow Pro — Glossary

*Definitions of the domain concepts used throughout the codebase. If you are an AI assistant
or a new developer, read this before making recommendations — many bugs come from
misunderstanding these terms.* Last verified: 2026-06-22.

> **(legacy)** markers below mean the concept is still present in code/data but is **no longer
> part of intended functionality** and is a candidate for retirement. See
> [improvement-backlog.md](improvement-backlog.md) for the cleanup plan and rationale.

---

## Org hierarchy (who/where)

- **Organization** — The **tenant**: the top-level contracting entity (a DSO, a practice group,
  or a single practice). The organization boundary defines data isolation — users in one
  organization can never see another's data. Table: `organizations`. *(Deprecated term: "tenant".)*
- **Group** — A sub-grouping of locations within an organization (e.g. "Alcan North"). Table:
  `practice_groups`. *(Deprecated term: "organization"/"org" — old code may still misuse these.)*
- **Location** — An individual practice/office. Owns the program calendar (start date, cycle
  length), timezone, and submission deadlines. Table: `locations`.
- **Staff** — Any user of the platform, of any role. Table: `staff`. Linked to a Supabase Auth
  user via `staff.user_id`.

Hierarchy: **Organization → Group → Location → Staff**. For a single-practice customer, the top
three levels collapse into one.

## Roles & permissions (who can do what)

- **Role** — A staff member's job function. There is a **canonical/general set** of role terms
  (e.g. DFI, RDA — which generally means "dental assistant", Office Manager) in `roles`, and each
  organization can **override the display name** for its own context. Example: the same
  underlying role shows as **"RDA"** for Alcan but **"Dental Nurse"** for a UK org. Canonical
  table: `roles`; per-organization display labels: `organization_role_names`. When showing a role
  to a user, resolve the org-specific label (the `resolve_role_display_name()` RPC does this),
  not the raw `roles.role_name`.
- **Participant** — A user who is *in* the weekly loop: sees weekly Pro Moves and submits
  confidence/performance scores.
- **Non-participant** — A user whose job is administrative/coaching; defined by capabilities and
  scope rather than the weekly loop.
- **Coach** — Supports a set of staff (reviews submissions, runs evaluations, gives feedback).
  *(Candidate for consolidation: with the flexible capability model, "coach" as a distinct role
  and/or permission may be redundant — what makes someone a coach is really "has scope over staff
  + can review submissions/evals." See [improvement-backlog.md](improvement-backlog.md).)*
- **Office Manager** — A hybrid: a participant who also gets visibility into their location.
- **Regional / Org Admin** — Oversees multiple locations or a whole organization.
- **Doctor** — A dentist on a separate, looser development track (see *Doctor track* below).
- **Clinical Director** — Manages one or more doctors' development.
- **Super Admin / Platform Admin** — Skill Flow Pro staff with cross-organization powers.
- **Capability toggle** — The newer, flexible permission model: per-user booleans
  (`can_view_submissions`, `can_manage_users`, …) in `user_capabilities`, replacing the older
  `is_*` boolean flags on `staff`. Both currently coexist (see [data-model.md](data-model.md)).
- **Scope** — Which locations/orgs a non-participant can see. Table: `coach_scopes`
  (`scope_type` = `'org'` or `'location'`). Scope + capabilities together define reach.

## The competency framework (what you learn)

- **Domain** — One of the top-level skill areas (4 of them). Table: `domains`.
- **Competency** — A specific skill within a domain (126 of them). Table: `competencies`.
- **Pro Move** — The atomic unit: a single, specific, observable behavior a person can practice
  and be scored on. ~332 of them. Table: `pro_moves`. Has a `practice_type`
  (`pediatric` | `general` | `all`) for multi-tenancy. Pro Moves can have attached
  **resources** (videos, docs) in `pro_move_resources`.
- **Platform library vs. Organization library** — The *platform library* is the canonical set of
  Pro Moves owned by Skill Flow Pro. Each organization gets a copy/visibility layer
  (`organization_pro_moves`, `organization_pro_move_overrides` for show/hide,
  `organization_pro_move_content_overrides` for per-org wording). Orgs control visibility, not
  the core content (Phase 1).

## The weekly loop (the core mechanic)

- **Cycle** *(legacy)* — A block of weeks (default **6**, per-location `cycle_length_weeks`),
  numbered from `program_start_date`. **This is early-legacy.** It dates from when onboarding was a
  fixed 18-week curriculum that everyone progressed through in lockstep. Today staff just join and
  do whatever Pro Move is currently assigned — there is no onboarding period — so the *cycle*
  concept is no longer meaningful to the product. It is still wired into RPCs and the legacy
  cycles-1–3 paths, so removing it is a careful job (see [improvement-backlog.md](improvement-backlog.md)).
- **Week (week-in-cycle)** *(legacy framing)* — Position within a cycle (1…cycle_length), computed
  from weeks elapsed since program start. The week-calculation formula in
  [`src/lib/unifiedAssignments.md`](../src/lib/unifiedAssignments.md) is **currently load-bearing
  and must stay identical across all surfaces** (drift is a recurring bug source) — *even though*
  the underlying cycle/week concept is legacy. Treat it as "fragile until we retire it," not
  "sacred forever."
- **Check-In** — The start-of-week moment when a participant rates **confidence** on each
  assigned Pro Move. UI: the Confidence wizard.
- **Check-Out** — The end-of-week moment when a participant rates actual **performance**. UI: the
  Performance wizard.
- **Confidence score** — Self-rating *before* the week of how confident they are on a Pro Move.
- **Performance score** — Self-rating *after* the week of how they actually did. Both live in
  `weekly_scores`.
- **Weekly assignment** — The set of Pro Moves a given staff member is assigned for a given week.
  Canonical table: `weekly_assignments`. Submission status (which scores are in, on-time vs.
  late) is derived from `weekly_scores`.
- **On-time vs. late** — A submission is on-time if made within the location's deadline window
  for that step; otherwise it's marked late. Deadlines are per-location
  (`conf_due_day`/`conf_due_time`, `perf_due_day`/`perf_due_time`).
- **Rollover** — Logic that carries an unfinished/again week forward. (See `sequencer-rollover`
  / week-assembly logic.)
- **Excusal** — A staff member, submission, or location can be marked exempt from required
  submissions (e.g. leave). Tables: `excused_weeks`, `excused_submissions`, `excused_locations`.

## Sequencing (how weekly Pro Moves get chosen)

- **Sequencer** — A **recommendation engine**, *not* an auto-assigner. It runs over historical
  data to **suggest** which Pro Moves might be good to assign next; a **human (in practice, a
  Regional Manager) reviews those suggestions and manually decides** what actually gets assigned.
  Runs are logged in `sequencer_runs`; `sequencer-rank` produces rankings. *(Common
  misconception: the sequencer does NOT decide the weekly assignment on its own.)*
- **Weekly plan** — The plan of Pro Moves for a role/week that a manager has set (informed by
  sequencer recommendations). Table: `weekly_plan`. **This is the current/active source.**
- **Weekly focus** *(legacy)* — The old assignment source (cycles 1–3). Table: `weekly_focus`
  — **DEPRECATED**, kept only because some historical staff views may still read it. As long as
  current functionality points to `weekly_plan` / `weekly_assignments`, this can eventually go.
- **Rollover** *(legacy)* — A start-of-week process (Monday 00:01 local) that checks whether a
  participant completed the prior week's assigned Pro Moves and, if not, pushes the unfinished
  *site* moves into their **backlog**. It **only runs for cycles 1–3** (explicitly skipped for
  cycle 4+) and reads the deprecated `weekly_focus`/`self_select` data — so it is part of the same
  legacy cluster as *cycle* and *self-select* and is effectively dormant today. (`src/v2/rollover.ts`,
  `sequencer-rollover`.)
- **Backlog** — The *storage list* that rollover feeds: a per-staff queue of assigned-but-not-
  completed Pro Moves, so they can resurface. Tables: `user_backlog_v2` (active store) and
  `user_backlog` (legacy, empty). **Backlog = the list; rollover = the thing that adds to it.**
- **Self-select** *(won't adopt)* — A never-fully-adopted mode where staff would choose their own
  Pro Moves (`weekly_self_select`, `weekly_focus.self_select`). Product decision: staff will **not**
  self-select. Safe to remove if it breaks nothing; otherwise note it as "considered, not adopted."
- **Quarter focus** — Selections a staff member makes **after receiving an evaluation** (a
  post-evaluation focus choice), not a calendar-quarter feature. Table: `staff_quarter_focus`.

## Evaluations & assessments (the measurement layer)

- **Evaluation** — A **coach's** structured assessment of a staff member, with associated audio
  recording and reporting. Header in `evaluations`, line items in `evaluation_items`. There is a
  **release flow** (currently performed by **org admins**) that publishes the evaluation to the
  staff member; `notify-eval-release` handles notification. *(Known to have bugs — an active
  feature John + Claude plan to work on; see [improvement-backlog.md](improvement-backlog.md).)*
- **Baseline assessment** — A starting-point assessment. **Two distinct types, do not conflate:**
  - **Doctor baseline** — performed **only by clinical directors**, part of the doctor track.
    **Stays.** Tables: `doctor_baseline_assessments` / `_items`.
  - **Coach baseline** *(Alcan-specific, candidate for removal)* — used **only when Alcan onboards
    a brand-new practice** to capture that practice's staff baseline — *not* for individual new
    hires. Barely used and likely confusing outside Alcan. Open decision: gate it to Alcan only,
    or drop it and treat **an organization's first evaluation as its baseline**. Tables:
    `coach_baseline_assessments` / `_items` / `coach_baseline_audit`.

## Doctor / clinical track

- **Doctor track** — A separate, looser development flow for dentists, facilitated by a Clinical
  Director rather than the weekly cadence.
- **Coaching session** — A facilitated session between clinical director and doctor.
  Tables: `coaching_sessions`, `coaching_session_selections`, `coaching_meeting_records`,
  `coaching_agenda_templates`.

## Integrations & infrastructure

- **Deputy** — A workforce-management/scheduling system integrated for staff/employee data.
  Tables: `deputy_connections`, `deputy_employee_mappings`, `deputy_sync_runs`.
- **Reminders** — Templated nudges (e.g. "submission due"). Tables: `reminder_templates`,
  `reminder_log`; edge function `coach-remind`.
- **Audit logs** — `admin_audit` (administrative actions) and `staff_audit` (changes to staff
  records).
- **app_kv** — A small key/value store for app-level config/state.
- **site_cycle_state** — Global cycle/week state for the site.
- **Masquerade / Sim** — A dev/admin capability to view the app *as* another staff member (see
  `useStaffProfile` masquerade and `src/devtools/SimProvider`). Useful for support and QA.
