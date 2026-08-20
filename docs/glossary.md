# Skill Flow Pro: Glossary

*Rewritten 2026-08-19 (DOC-3) to replace the archived version, which described
`user_backlog_v2` as the active recommender store and listed two other tables
dropped on 2026-07-25 as present. Definitions of the domain concepts used
throughout the codebase. If you are an AI assistant or a new developer, read
this before making recommendations. Many bugs come from misunderstanding
these terms.*

> **(legacy)** markers below mean the concept is still present in code or data
> but is **not part of how the product works today.** New work should not be
> built on it, and it is a candidate for eventual removal.

---

## Org hierarchy (who/where)

- **Organization**: The **tenant**, the top-level contracting entity (a DSO, a
  practice group, or a single practice). The organization boundary defines
  data isolation. Table: `organizations`. *(Deprecated term: "tenant".)*
- **Group**: A sub-grouping of locations within an organization (e.g. "Alcan
  North"). Table: `practice_groups`. *(Deprecated term: "organization"/"org";
  old code may still misuse these.)*
- **Location**: An individual practice/office. Owns the program calendar
  (start date, cycle length), timezone, and submission deadlines. Table:
  `locations`.
- **Staff**: Any user of the platform, of any role. Table: `staff`. Linked to
  a Supabase Auth user via `staff.user_id`.

Hierarchy: **Organization to Group to Location to Staff**. For a
single-practice customer, the top three levels collapse into one.

## Roles & permissions (who can do what)

- **Role**: A staff member's job function. There is a canonical set of role
  terms (e.g. DFI, RDA, a dental assistant, Office Manager) in `roles`, and
  each organization can override the display name for its own context (the
  same underlying role can show as "RDA" for Alcan and "Dental Nurse" for a UK
  org). Canonical table: `roles`; per-org display labels:
  `organization_role_names`. Resolve the org-specific label via
  `resolve_role_display_name()`, not the raw `roles.role_name`.
- **Participant**: A user who is *in* the weekly loop, seeing weekly Pro Moves
  and submitting confidence/performance scores.
- **Non-participant**: A user whose job is administrative/coaching, defined
  by capabilities and scope rather than the weekly loop.
- **Coach**: Supports a set of staff (reviews submissions, runs evaluations,
  gives feedback).
- **Office Manager**: A hybrid, a participant who also gets visibility into
  their location.
- **Regional / Org Admin**: Oversees multiple locations or a whole
  organization.
- **Doctor**: A dentist on a separate, looser development track (see *Doctor
  track* below).
- **Clinical Director**: Manages one or more doctors' development.
- **Super Admin / Platform Admin**: Skill Flow Pro staff with
  cross-organization powers.
- **Capability toggle**: The permission model in active use, per-user
  booleans (`can_view_submissions`, `can_manage_users`, etc) in
  `user_capabilities`. **Correction (2026-08-19): this fully replaced the
  older `is_*` boolean flags on `staff` for permission decisions** on
  2026-07-25; `src/hooks/deriveUserRole.ts` (which every route guard and
  permission check goes through) reads only `user_capabilities` for
  `isSuperAdmin`/`isOrgAdmin`/`isParticipant`. The old flags still exist on
  `staff` and are still touched by some admin UI and a few SQL RPCs, but they
  are no longer where the app decides what a user can do. See
  [data-model.md](data-model.md).
- **Scope**: Which locations/groups a non-participant can see. Table:
  `coach_scopes` (`scope_type` = `'org'` or `'location'`). Despite the name,
  a `'org'`-typed row's `scope_id` is a `practice_groups.id` (legacy naming
  from before "Group" replaced "Organization" as the term for that level; see
  [data-model.md](data-model.md)). Scope plus
  capabilities together define reach.

## The competency framework (what you learn)

- **Domain**: One of the top-level skill areas (4 of them). Table: `domains`.
- **Competency**: A specific skill within a domain. Table: `competencies`.
- **Pro Move**: The atomic unit, a single, specific, observable behavior a
  person can practice and be scored on. Table: `pro_moves`. Has a
  **`practice_types`** column, a **text array** (e.g. `{pediatric_us}`), not
  a single value. It was a singular `practice_type` column until 2026-03-11,
  when it was converted to an array (migration `20260311220946`). If you see
  a doc or code comment treating it as singular, that is describing the
  pre-March design. Pro Moves can have attached **resources** (videos, docs)
  in `pro_move_resources`.
- **Platform library vs. Organization library**: The *platform library* is
  the canonical set of Pro Moves owned by Skill Flow Pro. Each organization
  gets a copy/visibility layer (`organization_pro_moves`,
  `organization_pro_move_overrides` for show/hide,
  `organization_pro_move_content_overrides` for per-org wording). Orgs
  currently control visibility, not core content.

