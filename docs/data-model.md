# Skill Flow Pro: Data Model (Current State)

*Rewritten 2026-08-19 (DOC-3) to replace the archived version, which listed five
tables dropped on 2026-07-25 as live. Verified against `supabase/migrations/`
(628+ files) and grep against `src/` and `supabase/functions/` for what actually
gets queried today. This pass did not have live database access (see CLAUDE.md,
"Supabase connection": the sandbox this was written in cannot reach Supabase's
management API), so row counts below are a mix of the 2026-08-18 live-verified
assessment pass (marked) and June 2026 figures carried over from the prior
version of this doc (marked, and may have drifted). Treat every count as
"relative scale," not a live number. For the proposed/intended multi-tenant
design (partly superseded by what actually shipped), see
[enterprise-architecture.md](enterprise-architecture.md).*

> **RLS is enabled on every table.** Access is enforced in the database, not
> just the app. Exact columns, foreign keys, and policies live in
> `supabase/migrations/`. When in doubt, treat the migrations plus
> `npx supabase db diff` as the source of truth and this doc as the map.

> **"Cycle" is a legacy concept, not a current one.** The old system had a fixed
> 18-week onboarding curriculum every new hire progressed through in lockstep,
> numbered in "cycles" of a few weeks each. That is gone. A new staff member
> today simply joins the globally-assigned Pro Moves already running for their
> role. There is no onboarding period and nothing to count cycles from. The
> cycle/week-in-cycle **calculation** is still present in code
> (`src/lib/locationState.ts`, `cycleNumber`/`weekInCycle`) and several RPCs
> still take cycle/week parameters, so it has not been deleted, but it should
> not be treated as a live domain concept when reasoning about the product. See
> [glossary.md](glossary.md) for the full legacy-cluster breakdown.

---

## 1. Org hierarchy & identity

| Table | Purpose |
|---|---|
| `organizations` | **Tenant.** Top-level contracting entity, the data-isolation boundary. Has `practice_type` (singular; this column stayed singular, it did not become an array like `pro_moves.practice_types` did). **Correction (2026-08-19):** the earlier version of this doc wrongly said the values were `pediatric` \| `general` \| `all`. The same migration that converted `pro_moves.practice_type` to an array (`20260311220946`) also renamed the organization-level values to `pediatric_us` and `general_us`, added `general_uk`, and installed constraint `chk_org_practice_type CHECK (practice_type IN ('pediatric_us', 'general_us', 'general_uk'))`. `'all'` was never a legal value for `organizations.practice_type`; that value only ever existed on `pro_moves`. |
| `practice_groups` | **Group.** Sub-grouping of locations. FK `organization_id → organizations.id` (added 2026-03-06, migration `20260306190002`). |
| `locations` | **Location.** Individual practice. Owns `program_start_date`, `cycle_length_weeks` (legacy, still read by the cycle calculation above), `timezone`, and per-step deadlines (`conf_due_day/time`, `perf_due_day/time`). FK `group_id → practice_groups.id`. |
| `staff` | **Staff.** All users, linked to Supabase Auth via `user_id`. Holds legacy `is_*` role flags, `role_id`, `primary_location_id`, `hire_date`, pause fields. ~113 rows (2026-08-18 live count), 79 active participants. |
| `organization_role_names` | Per-organization display labels for roles. |

**The org chain** (used by RLS and `current_user_org_id()`):
`staff → locations → practice_groups → organizations`.

## 2. Permissions

| Table | Purpose |
|---|---|
| `user_capabilities` | **The active permission source.** Capability-toggle model (`can_view_submissions`, `can_manage_users`, `is_org_admin`, `is_platform_admin`, etc). One row per staff. |
| `coach_scopes` | Which locations/groups a non-participant can see. `scope_type` = `'org'` \| `'location'`. **Naming trap:** despite the name, a `'org'` row's `scope_id` is a `practice_groups.id`, not an `organizations.id` (see the correction below the table). |
| `roles` | Job functions (DFI, RDA, Office Manager, etc). |

