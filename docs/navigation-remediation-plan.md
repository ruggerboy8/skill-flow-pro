# Navigation & Permission Remediation Plan

> **Status:** Ready to execute, v1 — 2026-07-20. Owner: John.
> **Pairs with:** [audits/usability-navigation-audit.md](audits/usability-navigation-audit.md)
> (findings N1–N12) and backlog items G1–G3 / B1 / B2 / D1.
> **Sequencing principle (owner's):** do the invisible work first. Phase 1 is pure
> cleanup nobody sees. Phase 2 is background plumbing that is meant to preserve the
> current experience. Phase 3 is the set of changes that alter what existing users
> see or do, and each Phase 3 item ships with a short "how it used to work → how it
> works now" note (per the backlog's change-management practice).
>
> Every claim below was re-verified against the code on 2026-07-20 (grep + the
> audit's `file:line` citations), so Phase 1 deletions are safe as written.

## Decisions needed (gates)

None block Phase 1. Resolve these before the phase that uses them:

- **D-a (Phase 1, minor):** drop the unused `staff.home_route` column, or keep it to
  wire up a role-based landing override later? *Recommend: drop (nothing reads it).*
- **D-b (Phase 2):** are `/dashboard`, `/coach`, `/facilitate` intentionally reachable
  by any authenticated user in a tenant, or should they be guarded like the others?
  *Recommend: guard.*
- **D-c (Phase 3):** the target information architecture for the Pro Move library
  (N2) — one canonical library, or per-audience libraries that all get the CSV export?
- **D-d (Phase 3):** which of the three eval viewers (`EvaluationViewer` /
  `EvaluationReview` / `EvaluationReviewV2`) is canonical (the `eval_review_v2`
  localStorage flag suggests V2 is the intended one) before retiring the others.

---

## Phase 1 — Pure cleanup (invisible to users) — ✅ COMPLETED 2026-07-20

Deleting dead weight so the route table becomes a trustworthy map. No user-facing
change. Verification for every item: `npm run build` / typecheck passes and the app
still loads each persona's home.

**Done 2026-07-20:** deleted `PracticeLog.deprecated.tsx`, `StatsScores.tsx`,
`StatsLayout.tsx`, `planner/PlannerPage.tsx`; removed the `/planner/*` routes +
import and the stale `ClinicalHome` comment from `App.tsx` (kept `components/planner/*`
and `plannerUtils`); removed `home_route` from `useStaffProfile` + `types.ts`.
`tsc --noEmit` and `npm run build` both green.

**N10 REVERSED — the `staff.home_route` column is KEPT; do not drop it.** Dropping
it caused two live outages: (1) every still-running frontend that still selected it
→ "column staff.home_route does not exist" → app-wide "failed to load profile"; and
(2) the **`admin-users` edge function writes `home_route` in every role preset**
(`supabase/functions/admin-users/index.ts:640-713`, e.g. `home_route:'/clinical'`),
so every permission edit 500'd against the missing column. A third, downstream
symptom: with the profile query failing, `organizationId` was undefined and the
Clinical tab's doctor list returned `[]` (looked like "clinical director can't see
her doctors"). Restoring the column fixed all three. **`home_route` is load-bearing
(written by the edge function), so my "unused" assessment was wrong — the column
stays.** Broader lesson: MCP DDL hits live prod instantly while code deploys
separately via Lovable, so schema *removals* must lag deployed code, and grep
`supabase/functions/` (not just `src/`) before dropping anything.

| # | Finding | Do | Files | Notes |
|---|---|---|---|---|
| 1.1 | N9 | Delete the dead Stats/PracticeLog cluster | `src/pages/my-role/PracticeLog.deprecated.tsx`, `src/pages/StatsScores.tsx`, `src/pages/StatsLayout.tsx` | Confirmed orphaned: `PracticeLog.deprecated` has no importer; it was the only thing referencing `StatsScores`; `StatsLayout` has no importer. |
| 1.2 | N9 | Delete `ClinicalHome` + its stale comment | `src/pages/ClinicalHome.tsx`; remove the dangling comment at `src/App.tsx:58` | Only referenced by a comment; logic already lives in `DoctorManagement`. |
| 1.3 | N8 | Remove the orphaned planner **routes** and page | `src/App.tsx:201-203` (the three `planner/*` routes + import), `src/pages/PlannerPage.tsx` | **Keep `src/components/planner/*` and `src/lib/plannerUtils.ts`** — the Builder (`AdminBuilder.tsx:9`) and coach dashboards use them. Only the `/planner/*` routes are dead (no inbound nav). |
| 1.4 | N10 | Remove the unused `home_route` plumbing | `src/hooks/useStaffProfile.tsx:43,117` (drop from type + select) | The DB column drop is a separate, invisible migration gated on **D-a**. Regenerate `src/integrations/supabase/types.ts` if the column is dropped. |

**Investigation (no change this phase):** confirm the canonical eval viewer (feeds
N7, Phase 3). Read-only; note the `eval_review_v2` flag.

---

## Phase 2 — Background consistency (meant to preserve current experience)

Internal plumbing. The intent is zero visible change for correctly-configured users;
the one real effect is that the **menu and the page guards stop disagreeing** (N1).
Because `user_capabilities` is already populated for some staff, this *corrects*
menus for those users rather than changing intended behavior. Verification for this
phase is a **live per-persona walkthrough** in the preview browser (participant, OM,
coach, doctor, clinical director, org admin, super admin): every visible menu link
must lead to a page the user can actually reach, and every reachable page must have a
link.

- **2.1 — Make `useUserRole` the single role hook (N1, audit §5.3 step 1).** Refactor
  `src/components/Layout.tsx:56-101` to consume `useUserRole` for every role/capability
  question; reduce `src/hooks/useAuth.tsx` to session only (stop returning role flags).
  No DB change. This is the highest payoff-to-risk item in the whole plan and unblocks
  a trustworthy menu. *Follow the "conservative migration" rule: keep `useUserRole`'s
  legacy fallback in place.*
- **2.2 — Backfill `user_capabilities` for all active staff (audit §5.3 step 2).**
  Idempotent migration that mirrors each person's current effective flags into a caps
  row, so a row always exists. Invisible (caps equal current behavior). The legacy
  fallback then becomes a safety net we remove in Phase 3.
- **2.3 — Guard the open routes (N3, gate D-b).** Add a capability/scope guard to
  `/dashboard` (`RegionalDashboard`), `/coach` (`CoachLayoutV2` / `CoachDashboardV2`),
  and `/facilitate` (`FacilitatePage`), matching the guarded routes. Invisible to
  legitimate users; closes a URL-typing gap. RLS still protects data regardless.
- **2.4 — Naming consistency for the dashboard (N5).** Align the component/route names
  behind the "Command Center" label. Keep the user-facing label and the `/dashboard`
  URL (or add an alias) so nothing users see or bookmark changes; this is an
  internal-readability rename only.

---

## Phase 3 — Changes existing behavior (needs decisions + user-facing change notes)

Each item here alters what some users see or do. Ship each with a short
"how it used to work → how it works now" note for the affected audience, and verify
with the live per-persona walkthrough before release.

- **3.1 — Flip `useUserRole` to capability-only and retire legacy `is_*` flags
  (audit §5.3 steps 3-4; B2/G2).** Depends on 2.1 + 2.2. Drop the `caps ? … : legacy`
  branches; remove the legacy flag reads. Verify every persona still lands and
  navigates. This is the core of the permission simplification you asked for: the
  mental model becomes "participant? + which capabilities? + what scope?"
- **3.2 — Retire the duplicate scope mechanism (N12).** The singular
  `coach_scope_type/id` columns are still **written** by
  `src/components/admin/EditUserDrawer.tsx:304` (and typed in `AdminUsersTab.tsx`), so
  this is not a silent drop: refactor the admin user editor to write scope only to the
  `coach_scopes` table, migrate any column-only data, then drop the columns. Affects
  the admin user-editing flow.
- **3.3 — Model OM / Doctor / Clinical Director / Lead as a `staff_role` attribute
  (audit §5.3 step 5; D1).** These are "who someone is," not "what they can do," so
  they become a role attribute resolved for display via `resolve_role_display_name()`,
  not capabilities.
- **3.4 — Consolidate the Pro Move libraries + fix CSV access (N2, gate D-c).** Decide
  one canonical library per audience; at minimum expose the CSV export outside the
  super-admin Platform Console and stop the `/admin?tab=pro-moves` redirect
  (`AdminPage.tsx:25-29`) from steering to the no-CSV library.
- **3.5 — Define one coaching hub; retire superseded eval viewers (N7, gate D-d).**
  Aligns with management-model G1/G8 (Ariyana's fragmented surface). Consolidate the
  6+ coaching/eval routes into a single home; retire the non-canonical eval viewers.
- **3.6 — Converge the doctor IA (N4, N6).** One doctor entry point regardless of other
  capabilities (N6), and reuse the shared "My Role" tree instead of the parallel
  `/doctor/my-role` implementation (N4).
- **3.7 — Router alias cleanup (N11).** Last, after routes stop moving. Keep only
  redirects that protect live external links; remove the rest.

---

## Finding → phase map

| Phase | Findings | Character |
|---|---|---|
| 1 | N8, N9, N10 | Delete dead code; invisible |
| 2 | N1, N3, N5, (backfill for B2) | Background; preserves experience |
| 3 | N2, N4, N6, N7, N11, N12, B1, B2, D1 | User-facing; ships with change notes |

## Recommended execution order
1. Phase 1 in one pass (fast, safe, high morale).
2. Phase 2.1 + 2.2 (single-source hook + backfill), then verify all personas live.
3. Phase 2.3 (guards) and 2.4 (rename).
4. Phase 3 in the order listed (3.1 → 3.7), one item per change, each verified live
   and shipped with its change note.

## Verification approach (all phases)
- After Phase 1: build/typecheck green; app loads for each persona.
- Phase 2 onward: **live per-persona walkthrough** in the preview browser is the gate,
  because a code read cannot confirm menu-vs-access parity (audit §8). Keep every
  fallback until the walkthrough passes, then remove it.
