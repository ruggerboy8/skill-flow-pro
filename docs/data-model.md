# Skill Flow Pro — Data Model (Current State)

*This describes the database as it **actually exists today**, verified against the live Supabase
project (`yeypngaufuualdfzcjpk`) on **2026-06-22**. Row counts are point-in-time and only
indicate relative scale. For the **proposed/intended** multi-tenant design, see
[enterprise-architecture.md](enterprise-architecture.md).*

> **RLS is enabled on every table.** Access is enforced in the database, not just the app.
> Exact columns, foreign keys, and policies live in `supabase/migrations/` (462 migrations).
> When in doubt, treat the migrations + `npx supabase db diff` as the source of truth and this
> doc as the map.

> **Legacy cluster (do not build on):** `weekly_focus`, `weekly_self_select`, the `self_select`
> column, the cycles-1–3 rollover path, and the whole **cycle/week-in-cycle** concept are a
> connected set of early-legacy features (from the old fixed 18-week onboarding curriculum).
> Current functionality runs on `weekly_plan` / `weekly_assignments`. See
> [improvement-backlog.md](improvement-backlog.md) for the retirement plan.

---

## 1. Org hierarchy & identity

| Table | ~Rows | Purpose |
|---|---|---|
| `organizations` | 4 | **Tenant** — top-level contracting entity. The data-isolation boundary. |
| `practice_groups` | 10 | **Group** — sub-grouping of locations. FK `organization_id → organizations.id`. |
| `locations` | 17 | **Location** — individual practice. Owns `program_start_date`, `cycle_length_weeks`, `timezone`, and per-step deadlines (`conf_due_day/time`, `perf_due_day/time`). FK `group_id → practice_groups.id`. |
| `staff` | 102 | **Staff** — all users. Linked to Supabase Auth via `user_id`. Holds legacy `is_*` role flags, `role_id`, `primary_location_id`, `hire_date`, pause fields. |
| `organization_role_names` | 17 | Per-organization display labels for roles. |

**The org chain** (used by RLS and `current_user_org_id()`):
`staff → locations → practice_groups → organizations`.

## 2. Permissions

| Table | ~Rows | Purpose |
|---|---|---|
| `user_capabilities` | 53 | **Newer** capability-toggle model (`can_view_submissions`, `can_manage_users`, `is_org_admin`, `is_platform_admin`, …). One row per staff. |
| `coach_scopes` | 46 | Which orgs/locations a non-participant can see. `scope_type` = `'org'` \| `'location'`. |
| `roles` | 14 | Job functions (DFI, RDA, Office Manager, …). |

> ⚠️ **Two permission systems coexist today.** Old boolean flags on `staff` (`is_coach`,
> `is_org_admin`, `is_super_admin`, `is_doctor`, …) are still what `useUserRole` reads, while
> `user_capabilities` is the migration target. Don't assume one or the other — check both.
> This is tracked under the permissions refactor in [roadmap.md](roadmap.md).

## 3. Competency framework (content)

| Table | ~Rows | Purpose |
|---|---|---|
| `domains` | 4 | Top-level skill areas. |
| `competencies` | 126 | Specific skills within a domain. |
| `pro_moves` | 332 | The atomic unit: observable behaviors. Has `practice_type` (`pediatric`/`general`/`all`). |
| `pro_move_resources` | 320 | Videos/docs attached to Pro Moves. |
| `organization_pro_moves` | 1 | Per-org library entries (org copy of the platform library). |
| `organization_pro_move_overrides` | 3 | Per-org **visibility** (show/hide) of Pro Moves. |
| `organization_pro_move_content_overrides` | 1 | Per-org **wording** overrides (future content-customization layer). |

## 4. Weekly loop (assignments & scores)

