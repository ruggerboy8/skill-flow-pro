# Skill Flow Pro (ProMoves) — Usability & Navigability Audit

**Date:** 2026-07-20
**Auditor:** UX Researcher (design-ux-researcher persona)
**Scope:** Routing, navigation entry points, page/tab structure, and the permission
model that gates them. Two owner-named focal points: (1) simplify the split
permission structure toward the granular capability model; (2) surface things that
"don't make sense the way they're currently designed."
**Method:** Static, code-level pass against the current `main`. Source was read,
not run. Every finding is tagged **CONFIRMED** (verified in code, with `file:line`)
or **HYPOTHESIS** (pattern in code, needs owner confirmation of intent/data). No app
was launched; live click-through of each persona is the recommended follow-up.
**Related backlog:** B1, B2, D1 (model simplification); G1, G2, G3 (this audit);
management-model G1 (Ariyana's fragmented coaching surface) and G8 (this same IA
problem) — same root cause: feature-by-feature accretion with no IA pass.

---

## 1. Executive summary — the five biggest problems

1. **Three different role-resolution systems run at once, and the navigation menu
   uses a different one than the page guards.** `useAuth` reads *only* legacy `is_*`
   flags; `useUserRole` prefers `user_capabilities` and falls back to legacy;
   `Layout.tsx` mixes both plus a third direct read of `staff.user_capabilities`.
   The sidebar is built mostly from `useAuth` (legacy) while `/admin`, `/platform`,
   `/builder` guards use `useUserRole` (capabilities). A user configured purely
   through the new capability model can be *granted a page but denied its nav link*,
   or vice-versa. **CONFIRMED.** (§3, §5) This is the literal cause of G2/B2 and the
   highest-leverage fix in the app.

2. **There are three separate "Pro Move library" surfaces, and the only one with the
   CSV export is buried in the super-admin-only Platform Console.** `ProMoveLibrary`
   (platform, has CSV), `OrgProMoveLibraryTab` (Builder), and `DoctorProMoveLibrary`
   (Clinical) are three different components. The CSV download lives *only* in the
   platform one. Worse, the legacy deep-link `/admin?tab=pro-moves` redirects to the
   Builder library (no CSV), so the "obvious" path sends you to the wrong surface.
   **CONFIRMED.** (§4.7, §6-N2) This is the owner's anchor example, and it is worse
   than it looked.

3. **Half the top-level surfaces have real route guards; half rely only on the menu
   hiding them.** `/admin`, `/platform`, `/clinical`, `/doctor`, `/my-location` guard
   themselves and redirect unauthorized users. `/dashboard`, `/coach` (+ children),
   and `/facilitate` have **no guard at all** — any authenticated user who types the
   URL reaches them. **CONFIRMED.** (§6-N3) Inconsistent, and it means "who can see
   what" is not answerable from the code without reading every page.