## The weekly loop (the core mechanic)

- **Weekly assignment**: The set of Pro Moves live for a given role, in a
  given org (or globally, for the platform default), for a given week.
  **This is the only live assignment path.** Canonical table:
  `weekly_assignments`. **Correction (2026-08-19): this is not a per-staff
  table.** It has no `staff_id` column; a row is shared by every staff member
  matching its `role_id` + `week_start_date` + `org_id`/`location_id` scope.
  What a specific staff member actually did with their role's assignments,
  and their submission status (on-time vs. late), lives on `weekly_scores`,
  which does have `staff_id`. See [data-model.md](data-model.md).
- **Check-In**: The start-of-week moment when a participant rates
  **confidence** on each assigned Pro Move. UI: the Confidence wizard.
- **Check-Out**: The end-of-week moment when a participant rates actual
  **performance**. UI: the Performance wizard.
- **Confidence score** / **Performance score**: Self-ratings before and after
  the week's work. Both live in `weekly_scores`.
- **On-time vs. late**: A submission is on-time if made within the
  location's deadline window for that step; otherwise it's marked late.
  Deadlines are per-location (`conf_due_day`/`conf_due_time`,
  `perf_due_day`/`perf_due_time`).
- **Excusal**: A staff member, submission, or location can be marked exempt
  from required submissions (e.g. leave). Tables: `excused_weeks`,
  `excused_submissions`, `excused_locations`.

### Legacy weekly-loop cluster, read this before touching any of these terms

**Domain correction from the product owner, 2026-08-19: "cycle" does not need
to be a term or a calculation at all going forward.** It is a holdover from the
platform's first iteration, which had a fixed 18-week onboarding curriculum
that every new hire progressed through in lockstep, counted in numbered
"cycles." That onboarding model is gone. **A new staff member today simply
joins the globally-assigned Pro Moves already running for their role.** There
is nothing to onboard into and nothing to count cycles from. The following are
all part of the same now-defunct cluster:

- **Cycle** *(legacy)*: A block of weeks (per-location `cycle_length_weeks`),
  numbered from `program_start_date`. No longer a live product concept. **The
  calculation is still present in code.** `src/lib/locationState.ts` computes
  `cycleNumber` and `weekInCycle` from elapsed weeks, and it is still called
  from the weekly-loop pages. It has not been deliberately retired yet; treat
  it as "present but should not inform product reasoning," not as evidence
  that cycles still matter.
- **Week-in-cycle** *(legacy)*: Position within a cycle. Same status as
  *Cycle* above: computed in `locationState.ts`, not a concept to design
  around.
- **Weekly plan** *(retired 2026-07-25)*: The manager-set plan of Pro Moves
  for a role/week, informed by sequencer recommendations. Table `weekly_plan`
  was renamed to `zzz_archived_weekly_plan` (data preserved, not queried).
  **Superseded by `weekly_assignments`.**
- **Weekly focus** *(retired 2026-07-25)*: The original assignment source
  (cycles 1 through 3). Table `weekly_focus` was renamed to
  `zzz_archived_weekly_focus`. **Do not confuse with the `weekly_focus_id`
  column** that still exists on `weekly_scores`; that is a legacy-named
  identifier column kept for ID-format compatibility, not a live reference to
  this table. See [data-model.md](data-model.md).
