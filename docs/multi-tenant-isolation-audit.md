# Multi-Tenant Isolation Audit — Skill Flow Pro

*Date: 2026-06-12 · Status: REPORT ONLY — no changes made*
*Method: static analysis of all migrations (final RLS state), all edge functions, and all frontend data access. No live-schema queries were run; items marked "verify live" should be confirmed against production with the SQL at the end of this doc.*

---

## Executive summary

The 2026-03 multi-tenancy migration successfully scoped the core tables
(organizations, org role names, org pro moves/overrides, evaluations,
weekly_assignments, deputy_*), but isolation is **not complete**. We found:

- **6 critical findings** — exploitable cross-org access today
- **7 high findings** — cross-org leaks for privileged-but-not-platform roles,
  or leaks contingent on RLS gaps we believe exist
- A long tail of medium/low issues (branding, timezone, hardcoded IDs)

The recurring root cause: policies and functions written pre-multi-tenancy
check **role flags** (`is_org_admin`, `is_clinical_director`, authenticated)
but never ask **"which org?"**.

---

## Critical findings (fix first)

### C1. `backfill-format-evaluator-notes` — public, service-role, no auth
`supabase/functions/backfill-format-evaluator-notes/index.ts:66-95`, `verify_jwt = false`.
Accepts an arbitrary array of evaluation IDs in the request body and
reads/modifies them with the service-role key. **An unauthenticated caller can
read and rewrite any org's evaluation notes.** Disable or lock down immediately.

### C2. `deputy-oauth-callback` — org_id trusted from OAuth `state`
`supabase/functions/deputy-oauth-callback/index.ts:57-146`, `verify_jwt = false`.
Decodes `org_id` from the attacker-controllable `state` parameter and upserts
Deputy API credentials into `deputy_connections` for that org with no check
that the caller belongs to it. Cross-tenant credential compromise/corruption.

### C3. `pro-move-suggest` — acts on any `orgId` from the request body
`supabase/functions/pro-move-suggest/index.ts:1-40`. Uses the service-role key
and queries `organization_pro_move_overrides` for whatever `orgId` is posted,
without verifying the caller's JWT or org membership. Any authenticated user
can enumerate another org's curriculum customizations.

### C4. `excused_locations` — global read + unscoped admin write
`supabase/migrations/20260126172223_…sql:17-30`.
- SELECT: `USING (auth.uid() IS NOT NULL)` — **every authenticated user in any
  org can read all orgs' location excuses.**
- ALL: checks `is_org_admin OR is_super_admin` with **no org filter** — an org
  admin in org A can create/modify excuses for org B's locations.

### C5. `excused_submissions` — unscoped admin write
`supabase/migrations/20260122180028_…sql:17-25`. Same pattern as C4: org
admins can excuse any staff member in any organization.

### C6. SimConsole masquerade lists all staff platform-wide
`src/devtools/SimConsole.tsx:39-48` selects all of `staff` with no filter for
the masquerade picker, and `src/hooks/useStaffProfile.tsx:93` performs no org
validation on the masqueraded staff ID. Combined with whatever RLS allows on
`staff` (see V1 below), this is very likely one of the bleed-throughs you are
observing — note the "Masqueraded user scopes" commit on main is in this area.

---

## High findings

### H1. Coaching tables readable/writable cross-org by clinical directors
`supabase/migrations/20260311171113_…sql`. On `coaching_sessions`:
"Clinical staff can view all sessions" checks only
`is_clinical_director OR is_super_admin` — no org filter. The update policy is
similar. `coaching_session_selections` and `coaching_meeting_records` inherit
the leak through their joins. A clinical director in org A can read org B's
coaching notes and meeting records.

### H2. `admin-users` `list_users` — org roster enumeration
`supabase/functions/admin-users/index.ts:78-150`. The function filters by the
`organization_id` request parameter but never verifies the caller is an admin
of *that* org. An org admin can pass any org's ID and download its full staff
roster (names, emails, roles, locations).

### H3. `coach-remind` — recipients not org-checked
`supabase/functions/coach-remind/index.ts:62-213`. Verifies the sender is a
coach but not that recipients belong to the sender's org → cross-org
email/phishing vector.

### H4. Unscoped admin-surface queries (RLS-dependent)
These select org-sensitive data with no org filter and rely entirely on RLS:
- `src/components/admin/eval-results-v2/EvalPeriodSelector.tsx:23` — all
  evaluations' periods, globally
- `src/pages/admin/SequencerTestConsole.tsx:40,57,84,158,249` — staff and
  practice_groups, unscoped
- `src/components/admin/eval-results-v2/EvaluationsExportTab.tsx:72,96,118,204,288`
  — groups/locations/roles/staff dropdowns and counts, unscoped
- `src/components/admin/eval-results/SummaryMetrics.tsx:80-145` — locations,
  evaluations, staff
Whether these leak in practice depends on the live RLS state of `staff`,
`locations`, `practice_groups` (see V1).

### H5. `useLeadRoleId` returns a global "lead role"
`src/hooks/useLeadRoleId.ts:19` — `.eq('lead_role', true).single()` across all
orgs/practice types; in multi-tenant this returns an arbitrary org's lead role.