4. **The coaching / evaluation experience is scattered across six-plus surfaces with
   no single home.** A coach's work is split among `/coach`, `/coach/:staffId`,
   `/coach/.../eval/...`, the Builder, `/admin/evaluations`, and three different eval
   viewers/reviewers (`EvaluationViewer`, `EvaluationReview`, `EvaluationReviewV2`,
   plus `coach/EvaluationHub`). This is management-model **G1** ("Ariyana's fragmented
   coaching surface") showing up as an IA problem. **CONFIRMED.** (§4.3, §6-N7)

5. **Dead and orphaned surfaces accumulate with no removal step.** `/planner/dfi|rda|om`
   routes exist with zero inbound links; `StatsScores.tsx`, `StatsLayout.tsx`, and
   `ClinicalHome.tsx` are unmounted/unimported; `staff.home_route` is fetched but never
   used for routing. **CONFIRMED.** (§6-N8, N9) Each is small, but together they make
   the route table untrustworthy as a map of the product.

---

## 2. How to read this audit

- Route table lives in `src/App.tsx`; the sidebar/menu in `src/components/Layout.tsx`
  (which passes a `navigation[]` array into `src/components/AppSidebar.tsx`).
- Role truth is computed in three places: `src/hooks/useAuth.tsx`,
  `src/hooks/useUserRole.tsx`, and re-derived inline in `Layout.tsx`. All three read
  from `src/hooks/useStaffProfile.tsx`, which is the one place that actually fetches
  `staff`, `coach_scopes`, and `user_capabilities`.
- "Persona" below means the effective role a person is configured as, not a DB enum.

---

## 3. The permission model as it actually exists

### 3.1 Three sources of truth

| Source | File | Reads | Used by |
|---|---|---|---|
| **Legacy-only** | `useAuth.tsx:42-53` | `is_coach, is_super_admin, is_org_admin, is_participant, is_lead` (only these 5) | `Layout.tsx:25` for `isCoach/isSuperAdmin/isOrgAdmin/isLead`; eval capture flows |
| **Capability-preferred** | `useUserRole.tsx:44-155` | `user_capabilities` if present, else legacy flags; derives coach/regional from `coach_scopes` | page guards: `AdminPage`, `PlatformPage`, `AdminBuilder`, `ClinicalLayout`, `DoctorLayout`, `MyLocationPage` |
| **Inline hybrid** | `Layout.tsx:56-101` | `useAuth` legacy flags **+** `staffProfile.is_office_manager/is_doctor/is_clinical_director` **+** `staffProfile.user_capabilities` read directly | the sidebar `navigation[]` |

**CONFIRMED.** These do not agree. Concretely:

- `Layout.tsx:57` sets `isSuperAdmin` from `useAuth` (`authIsSuperAdmin`), which comes
  from the **legacy `is_super_admin` flag only** (`useAuth.tsx:49`). But
  `useUserRole.tsx:56-58` maps `user_capabilities.is_platform_admin → isSuperAdmin`.
  A user made a platform admin *only* through `user_capabilities.is_platform_admin`
  (the intended new model) gets **no "Platform" nav link** (`Layout.tsx:131` requires
  the `useAuth` `isSuperAdmin`) even though `PlatformPage.tsx:23-30` would grant them
  access if they typed `/platform`. The new model is second-class in the menu.
- Same shape for `isOrgAdmin`: menu uses `useAuth` legacy flag (`Layout.tsx:58`);
  guards use `useUserRole` capability-preferred value. Configuring a person the "new"
  way produces a working page with a missing or wrong menu.
- `Layout.tsx:56` even recomputes `isCoach` a *fourth* way for masquerade
  (`staffProfile.is_coach || is_super_admin || is_org_admin`), different again from
  `useUserRole.tsx:80` (`scopes.length > 0 || is_coach || can_view_submissions`).

### 3.2 Duplicated concepts

- **`coach_scope_type/coach_scope_id` (singular columns on `staff`)** vs the
  **`coach_scopes` table (plural rows)**. Both are fetched (`useStaffProfile.tsx:31-32`
  and `:68-71`). `useUserRole` uses the table; other code paths may still read the
  columns. Two scoping mechanisms for one idea. **CONFIRMED** (both present);
  which is authoritative in every consumer is **HYPOTHESIS** — needs a sweep.
- **`is_participant`** exists on both `staff` and `user_capabilities`
  (`useUserRole.tsx:66-68` has to pick). **CONFIRMED.**
- **`is_org_admin`** exists on both `staff` and `user_capabilities`
  (`useUserRole.tsx:61-63`). **CONFIRMED.**
- **`is_platform_admin` (caps) ≡ `is_super_admin` (staff)** — same concept, two names,
  mapped by hand at `useUserRole.tsx:56-58`. **CONFIRMED.**

### 3.3 What is NOT yet in the capability model

`is_office_manager`, `is_doctor`, `is_clinical_director`, `is_lead` live **only** on
`staff` (`useUserRole.tsx:71-76`). So even after adopting capabilities, four persona
flags still float outside the model. The enterprise-architecture doc's intent
(Part 3, `participant + capabilities + scope`) treats OM/Doctor/Clinical Director as
*staff roles* and coach/admin as *capabilities*; the code has not drawn that line yet.

---

## 4. Route + navigation map, by persona

Legend: **[guard]** = page self-guards and redirects unauthorized users; **[open]** =
no guard, reachable by any authenticated user via URL; **[menu-gated]** = only hidden
by the sidebar, not enforced by the page.

### 4.1 Participant (has `role_id`, `is_participant`)

- Menu (`Layout.tsx:132-169`): **Home** (`/`), **My Role** (`/my-role`).
- `/` → `Index.tsx` dispatches: participants get the weekly-loop home
  (`Index.tsx:51-90`).
- `/my-role` (`MyRoleLayout`) tabs: Overview / Practice Log / Evaluations
  (`MyRoleLayout.tsx:57-79`). `evaluations` tab renders `StatsEvaluations`
  (`App.tsx:125`).
- Weekly submission wizards: `/confidence/:week/step/:n`, `/performance/:week/step/:n`
  (`App.tsx:139,141`). Reached from home cards, not the menu.
- **Discovery break:** "My Role" only appears if `role_id` is set **and** the user is
  not an org admin (`Layout.tsx:108,141`). A participant who is also an org admin
  loses the My Role link entirely. **CONFIRMED.**

### 4.2 Office Manager (`is_office_manager`, not coach/admin)

- Menu adds **My Location** (`/my-location`) only when
  `isOfficeManager && !isCoach && !isOrgAdmin` (`Layout.tsx:104,145`).
- `/my-location` **[guard]** (`MyLocationPage.tsx:35,40`).
- **Discovery break:** the moment an OM is also given any coach/admin capability, the
  My Location link disappears (by design at `:104`) but the underlying view is still
  the only "just my location" surface — they're pushed to the regional dashboard
  instead. **HYPOTHESIS** this matches how OMs actually work.

### 4.3 Coach (`coach_scopes`, or `is_coach`, or `can_view_submissions`)

- Menu adds **Coach** (`/coach`) and **Facilitate** (`/facilitate`)
  (`Layout.tsx:99,156-158`).
- `/coach` **[open]** — `CoachLayoutV2` is a bare `<Outlet/>`
  (`CoachLayoutV2.tsx:1-9`); `CoachDashboardV2` has no role guard. Children:
  `/coach/:staffId` (`StaffDetailV2`), `/coach/:staffId/eval/:evalId`
  (`EvaluationHub`), `.../capture` (`EvaluationCapture`) (`App.tsx:145-150`).
- `/facilitate` **[open]** — top-level, full-screen, `FacilitatePage` uses
  `useUserRole` only for `practiceType`, no access check (`App.tsx:113`,
  `FacilitatePage.tsx:59`).
- Evaluation results also live at `/admin/evaluations` (`EvalResultsV2`,
  `App.tsx:182`) — shown as a separate **Evaluations** menu item
  (`Layout.tsx:166-168`), gated by `showEvaluationsTab` (`Layout.tsx:101`).
- **Discovery break / fragmentation (management-model G1):** a coach's surface is
  split across `/coach`, `/admin/evaluations`, and three eval viewers
  (`EvaluationViewer`, `EvaluationReview`, `EvaluationReviewV2`, `App.tsx:192-194`)
  plus `coach/EvaluationHub`. No single "my coaching" home. **CONFIRMED.**

### 4.4 Doctor (`is_doctor`)

- Two different nav sets depending on whether the doctor also has admin/coach:
  - **Pure doctor** (`isPureDoctor`, `Layout.tsx:112`): Home `/doctor`, My Role
    `/doctor/my-role`, My Team `/doctor/my-team`, Coaching History
    `/doctor/coaching-history` (`Layout.tsx:115-120`).
  - **Doctor + admin/coach:** keeps admin nav and gets an extra **Doctor** link
    (`Layout.tsx:127,153-155`).
- `/doctor` **[guard]** (`DoctorLayout.tsx:18`). Rich sub-tree: baseline wizard,
  baseline results, review-prep, team role/domain details (`App.tsx:166-177`).
- **Confusion:** the doctor area has its *own* `my-role` and domain-detail routes
  (`/doctor/my-role`, `App.tsx:168-169`) that parallel the top-level `/my-role`
  (`App.tsx:121-132`). Two "My Role" information architectures. **CONFIRMED.**

### 4.5 Clinical Director (`is_clinical_director` or super admin)

- Menu adds **Clinical** (`/clinical`) (`Layout.tsx:149-151`).
- `/clinical` **[guard]** (`ClinicalLayout.tsx:19`) — index is `DoctorManagement`
  (ClinicalHome was collapsed into it, `App.tsx:58-59`). No tab bar; sub-navigation is
  buttons inside `DoctorManagement` (`DoctorManagement.tsx:170,295,367`).
- `/clinical/pro-moves` → `DoctorProMoveLibrary` — a **third** pro-move library
  (`App.tsx:162`), reached only by a button inside DoctorManagement (`:170`).
- `/clinical/doctors` redirects to `/clinical` (`App.tsx:160`) — vestigial.

### 4.6 Regional / Org admin

- Menu (`Layout.tsx:135-136`): **Command Center** (`/dashboard`) replaces Home when
  `isOrgAdmin || showAdminTab`. Also gets Builder, Admin, Evaluations per capabilities.
- `/dashboard` **[open]** — `RegionalDashboard` mounted directly with no guard
  (`App.tsx:153`), no internal role check found. **CONFIRMED.**
- **Label mismatch:** the menu says "Command Center", the route is `/dashboard`, the
  component is `RegionalDashboard`. Three names for one destination. **CONFIRMED.**

### 4.7 Super / Platform admin

- Dedicated nav (`Layout.tsx:121-131`): Command Center, Coach, Facilitate, Clinical,
  (Doctor), Builder, Evaluations, Admin, **Platform**.
- `/platform` **[guard]** super-admin only (`PlatformPage.tsx:23-30,41`). Tabs:
  Organizations, Users, Roles, **Pro Moves**, Impersonation (`PlatformPage.tsx:12-18`).
- The **Pro Moves** tab is `ProMoveLibrary` — the one with CSV export
  (`ProMoveLibrary.tsx:127 downloadCurrentLibrary`, `:204` Blob→csv). **CONFIRMED.**
- **The buried-CSV problem, fully traced:** the CSV export is reachable only at
  `/platform?tab=pro-moves`, only for super admins. The intuitive `/admin?tab=pro-moves`
  is intercepted and redirected to `/builder?tab=library` (`AdminPage.tsx:25-29`),
  which renders `OrgProMoveLibraryTab` — a *different* library with **no CSV**. So the
  redirect actively steers you away from the export. **CONFIRMED.**

---

## 5. Intended model vs. consolidation proposal

### 5.1 Intended (per `docs/enterprise-architecture.md` Part 3)

Every user is **participant or not**. Non-participants are defined by **capability
toggles** (`user_capabilities`) plus **scope** (`coach_scopes`, `org`|`location`).
"Coach" is not a distinct role — it is "has scope over staff + can view/review
submissions" (backlog B1). Single source of truth = `user_capabilities` + `coach_scopes`
+ `is_participant`; legacy `is_*` flags retire (B2).

### 5.2 What to collapse

| Collapse | Into | Note |
|---|---|---|
| `useAuth` role fetch (`useAuth.tsx:42-53`) | `useUserRole` | `useAuth` should own session only, not roles |
| `Layout.tsx:56-101` inline role logic | `useUserRole` | Layout should consume one hook, not three sources |
| `is_super_admin` (staff) | `is_platform_admin` (caps) | already hand-mapped at `useUserRole.tsx:56` |
| `is_org_admin` (staff) | `is_org_admin` (caps) | pick caps |
| `is_participant` (staff) | `is_participant` (caps) | pick caps |
| `is_coach` + `coach_scope_type/id` columns | `coach_scopes` table + `can_view_submissions`/`can_review_evals` | B1 |
| `is_office_manager`/`is_doctor`/`is_clinical_director`/`is_lead` | a `staff_role`/archetype attribute (not a capability) | these are *who they are*, not *what they can do* |

### 5.3 Migration order (usability-safe, matches enterprise-architecture phases + memory's "conservative migration" rule)

1. **Make `useUserRole` the single role hook.** Refactor `Layout.tsx` and `useAuth`
   to delegate every role/capability question to it. No DB change, no behavior change
   intended — this alone kills the menu-vs-guard mismatch (Problem 1). *Quick win, high
   payoff.*
2. **Backfill `user_capabilities` for all staff** from current flags (idempotent), so
   the caps row is always present. Then `useUserRole`'s legacy fallback becomes dead
   code but stays as a safety net.
3. **Flip `useUserRole` to caps-only** (drop the `caps ? … : legacy` branches). Verify
   each persona still lands and navigates correctly (live walkthrough).
4. **Retire legacy `is_*` flags** and the singular `coach_scope_*` columns.
5. **Model OM/Doctor/Clinical Director/Lead** as a `staff_role` attribute, resolved for
   display via `resolve_role_display_name()` (ties in D1).

### 5.4 Usability payoff

- One mental model for the owner: "participant? + which capabilities? + what scope?"
  — three questions instead of eight booleans plus a parallel table.
- "Who can see/do what" becomes answerable from one hook and one table, not from
  reading every page's guard.
- Menu and access can no longer disagree.

---

## 6. Prioritized "doesn't make sense" findings

Severity: **Critical** (broken access/security-adjacent), **High** (regularly blocks or
misleads real work), **Med** (friction/confusion), **Low** (cleanup).

### N1 — Menu built from a different permission source than page guards — **High** — CONFIRMED
`Layout.tsx:25,56-58` (uses `useAuth` legacy flags) vs `PlatformPage.tsx:23`,
`AdminPage.tsx:21`, `AdminBuilder.tsx:23` (use `useUserRole` caps). New-model-only users
get pages without menu links (or the reverse). **Fix:** §5.3 step 1.

### N2 — Three Pro Move libraries; CSV only in the buried one; redirect steers away — **High** — CONFIRMED
`ProMoveLibrary` (platform, CSV) `PlatformPage.tsx:16` + `ProMoveLibrary.tsx:127`;
`OrgProMoveLibraryTab` (builder) `AdminBuilder.tsx:8,136`; `DoctorProMoveLibrary`
(clinical) `App.tsx:162`. `AdminPage.tsx:25-29` redirects `?tab=pro-moves` → the
no-CSV builder library. **Fix:** decide one canonical library surface per audience;
at minimum add the CSV export to the Builder library and/or a top-level "Library" nav
entry for the roles who need it, so it isn't super-admin-only.

### N3 — Half of top-level routes are unguarded (menu-hidden only) — **High** — CONFIRMED
`/dashboard` (`App.tsx:153`, `RegionalDashboard` no guard), `/coach` +children
(`CoachLayoutV2.tsx` bare Outlet; `CoachDashboardV2` no guard), `/facilitate`
(`App.tsx:113`, `FacilitatePage.tsx:59` reads only practiceType). Contrast with guarded
`/admin`, `/platform`, `/clinical`, `/doctor`, `/my-location`. **Fix:** add a
capability/scope guard to each open route (RLS may still protect data, but the UX and
the "who can reach what" story should be consistent). *Confirm with owner whether any
open access is intentional.*

### N4 — Doctor area duplicates the top-level "My Role" IA — **Med** — CONFIRMED
`/my-role` (`App.tsx:121-132`, `MyRoleLayout`) vs `/doctor/my-role` +
`/doctor/my-role/domain/:domainSlug` (`App.tsx:168-169`, `DoctorMyRole`,
`DoctorDomainDetail`). Two parallel "My Role / domain detail" trees. **Fix:** confirm
whether doctors need a separate implementation or can reuse the shared one.

### N5 — "Command Center" / "/dashboard" / "RegionalDashboard" — one place, three names — **Low** — CONFIRMED
`Layout.tsx:123,136` label vs `App.tsx:153` path vs component name. **Fix:** pick one
term; rename route or label to match.

### N6 — Two doctor navigation modes with different link sets — **Med** — CONFIRMED
`isPureDoctor` (`Layout.tsx:112`) yields a 4-item doctor-only menu; a doctor who is also
admin/coach gets the admin menu plus a single "Doctor" link (`Layout.tsx:127,153`). Same
person-type, two very different navigations depending on an unrelated capability. **Fix:**
converge on one doctor entry point regardless of other capabilities.

### N7 — Coaching/evaluation surface fragmented across 6+ routes (management-model G1) — **Med/High** — CONFIRMED
`/coach`, `/coach/:staffId`, `/coach/:staffId/eval/:evalId`, `/admin/evaluations`
(`EvalResultsV2`), plus eval viewers `EvaluationViewer` / `EvaluationReview` /
`EvaluationReviewV2` (`App.tsx:182,192-194`) and `coach/EvaluationHub`. No single
coaching home; three eval-viewer variants suggest V1/V2/V3 coexistence. **Fix:** define
one coaching hub; retire superseded eval viewers (confirm which of the three is current).

### N8 — Orphaned routes: `/planner/dfi|rda|om` have zero inbound links — **Low** — CONFIRMED
`App.tsx:201-203` mount `PlannerPage`, but no `Link`/`navigate` anywhere targets
`/planner/*` (verified by grep). Builder tabs (`AdminBuilder.tsx`) superseded them;
`PlannerPage.tsx:34` even has a "back to /builder" button. **Fix:** delete the routes and
`PlannerPage`, or redirect to `/builder`.

### N9 — Dead files: `StatsScores.tsx`, `StatsLayout.tsx`, `ClinicalHome.tsx` — **Low** — CONFIRMED
No route mounts `StatsScores`/`StatsLayout` (referenced only by each other and a
`PracticeLog.deprecated.tsx`). `ClinicalHome.tsx` is not imported (only a comment at
`App.tsx:58`). **Fix:** delete.

### N10 — `staff.home_route` is fetched but never used for routing — **Low** — CONFIRMED (column unused) / HYPOTHESIS (intent)
`home_route` is selected in `useStaffProfile.tsx:117` and typed at `:43`, but the only
landing logic is the *computed* `homeRoute` in `useUserRole.tsx:148-155` (a different
value, derived from roles). The DB column drives nothing. **Fix:** either wire it up as
an override or drop it. (Whether a role-based landing override is still wanted:
owner input.)

### N11 — Redirect/legacy-alias sprawl in the router — **Low** — CONFIRMED
`App.tsx` carries many legacy redirects: `confidence/:week` & `performance/:week`
(`:138,140`), `builder/:roleId[...]` (`:197-199`), `admin/eval-results[-v2]`
(`:184-185`), `settings/integrations` (`:180`), `admin/organizations|locations|builder`
(`:206-208`), `my-role/focus|history` (`:127-128`), `clinical/doctors` (`:160`). Each is
individually reasonable; collectively they signal accretion and make the true route set
hard to see. **Fix:** batch-review after the bigger IA changes; keep only redirects that
protect live external links.

### N12 — Duplicate scope mechanisms: `coach_scope_type/id` columns vs `coach_scopes` table — **Med** — CONFIRMED (both exist) / HYPOTHESIS (which wins per consumer)
`useStaffProfile.tsx:31-32` (columns) and `:68-71` (table) both loaded; `useUserRole`
uses the table. **Fix:** confirm no consumer still reads the singular columns, then drop
them (folds into §5.3 step 4).

---

## 7. Sequencing: quick wins vs. structural

### Quick wins (low risk, no data migration, high clarity payoff)
- **§5.3 step 1** — make `useUserRole` the single role hook consumed by `Layout`
  (kills N1). Highest ratio of payoff to risk.
- **N9** delete dead files; **N8** delete/redirect orphan planner routes.
- **N5** rename to make Command Center / dashboard consistent.
- **N2 (partial)** add CSV export to the Builder library and/or expose a "Library" nav
  entry so the export isn't super-admin-only.
- **N10** drop or wire `staff.home_route`.

### Structural (needs migration, testing, owner decisions)
- **§5.2–5.3 full permission consolidation** (B1/B2/G2) — backfill `user_capabilities`,
  flip to caps-only, retire legacy flags and singular scope columns (N12). Do behind the
  "conservative migration" rule: keep the fallback until every persona is verified live.
- **N3** add guards to `/dashboard`, `/coach`, `/facilitate` (confirm intent first).
- **N7** define one coaching hub; retire superseded eval viewers.
- **N4/N6** converge the duplicated doctor "My Role" and the two doctor nav modes.
- **N11** router alias cleanup, last (after routes stop moving).

### Recommended order
1. Permission single-source refactor (step 1) — unblocks trustworthy nav.
2. Quick-win deletions/renames (N5, N8, N9, N10).
3. Guard the open routes (N3).
4. Pro Move library consolidation + CSV access (N2).
5. Coaching-hub consolidation (N7) — aligns with management-model G1/G8 work.
6. Full capability migration + doctor-IA convergence (B1/B2/N4/N6/N12).
7. Router alias cleanup (N11).

---

## 8. Recommended live follow-up (a code read cannot confirm)

- Click each persona through, confirming menu links match reachable pages after the
  step-1 refactor.
- Confirm which of the three eval viewers (`EvaluationViewer` / `EvaluationReview` /
  `EvaluationReviewV2`) is the current one before deleting the others.
- Confirm whether any "open" route (N3) is intentionally public within the tenant.
- Confirm no consumer still reads `coach_scope_type/id` before dropping the columns.
