# Utilization Snapshot — how ProMoves is actually used (2026-07-24)

> **Method:** live read-only queries against the production database on 2026-07-24,
> combined with an owner interview (John) the same week. This updates and extends
> [management-model.md](management-model.md) §2 with verified numbers and corrects
> several stale claims in other docs (see §8). Companion doc:
> [simplification-roadmap.md](simplification-roadmap.md).

---

## 1. The one-paragraph reality

ProMoves is, in practice, a **weekly data-capture habit that works** (check-ins/outs,
well-facilitated twice-weekly meetings) wrapped in surfaces that do not yet convert
that data into intervention. The owner's own words: "our current setup really drives
passive data acquisition and some light feedback delivery... it doesn't yet do a good
job of driving next-level interventions." Every simplification and enhancement
decision should be judged against that gap.

## 2. Tenancy actuals

| Organization | Type | Active staff | Activity (60d scores) | Status |
|---|---|---|---|---|
| Alcan Pediatric Dental | pediatric_us | 91 | 1,425 (last: today) | Fully live |
| Avenue Dental ("Alcan Avenue") | general_uk | 9 | 33 (last: 2026-06-30) | Real, dormant, expected to resume shortly |
| London Dental Centre | general_uk | 1 (never logged in) | 0 | Demo shell — **keep** (active discussions) |
| The Confident Dentist Academy | general_uk | 1 (never logged in) | 0 | Demo shell — **keep** (active discussions) |

**Owner intent:** multi-tenancy exists to serve the UK sister org (general vs.
pediatric practice content), not a SaaS sales motion. No plan to sell or license.
Keep basic tenancy + the onboarding flow (credibility value); stop building ahead
of demand.

## 3. Who actually runs the system (the real personas)

The 66 `user_capabilities` rows collapse into **six real configurations**:

| Persona | Count | Who / notes |
|---|---|---|
| Participant | 34 | Plain weekly-loop users |
| Doctor | 13 | Caps row all-false; doctor-ness lives on `staff.is_doctor` |
| Participant + location visibility | 9 | Leads / OMs (`can_view_submissions`) |
| Platform admin | 3 | John, Ariyana, Tim |
| UK org admin | 3 (+2 variants) | Barry, Bobby, Hannan (+ Sam, Abbie, Frank one-offs) |
| Participant-evaluator | 1 | Jennifer Esquivel |

**Critical split-brain finding:** eight of the most operationally important people
have **no capability row at all** and run purely on legacy `staff.is_*` flags:
**Raul Carrillo, Wes Johnson** (regional managers, set the weekly curriculum),
**Lauren Arevalo** (super admin, returning from leave), **Dr. Alex Otto, Kasey
Stark** (clinical directors), and OMs **Delfina Villa, Lydia Ahrlett, Shy Council**.
Meanwhile the UK admins exist *only* in the new capability system. Both permission
systems are load-bearing for different halves of the leadership team. This is why
permission changes feel dangerous, and why the backfill (roadmap Track 1) must come
before any retirement.

Admin-surface usage in practice: Raul + Wes (and soon Lauren) set DFI curriculum;
Ariyana touches Builder/Admin most; **only John uses the eval release flow.**

## 4. Assignment architecture: what is actually live

Three generations exist; only the third is live:

1. `weekly_focus` — fixed 18-week onboarding sequence era. 108 rows, frozen since
   2026-01. Historical only.
2. `weekly_plan` — the "global plan" era. 6 rows, frozen since 2025-11.
3. **`weekly_assignments`** — the canonical, live source (1,363 rows; written by the
   Builder via the `planner-upsert` edge function).

Verified 2026-07-24: the core RPCs (`get_staff_week_assignments`,
`get_staff_statuses`) read **only** `weekly_assignments` + `weekly_scores` (one
overload also reads `user_backlog_v2`). Frontend references to `weekly_plan`
(wizards, facilitatorData, planner components, `sequencer-rank`) are stale fallback
paths. **`src/lib/unifiedAssignments.md` describes the generation-2 architecture and
is out of date.**