| Table | ~Rows | Purpose |
|---|---|---|
| `weekly_assignments` | 1,363 | **Canonical** per-staff weekly Pro Move assignments. |
| `weekly_scores` | 5,642 | Confidence + performance scores. The biggest functional table. |
| `weekly_plan` | 6 | Sequenced Pro Move plan per role/cycle/week (**cycles 4+**). |
| `weekly_focus` | 108 | **DEPRECATED** legacy assignment source (cycles 1–3). Kept for history only. |
| `weekly_self_select` | 0 | Self-selected Pro Moves mode (unused so far). |
| `staff_quarter_focus` | 27 | Quarterly focus selections per staff. |
| `site_cycle_state` | 1 | Global cycle/week state. |

**Sequencing & recommendation:**

| Table | ~Rows | Purpose |
|---|---|---|
| `sequencer_runs` | 26 | Log of sequencer executions. |
| `user_backlog_v2` | 1,265 | Active per-user backlog of uncovered Pro Moves (recommender). |
| `user_backlog` | 0 | Legacy backlog (superseded by v2). |

## 5. Accountability / excusals

| Table | ~Rows | Purpose |
|---|---|---|
| `excused_submissions` | 397 | Individual submissions exempted from "required". |
| `excused_locations` | 37 | Locations exempted (e.g. closures). |
| `excused_weeks` | 2 | Whole weeks exempted for a staff member. |
| `manager_priorities` | 0 | Manager-set priorities (unused so far). |

## 6. Evaluations & assessments

| Table | ~Rows | Purpose |
|---|---|---|
| `evaluations` | 106 | Coach evaluation headers. |
| `evaluation_items` | 1,696 | Per-evaluation line items. |
| `staging_prompts` | 32 | Prompt content used in the evaluation/AI flow *(purpose inferred from name — confirm in code before relying on it)*. |
| `coach_baseline_assessments` | 4 | Coach baseline headers. **Alcan-specific** — used only when Alcan onboards a new *practice*, not for new hires. Candidate for removal (an org's first evaluation could serve as its baseline). |
| `coach_baseline_items` | 107 | Coach baseline line items. (See note above.) |
| `coach_baseline_audit` | 219 | Change log for coach baselines. |
| `doctor_baseline_assessments` | 5 | Doctor baseline headers. |
| `doctor_baseline_items` | 265 | Doctor baseline line items. |

## 7. Doctor / clinical track

| Table | ~Rows | Purpose |
|---|---|---|
| `coaching_sessions` | 3 | Clinical-director ↔ doctor sessions. |
| `coaching_session_selections` | 2 | Items selected for a session. |
| `coaching_meeting_records` | 0 | Recorded meeting outputs (unused so far). |
| `coaching_agenda_templates` | 1 | Reusable agenda templates. |

## 8. Reminders & notifications

| Table | ~Rows | Purpose |
|---|---|---|
| `reminder_templates` | 3 | Templated reminder content. |
| `reminder_log` | 610 | History of reminders sent. |

## 9. Integrations (Deputy — workforce/scheduling)

| Table | ~Rows | Purpose |
|---|---|---|
| `deputy_employee_mappings` | 115 | Maps Deputy employees ↔ `staff`. |
| `deputy_sync_runs` | 8 | Sync execution log. |
| `deputy_connections` | 1 | Connection/credentials config. |

## 10. Audit & infrastructure

| Table | ~Rows | Purpose |
|---|---|---|
| `admin_audit` | 143 | Administrative actions on staff records. |
| `staff_audit` | 44 | Changes to staff records. |
| `app_kv` | 7 | App-level key/value config/state. |
| `resource_events` | 0 | Resource interaction events (unused so far). |

---

## Quick relationship sketch

```
organizations
  └─< practice_groups (organization_id)
        └─< locations (group_id)
              └─< staff (primary_location_id, role_id → roles, user_id → auth.users)
                    ├─< weekly_assignments ─< weekly_scores   (the weekly loop)
                    ├─< user_capabilities / coach_scopes        (permissions)
                    ├─< evaluations ─< evaluation_items
                    └─< (doctor/coach baselines, coaching_sessions, backlog, …)

roles ─< domains ─< competencies ─< pro_moves ─< pro_move_resources   (content framework)
pro_moves ─< organization_pro_move_overrides / _content_overrides     (per-tenant library)
```

*Tables marked "purpose inferred" or "unused so far" should be confirmed against migrations/code
before building on them.*
