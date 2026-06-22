# Improvement Backlog & Cleanup Candidates

*A living doc for known weirdness, simplification opportunities, and legacy cleanup — separate
from the formal [roadmap.md](roadmap.md) work queue. Things land here first as candidates, get
discussed, then graduate to the roadmap when we decide to act. Started 2026-06-22.*

**Status legend:** 🟡 candidate (not yet decided) · 🟢 agreed, queued · 🔵 in progress · ✅ done

> **Current focus (2026-06-22):** building **NF4 — facilitator presentation** (#1, target: usable
> by Ariana this week) then **NF6 — HR offboarding export** (#2). Specs in
> [docs/features/](features/). The **evaluation rework** (see
> [audits/evaluation-flow-analysis.md](audits/evaluation-flow-analysis.md) + EX1–EX4) is **parked
> next** — do not resurface until the two features above are done.

---

## A. Legacy retirement candidates

These are connected remnants of the old **fixed 18-week onboarding curriculum**, from when staff
joined in cohorts and progressed in lockstep. Today staff just join and do the currently-assigned
Pro Moves, so this whole cluster is conceptually obsolete. Removal is intertwined, so treat them
together and proceed carefully — some are still load-bearing in code.

| # | Item | Notes | Status |
|---|---|---|---|
| A1 | **Cycle / week-in-cycle concept** | No longer meaningful to the product. Still wired into RPCs (`get_staff_week_assignments`, etc.) and the cycle/week formula. Retiring it is a careful, multi-surface job; may be left in place with a "legacy" label if removal is too risky. | 🟡 |
| A2 | **`weekly_focus` table** | Deprecated assignment source (cycles 1–3). Current functionality uses `weekly_plan` / `weekly_assignments`. May still back some historical staff views — confirm before removing. | 🟡 |
| A3 | **Rollover** (`src/v2/rollover.ts`, `sequencer-rollover`) | Only runs for cycles 1–3; pushes incomplete site moves to backlog. Dormant for current usage. Legacy of the self-select idea. | 🟡 |
| A4 | **Self-select** (`weekly_self_select`, `weekly_focus.self_select`) | Product decision: staff will **not** self-select Pro Moves. Remove if it breaks nothing; else mark "considered, not adopted." | 🟡 |

## B. Model simplification

| # | Item | Notes | Status |
|---|---|---|---|
| B1 | **Consolidate "Coach" into the capability model** | With flexible capability toggles, "coach" as a distinct role/permission may be redundant — a coach is really "has scope over staff + can review submissions/evals." Evaluate removing the dedicated role/flag. Keep **Office Manager** (participant + location visibility), **Regional**, **Doctor**, **Clinical Director**, **Org/Super Admin** as-is. | 🟡 |
| B2 | **Retire the dual permission systems** | Old `is_*` flags on `staff` (what `useUserRole` reads today) vs. the newer `user_capabilities` table. Pick one source of truth and migrate. High-value, touches auth everywhere. | 🟡 |

## C. Multi-tenancy: Alcan-specific features

As we move from "Alcan's internal tool" to multi-tenant SaaS, some features are **Alcan-only** and
should be gated or removed so they don't confuse other organizations. We need a clean, reusable way
to mark a feature as org-scoped (feature flag per org, or capability, etc.).

| # | Item | Notes | Status |
|---|---|---|---|
| C1 | **Coach baseline assessments** | Only used when Alcan onboards a new *practice*. Either gate to Alcan only, or drop entirely and treat an org's **first evaluation as its baseline**. **Doctor baseline is unaffected — it stays.** | 🟡 |
| C2 | **General mechanism for Alcan-only / org-specific features** | Decide the pattern (per-org feature flags?) before we accumulate more one-offs. | 🟡 |

## D. Role display names (multi-tenant)

| # | Item | Notes | Status |
|---|---|---|---|
| D1 | **Per-org role labels everywhere** | Canonical roles (DFI, RDA = "dental assistant", Office Manager) with org-specific display overrides (UK → "Dental Nurse"). Ensure every surface resolves the org label via `resolve_role_display_name()` rather than raw `roles.role_name`. | 🟡 |

## E. Known-buggy / to-build features

| # | Item | Notes | Status |
|---|---|---|---|
| E1 | **Evaluations** | Coach does eval items + audio recording + reporting; org admins run the release flow. Known to have bugs. A feature John + Claude plan to work on together. | 🟡 |
| E2 | **Timezone hard-coding** | `lib/centralTime.ts` defaults to `America/Chicago`. Blocker for UK launch; location-level timezone should replace it. (Also in roadmap TIER 1.) | 🟡 |

## F. John's brain dump — known weirdness & opportunities

*From John, 2026-06-22. Split into improvements to existing features vs. net-new features. Not
exhaustive; cross-referenced to audit findings and other backlog items where they overlap.*

### F.1 — Existing features to improve

| # | Area | What's wrong / desired | Status |
|---|---|---|---|
| EX1 | **Evaluation feedback capture** | Flow is clunky; hard for evaluators to know how to give feedback. Too much cognitive load tracking *which competency* they're addressing (the competency-vs-Pro-Move mental model is the friction). **Ideal:** evaluator records ONE long free-form brain-dump of observations; the system auto-slots it into the right competency/Pro Move, prioritizing places where they flag specific Pro Moves to work on. (Ties to E1, NF2-AI.) | 🟡 |
| EX2 | **Evaluation audio recording** | The current recording implementation is very clunky / not smooth. | 🟡 |
| EX3 | **Evaluations "Delivery" / release tab** | Built so central office controls *when* a staff member receives an eval, separate from coach submission. Visually poorly composed; the coach-submit → admin-release flow has awkwardness. Likely needs a clearer internal policy for how release works. (Ties to RLS eval-visibility fix.) | 🟡 |
| EX4 | **Feedback delivery to staff** | What the staff member receives isn't automatically joyful / positive / complete. Want to dial in both how we solicit feedback from coaches and how we translate it into something good for the user. | 🟡 |
| EX5 | **Clinical tab — coaching session setup** | Clinical director (Alex) about to use it regularly; built with an incomplete picture of how it'd work. Review and tighten. | 🟡 |
| EX6 | **Learning-content management** | Needs improvement for the original Alcan content AND for the new org-tenant model — how learning content is owned/managed per organization. | 🟡 |
| EX7 | **Org-level Pro Move editing** | The editing experience regressed when we limited orgs to visibility-only; the earlier editing experience was better. Revisit access/location/UX of editing Pro Moves at the org level. (Ties to data-model org override tables.) | 🟡 |
| EX8 | **Coach dashboard size** | Getting large (unsure if a real problem). Staff-detail pages are good. Builder tab is now good (drag-drop + recommendations) — *no action needed.* | 🟡 |

### F.2 — New features

| # | Feature | Notes | Status |
|---|---|---|---|
| NF1 | **Automated reminders + org-admin notification settings** | Replace manual button-press reminders with a scheduled (cron) job. Give org admins control over how/when their people get notifications & email reminders. (Builds on `coach-remind` / `reminder_*` tables.) | 🟡 |
| NF2 | **AI insights** | Leverage the growing data (some of this is already documented elsewhere). | 🟡 |
| NF3 | **Staff free-response reflections** | Let staff record free-text reflections on Pro Moves or their general experience. Triangulate evaluations ↔ staff sentiment ↔ doctor coaching to generate far more insight. (Pairs with NF2.) | 🟡 |
| NF4 | **Native meeting presentation / facilitation** | Move the Mon/Thu(or Fri) Pro Move meeting deck out of Canva into the app. Must: auto-generate a get-to-know-you question the presenter can click through until satisfied; show the week's Pro Moves for a selected position (RDA / DFI); be visually appealing for facilitation; pull up resources/scripting attached to those Pro Moves. **Scoped → [features/facilitator-presentation.md](features/facilitator-presentation.md).** | 🔵 |
| NF5 | **Staff-facing patient-journey summary** | A scrollable summary of what the patient journey should entail; adopt "patient journey" language more broadly. John has a prototype from another Claude session to show. | 🟡 |
| NF6 | **User status management / HR integration** | Use the Deputy integration to detect new staff & their positions and provision more automatically. On termination: when a fired user is deleted, roll up all their relevant data and send it to HR for retention *before* deletion. (Ties to GDPR erasure/retention — roadmap S1.) **Scoped → [features/hr-offboarding-export.md](features/hr-offboarding-export.md).** | 🔵 |

---

## Change management for active users

The app has **active users right now.** Most changes should be designed to be self-explanatory and
need no announcement. But when a change alters an existing workflow in a way users will notice, we
should produce a short **"how it used to work → how it works now"** note for affected users.

**Practice:** when we scope a change, explicitly decide *"does this need a user-facing change note?"*
If yes, we draft it alongside the change. (We can keep such notes in a `docs/changes/` folder when
the first one is needed.)