**Owner decision (2026-07-24):** assignment scope is **universal** for now — every
user/location joins the single global sequence. No self-select, ever ("considered,
not adopted"). Per-user/location differentiation is a someday-maybe, not a design
constraint.

## 5. Doctor / clinical track — active and correctly recorded

Earlier "0 completed coaching sessions" is stale. As of 2026-07-24:

- 5 coaching sessions: Ana Ibarra-Noriega **completed** (`doctor_confirmed`
  2026-07-21, meeting record + 4 actions) and a follow-up scheduled; Henry Martinez
  2 scheduled; Ayah Koleilat at `doctor_prep_submitted` with **Kasey Stark (Dr.
  Casey)** — both clinical directors are now active.
- 3 completed `coach_baseline_assessments` (Henry 06-12, Ana 07-08, Ayah 07-21,
  53 items each).
- **Doc correction:** `coach_baseline_assessments` is the **clinical director's
  observed baseline of a doctor** (columns: `doctor_staff_id`, `coach_staff_id`),
  the counterpart to the doctor's self-baseline (`doctor_baseline_assessments`).
  It is NOT the retired "Alcan onboards a new practice" feature described in
  data-model.md / backlog C1. It is active and load-bearing for the doctor track,
  which is a **top organizational priority** for the coming months.

## 6. Evaluations — capture works, delivery and closure leak

Funnel (all-time): **88 submitted → 55 released → 18 acknowledged → 18
focus-selected** (+4 drafts). Confirms the owner's diagnosis: the new capture
surface addresses input quality, but there is no mechanism ensuring staff see,
understand, or act on their evals, and no back-and-forth. One-on-one review is not
staffable for RDAs (one evaluator, many staff); possibly feasible for DFIs.

**Release policy (owner, 2026-07-24):** keep the gated release. Written policy:
*for a given location and position, evals are released together after all of them
are finished* — staff at a location get them at the same time, not staggered.

## 7. Deputy integration — healthy, plus an untapped opportunity

- Weekly cron sync every Monday 08:00 UTC since early May, all runs successful,
  ~68-76 mapped participants, 2-6 auto-excusals/week with correct reasons. The old
  over-excusal bug is not recurring.
- Minor tidy-ups: the active connection has `sync_enabled=false` +
  `auto_sync_enabled=true` (confusing flags, works anyway); a second connection
  (created 2026-06-25, presumably UK) was never enabled.
- **Opportunity:** Deputy fires an `Employee.Insert` webhook when HR creates a new
  employee. Pointed at a Supabase edge function (HMAC-verified), it could
  auto-draft a ProMoves profile / invite and end the "new hire shows up to a
  meeting with no profile" problem. Not high priority; cheap to build.

## 8. Confirmed-dead tables and corrections to other docs

**Dead (never or long-unused), retirement-eligible:** `weekly_self_select` (0 rows),
`manager_priorities` (0), `resource_events` (0), `user_backlog` v1 (0),
`weekly_focus` (frozen), `weekly_plan` (frozen). Nuance: `user_backlog_v2` is
**semi-live** (1,170 rows, written daily; read by one RPC overload and populated on
missed weeks) — retiring it is a small project, not a table drop; see roadmap.

**Doc corrections needed:**
- `data-model.md` §6 + `improvement-backlog.md` C1: coach baselines are the doctor
  track, not practice onboarding (see §5). C1's "drop it" option is off the table.
- `management-model.md` §2.3: doctor line now has completed baselines + 1 confirmed
  session; both directors active.
- `src/lib/unifiedAssignments.md`: describes the retired focus/plan switching
  architecture.

## 9. Owner's assessment of the surfaces (interview highlights)

- **Participant side nav (Home + My Role): good as-is.** Most staff only submit
  confidence/performance scores. Eval-viewing and focus-selection culture is thin,
  partly an organizational communication gap ("it just popped up on the app one
  day").
- **Direction: persona-shaped app.** Each persona has a distinct job; the coach
  persona (Ariyana's training surface) has the greatest upside — surfacing issues
  and driving location-based intervention.
- **Highest-need area: evaluation delivery/communication** (see §6).
- **Also missing:** any mechanism that routes learning resources based on
  confidence/performance/eval scores; and (future) natural-language staff feedback
  capture to triangulate location/org issues (extends backlog NF3).
- **Highest-fidelity part of the system:** the facilitated check-in/check-out
  meetings.