### H6. Views without `security_invoker`
Several views (e.g. `view_staff_submission_windows`,
`supabase/migrations/20260218225751_…sql`) run with owner's rights and bypass
RLS on underlying tables. Usage is inconsistent — some views do set
`security_invoker = true`. Needs a sweep.

### H7. `weekly_assignments.org_id` vs `group_id` confusion
`src/lib/locationState.ts:264` assigns `locations.group_id` into a variable
named `orgId` and filters `weekly_assignments.org_id` with it, while
`assembleWeek()` (same file, lines ~106-221) resolves the true
`organization_id` via `practice_groups`. One of these two paths is filtering
the wrong column. **Verify which entity `weekly_assignments.org_id` actually
references** — if it's `organizations.id`, line 264 is a live cross-group/org
bug; if it's `practice_groups.id`, `assembleWeek` is the buggy one.

---

## Medium findings

- **M1. Alcan branding fallback** — `src/pages/Welcome.tsx`,
  `src/pages/SetupPassword.tsx`, `src/components/Layout.tsx` fall back to the
  Alcan logo when an org has no `logo_url`. New orgs see Alcan's brand.
- **M2. `America/Chicago` hardcoded fallback** in ~8 places:
  `src/lib/centralTime.ts`, `src/lib/plannerUtils.ts` (PLANNER_TZ),
  `src/lib/backlog.ts:155`, `src/hooks/useLocationTimezone.ts`,
  Performance/Confidence/Performance wizards, and
  `OrgSetupWizard.tsx:129` defaults new locations to CT. Known P0 for UK launch.
- **M3. `DOCTOR_ROLE_ID = 4` hardcoded** —
  `src/pages/clinical/DoctorProMoveLibrary.tsx:21`; role IDs are not guaranteed
  stable across orgs. Competency query also lacks org scoping.
- **M4. `get_user_org_id(p_user_id)`** (migration `20260312224749`) returns the
  *first* org if a user ever maps to multiple; silent wrong-org rather than
  error. Mitigated by uniqueness on staff.user_id — confirm constraint exists.
- **M5. `organizationId` derivation can be undefined** —
  `src/hooks/useUserRole.tsx:149` cascades staff.organization_id → location
  join → `undefined`. Downstream code treats undefined as "no filter" instead
  of "no access".
- **M6. `generate-pro-move-weights`** uses service role with no explicit org
  check; relies on parameters being honest.
- **M7. Platform pages** (`PlatformOrgsTab`, `PlatformUsersTab`,
  `ImpersonationTab`) intentionally show cross-org data but rely on routing
  guards only; add explicit `isSuperAdmin` checks in-component.

## Low findings

- `deputy-sync-dispatcher` (public) can be invoked by anyone to trigger org
  syncs (DoS-ish; rate-limited by Deputy).
- `pro_moves` has no RLS — acceptable as the platform library, provided no
  org-custom rows ever land in it (org customs live in `organization_pro_moves`).
- `admin_audit` is super-admin-only (fine; not org-partitioned).
- `excused_weeks` global read is intentional (platform holiday calendar).
- RegionalDashboard does client-side scope filtering — defensive only.

---

## What's confirmed GOOD (no action)

`organizations`, `organization_role_names`, `organization_pro_moves`,
`organization_pro_move_overrides` (fixed 2026-03-13), evaluations +
evaluation_items (org-scoped 2026-03-11), `weekly_assignments` (fixed
2026-03-12), `deputy_connections`/`deputy_employee_mappings`,
`coaching_agenda_templates` (user-scoped), `release_single_evaluation()` /
`bulk_release_evaluations()` (org ownership checks), `locationState.assembleWeek()`
org-resolution pattern, `FilterBar` group dropdown scoping, AdminBuilder org
library tab, edge functions: admin-users (other actions), sequencer-auto-assign,
notify-eval-release, generate-audio/save-audio, planner-upsert, deputy-sync.

---

## Verify against live schema (audit was static)

**V1 — decisive:** the final live RLS policies on `staff`, `locations`,
`practice_groups`. Most frontend findings (C6, H4) are real leaks only if
SELECT on these tables is not org-scoped. The fact that you're observing
bleed-through suggests at least one is permissive.

**V2:** which entity `weekly_assignments.org_id` references (H7).

**V3:** RLS state of `user_backlog`, `weekly_self_select`, `site_cycle_state`,
`user_capabilities`, `coach_baseline_assessments` — not conclusively resolved
from migrations.

**V4:** definition of `is_clinical_or_admin()` (used by coaching policies).

```sql
-- Run in Supabase SQL editor:
SELECT tablename, policyname, cmd, qual, with_check
FROM pg_policies WHERE schemaname = 'public'
ORDER BY tablename, policyname;

SELECT table_name, row_security_active(quote_ident(table_name)::regclass)
FROM information_schema.tables
WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
```

---

## Suggested remediation order (when we move to fixes)

1. **Same day:** C1 (disable/lock backfill function), C2, C3 — these are
   reachable by outsiders or any authenticated user.
2. **This week:** C4, C5 (excused_* policies), H1 (coaching org scoping),
   H2 (admin-users org check), C6 (masquerade scoping), V1 live verification.
3. **Next:** H3–H7, then M-tier (branding, timezone, hardcoded role ID).
4. **Structural:** an automated isolation test suite — two seeded orgs, assert
   every table/function returns zero cross-org rows. This prevents
   regression as Lovable continues to generate code against these tables.