> ✅ **`user_capabilities` is the single source of truth for permissions**,
> confirmed in `src/hooks/deriveUserRole.ts` (comment: "CAPS-ONLY since
> 2026-07-25 ... The legacy staff.is_\* flags are no longer read here"). The
> derived `isSuperAdmin`, `isOrgAdmin`, and `isParticipant` all come from
> `user_capabilities` alone, and that function feeds `useUserRole`, which is
> what route guards like `RequireAccess` and every permission check in the
> app actually call. **Historical note:** the legacy boolean columns
> (`staff.is_super_admin`, `staff.is_org_admin`, `staff.is_coach`, etc.) still
> exist on `staff` and are still read/written by some admin UI (creating or
> editing a user) and by a few SQL RPCs (e.g. `get_staff_weekly_scores` still
> OR's in `s.is_coach` / `s.is_super_admin` alongside the capability columns),
> so they are not fully dead, but they are not where the app decides what a
> user can do.
>
> **Persona attributes are a separate, still-legacy-sourced thing.**
> `is_office_manager`, `is_doctor`, `is_clinical_director`, and `is_lead` are
> read straight off `staff` in `deriveUserRole.ts` and describe *who someone
> is*, not *what they're allowed to do*. They have not been migrated into
> `user_capabilities` and there is no indication they will be.

> ⚠️ **`coach_scopes.scope_type = 'org'` is a legacy name for a group scope,
> not an organization scope.** Migration `20260725100000` says so directly:
> "coach_scopes.scope_type = 'org' actually references practice_groups.id
> (legacy naming, 'org' was the old term for group)." That migration also
> backfills a `'org'`-typed scope row for every active lead/OM, using
> `locations.group_id`, i.e. a `practice_groups.id`. Every consumer that reads
> `scope_id` for a `'org'`-typed row (`deriveUserRole.ts`'s `managedOrgIds`,
> the `get_staff_weekly_scores` RPC) treats it as a `practice_groups.id`.
> Putting an actual `organizations.id` in that column would match nothing and
> silently grant the row's owner visibility into zero staff.

## 3. Competency framework (content)

| Table | Purpose |
|---|---|
| `domains` | Top-level skill areas (4). |
| `competencies` | Specific skills within a domain (~126, 2026-08-18 live count). |
| `pro_moves` | The atomic unit: observable behaviors (~332, 2026-08-18 live count). **`practice_types` is a `text[]` array**, not a single value. It was converted from a singular `practice_type TEXT` column on 2026-03-11 (migration `20260311220946_...`). Anything that still says "practice_type" (singular) for `pro_moves` specifically is describing the pre-March design. |
| `pro_move_resources` | Videos/docs attached to Pro Moves. |
| `organization_pro_moves` | Per-org library entries (org copy of the platform library). |
| `organization_pro_move_overrides` | Per-org **visibility** (show/hide) of Pro Moves. |
| `organization_pro_move_content_overrides` | Per-org **wording** overrides. |
| `framework_history` | **Append-only version history** of `pro_moves` and `pro_move_resources` (added 2026-07-30). Fed by DB triggers; jsonb old/new snapshots, author, `change_reason`. Hard `DELETE` of platform pro_moves (`owner_org_id is null`) is blocked by trigger; retire instead (`active = false`). See CLAUDE.md, "Framework content is versioned." |
| `framework_releases` / `framework_release_items` | Named immutable snapshots of one role's framework, created via `create_framework_release()`. |

## 4. Weekly loop (assignments & scores)

| Table | Purpose |
|---|---|
| `weekly_assignments` | **The only live assignment source, but it is not per-staff.** ~1,414 rows (2026-08-18 live count). **Correction (2026-08-19):** this table has no `staff_id` column at all. A row is scoped by `role_id` + `week_start_date` + `org_id` (or a null `org_id` for the global/platform-wide default) + optional `location_id`, and is shared by every staff member who matches that role/week/org scope; `useWeeklyAssignments.tsx` queries it with `.eq('role_id', ...).eq('week_start_date', ...)` and an `org_id` filter, never a staff filter. Per-staff data (who actually got which assignment, and their scores) lives on `weekly_scores` below, which does have `staff_id`. Note: `weekly_assignments.location_id` has no FK and 108 orphaned rows already exist (tracked as COR-3, not this ticket's concern). |
| `weekly_scores` | Confidence + performance scores. ~6,248 rows (2026-08-18 live count), the biggest functional table. Still has a `weekly_focus_id` column (kept for ID-format compatibility with old assignment IDs, matched via `assignment_id.eq.X,weekly_focus_id.eq.X` in query code). That is a **column name**, not a reference to the retired `weekly_focus` table. |
| `staff_quarter_focus` | Quarterly focus selections per staff (made after receiving an evaluation, not tied to a calendar quarter). |

**Sequencing & recommendation:**

| Table | Purpose |
|---|---|
| `sequencer_runs` | Log of sequencer executions. |

**No longer live** (renamed, not dropped, so data is preserved; see the Archived
section below): `weekly_plan`, `weekly_focus`, `site_cycle_state`. **Dropped
outright** on 2026-07-25: `weekly_self_select`, `user_backlog`,
`user_backlog_v2`, `manager_priorities`, `resource_events`. Nothing in `src/`
or `supabase/functions/` queries any of these six names today (verified by
grep against both directories as part of this pass); `weekly_assignments` and
`weekly_scores` are the entire live weekly-loop path. The old two-hop fallback
(`weekly_assignments` to `weekly_plan` to `weekly_focus`) was removed from
`ConfidenceWizard.tsx` / `PerformanceWizard.tsx` in the same 2026-07-25 pass
(roadmap 2.4 slice B).

## 5. Accountability / excusals

| Table | Purpose |
|---|---|
| `excused_submissions` | Individual submissions exempted from "required." |
| `excused_locations` | Locations exempted (e.g. closures). |
| `excused_weeks` | Whole weeks exempted for a staff member. |

## 6. Evaluations & assessments

| Table | Purpose |
|---|---|
| `evaluations` | Coach evaluation headers. |
| `evaluation_items` | Per-evaluation line items. ~1,696 rows (2026-08-18 live count). |
| `staging_prompts` | Prompt content used in the evaluation/AI flow *(purpose inferred from name; confirm in code before relying on it)*. |
| `coach_baseline_assessments`, `coach_baseline_items`, `coach_baseline_audit` | **Doctor-track.** The clinical director's *observed* baseline of a doctor. Alcan-specific; a candidate for removal or Alcan-only gating (see [glossary.md](glossary.md)). |
| `doctor_baseline_assessments`, `doctor_baseline_items` | Doctor's own self-baseline. Distinct from the coach baseline above; do not conflate. |

## 7. Doctor / clinical track

| Table | Purpose |
|---|---|
| `coaching_sessions` / `coaching_session_selections` | Clinical-director-to-doctor sessions and what was selected for them. |
| `coaching_meeting_records` | Recorded meeting outputs, now including raw transcript (migration `20260811150000`). |
| `coaching_agenda_templates` | Reusable agenda templates. |
| `doctor_coach_assignments` | Which clinical director coaches which doctor (added 2026-08-06). |
| `doctor_focus_items` | Doctor-track focus items (added 2026-08-11). |
| `coach_session_reflections` | Post-session reflections (added 2026-08-11). |

## 8. Reminders & notifications

| Table | Purpose |
|---|---|
| `reminder_templates` | Templated reminder content. |
| `reminder_log` | History of reminders sent. |

## 9. Integrations (Deputy, workforce/scheduling)

| Table | Purpose |
|---|---|
| `deputy_employee_mappings` | Maps Deputy employees to `staff`. |
| `deputy_sync_runs` | Sync execution log. |
| `deputy_connections` | Connection/credentials config. |

## 10. Audit & infrastructure

| Table | Purpose |
|---|---|
| `admin_audit` | Administrative actions on staff records. |
| `staff_audit` | Changes to staff records. |
| `app_kv` | App-level key/value config/state. |

---

## Archived (renamed, data preserved, not queried by any live code)

Migration `20260724210000_slice_d_archive_cycle_era.sql` renamed these
in place rather than dropping them, specifically so the data survives:

| Old name | Archived as |
|---|---|
| `weekly_focus` | `zzz_archived_weekly_focus` |
| `weekly_plan` | `zzz_archived_weekly_plan` |
| `site_cycle_state` | `zzz_archived_site_cycle_state` |

The `zzz_` prefix is deliberate. It sorts these to the bottom of any table
listing and out of the way. If you see one of the old names in a doc, a code
comment, or a variable (e.g. `weekly_focus_id`, `focusIds`), it is very likely
a compatibility name for `weekly_assignments`/`weekly_scores`, not a live query
against the renamed table. Check the query target, not the identifier name.

## Dropped outright (2026-07-25, migration `20260725120000`)

`weekly_self_select`, `manager_priorities`, `resource_events`, `user_backlog`,
`user_backlog_v2`. All were verified unused before dropping (no self-select
feature was ever adopted, no missed-assignment backlog workflow shipped). If a
doc anywhere calls `user_backlog_v2` "the active recommender backlog," that
claim has been wrong since 2026-07-25, because there is currently no backlog
table at all.

---

## Quick relationship sketch

```
organizations
  └─< practice_groups (organization_id)
        └─< locations (group_id)
              └─< staff (primary_location_id, role_id → roles, user_id → auth.users)
                    ├─< weekly_scores (staff_id)   (per-staff scores; assignment_id
                    │     is a soft match against weekly_assignments.id, no real FK)
                    ├─< user_capabilities / coach_scopes        (permissions)
                    ├─< evaluations ─< evaluation_items
                    └─< (doctor/coach baselines, coaching_sessions, …)

weekly_assignments (role_id, week_start_date, org_id/location_id scope)
  -- NOT per-staff: one row is shared by every staff member matching that
  -- role + week + org scope. The weekly loop is roles/orgs to weekly_assignments,
  -- crossed with staff to weekly_scores, not a single staff-rooted chain.

roles ─< domains ─< competencies ─< pro_moves ─< pro_move_resources   (content framework)
pro_moves ─< organization_pro_move_overrides / _content_overrides     (per-tenant library)
```

*Tables marked "purpose inferred" should be confirmed against migrations/code
before building on them. This doc was not checked against a live database
connection; if a row count or a table's existence matters for a decision,
confirm with `npx supabase db diff` or the Supabase dashboard first.*