- **Rollover** *(retired 2026-07-24/25)*: A start-of-week process that checked
  whether a participant completed the prior week's Pro Moves and, if not,
  pushed them into a backlog. It only ran for cycles 1 through 3 and read the
  now-archived `weekly_focus` data. On the src side this is gone, not merely
  dormant: `src/v2/rollover.ts` was deleted (commit `735c83c4`, "2.4 Slice A:
  retire rollover"), and the `ThisWeekPanel.tsx` call site was removed the
  same day, with a comment there noting "missed weeks are simply missed" now.
  Whether the deployed `sequencer-rollover` edge function is still gone from
  production, or was recovered under a separate ticket, is outside what this
  doc tracks; check the edge function's own state before assuming either way.
- **Backlog** *(dropped 2026-07-25)*: There is currently **no backlog table
  at all**. `user_backlog` and `user_backlog_v2` were both dropped (migration
  `20260725120000`), along with the RPCs that wrote to them
  (`add_backlog_if_missing`, `resolve_backlog_item`). If you see a doc calling
  `user_backlog_v2` "the active recommender backlog," that claim has been
  wrong since 2026-07-25.
- **Self-select** *(dropped 2026-07-25, never adopted)*: A mode where staff
  would choose their own Pro Moves. `weekly_self_select` was dropped in the
  same migration as the backlog tables. Product decision: staff do not
  self-select.
- **Manager priorities** *(dropped 2026-07-25)*: `manager_priorities` was
  dropped in the same pass; it was never populated.
- **Resource events** *(dropped 2026-07-25)*: `resource_events` was dropped
  in the same pass; it was never populated.

## Sequencing (how weekly Pro Moves get chosen)

- **Sequencer**: A **recommendation engine**, *not* an auto-assigner. It runs
  over historical data to **suggest** which Pro Moves might be good to assign
  next; a **human (in practice, a Regional Manager) reviews those suggestions
  and manually decides** what actually gets assigned into `weekly_assignments`.
  Runs are logged in `sequencer_runs`; `sequencer-rank` produces rankings.
  *(Common misconception: the sequencer does not decide the weekly assignment
  on its own.)*
- **Quarter focus**: Selections a staff member makes **after receiving an
  evaluation** (a post-evaluation focus choice), not a calendar-quarter
  feature. Table: `staff_quarter_focus`.

## Evaluations & assessments (the measurement layer)

- **Evaluation**: A **coach's** structured assessment of a staff member, with
  associated audio recording and reporting. Header in `evaluations`, line
  items in `evaluation_items`. There is a release flow (currently performed by
  org admins) that publishes the evaluation to the staff member;
  `notify-eval-release` handles notification.
- **Baseline assessment**: A starting-point assessment. **Two distinct
  types, do not conflate. Correction (2026-08-19): an earlier version of
  this entry had the two directions reversed; this is now checked against
  both wizards' code.**
  - **Doctor baseline**: the doctor's **own self-baseline**, authored by the
    doctor about themselves. `src/pages/doctor/BaselineWizard.tsx` writes to
    `doctor_baseline_assessments` with `doctor_staff_id: staff.id`, where
    `staff` is the logged-in doctor. Tables: `doctor_baseline_assessments`,
    `doctor_baseline_items`.
  - **Coach baseline** *(Alcan-specific, candidate for removal)*: the
    clinical director's **observed** baseline of a doctor, not a
    self-assessment. `src/components/clinical/CoachBaselineWizard.tsx`
    writes to `coach_baseline_assessments`, keyed by both `doctor_staff_id`
    (who it's about) and `coach_staff_id` (who authored it, the clinical
    director). Historically used when Alcan onboards a brand-new practice.
    Tables: `coach_baseline_assessments`, `coach_baseline_items`,
    `coach_baseline_audit`.

## Doctor / clinical track

- **Doctor track**: A separate, looser development flow for dentists,
  facilitated by a Clinical Director rather than the weekly cadence.
- **Coaching session**: A facilitated session between clinical director and
  doctor. Tables: `coaching_sessions`, `coaching_session_selections`,
  `coaching_meeting_records`, `coaching_agenda_templates`.

## Feature flags

Live flags found by grepping `src/` for `localStorage` and `import.meta.env`
toggles, added here 2026-08-19 (DOC-3) because neither had a canonical doc
entry before this:

- **`eval_review_v2`** (localStorage, `src/lib/reviewRoute.ts`): gates the
  rebuilt staff review wizard. When set to `1`, `reviewPath()` routes to
  `/evaluation/:id/review-v2` instead of the classic `/review`; consumed by
  `CurrentFocusCard`, `EvalReadyCard`, and `PerformancePage`. Default is V1
  (`REVIEW_V2_DEFAULT = false`) until it is promoted for everyone.
- **`VITE_ORG_LIBRARY_AUTHORING`** (env var, `src/lib/featureFlags.ts`):
  intended to gate org-level Pro Move authoring (letting an org create/edit
  its own custom moves). As of this pass it has **no consumers anywhere in
  `src/`**; the exported `orgLibraryAuthoringEnabled` constant is defined but
  not yet read by any UI or policy check. It is "live" in the sense that the
  env var is wired up and would flip the constant, not in the sense that it
  currently changes anything a user sees.

## Integrations & infrastructure

- **Deputy**: A workforce-management/scheduling system integrated for
  staff/employee data. Tables: `deputy_connections`, `deputy_employee_mappings`,
  `deputy_sync_runs`.
- **Reminders**: Templated nudges (e.g. "submission due"). Tables:
  `reminder_templates`, `reminder_log`; edge function `coach-remind`.
- **Audit logs**: `admin_audit` (administrative actions) and `staff_audit`
  (changes to staff records).
- **app_kv**: A small key/value store for app-level config/state.
- **Masquerade / Sim**: A dev/admin capability to view the app *as* another
  staff member (see `useStaffProfile` masquerade and `src/devtools/SimProvider`).
  Useful for support and QA.
