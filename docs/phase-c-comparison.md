# Phase C — The Platform vs. the PRD (full comparison)

> **Date:** 2026-07-24. **Method:** seven parallel specialist audits (participant
> loop, facilitation, coaching/signals, Builder/sequencer, evaluations, doctor
> line, admin/tenancy), each scoring the live code against
> [clean-room-prd.md](clean-room-prd.md) requirement by requirement, with
> file:line evidence, plus live read-only DB checks. This document is the
> synthesis; the per-space raw reports informed it. **This replaces the old
> Track 3 in [simplification-roadmap.md](simplification-roadmap.md).**

## Headline

Of ~43 scored requirements: roughly **15 ALIGNED, 20 CLOSE-NEEDS-TWEAK, 8
MISALIGNED-OR-MISSING**. The pattern is unambiguous and matches the
management model's prediction: **the capture engine is built and healthy; almost
everything missing lives on the reinforcement side** — closing the eval loop,
routing the low-confidence signal, measuring what matters, and making the
recommender genuinely useful. The "unrequired" bucket was mostly pre-emptied by
the July cleanup; what remains is a modest deletion batch (below).

## The sequencer, finally explained (John's original question)

One real engine (`sequencer-rank` v5.0). It scores every eligible move as a
weighted blend: **collective weakness 50%** (9 weeks of check-in confidence,
statistically smoothed), **recency 22%** (cooldown 4wk, full weight at 16wk),
**eval deficit 13%**, **static AI "curriculum priority" 10%**, **domain variety
5%**. It picks a top 6 respecting cooldown and 2-domain minimum, tags each with
one reason code, and the Builder shows one plain sentence per suggestion. It is
deterministic, advisory (never auto-publishes; a separate Auto-fill button
writes editable drafts), and **it does work**. Judged against CS-3's four
forces: recency ✅, topicality ½ (reads confidence + evals but NOT surfaced
coaching issues), intensity ½ (structural only), **inherency ✗** (foundational
moves have ~1% influence and nothing makes them recur). Explainability meets the
ship-gate in spirit but is single-signal and written in 3+ places plus one LLM
paraphrase (drift risk).

## Immediate actions (integrity & safety — do before feature work)

| # | Item | Why now |
|---|---|---|
| U1 | **Scope the `pro_moves` policies.** Base table SELECT policy is `true` and the manage policy has no org filter: any org's coach/admin can read AND edit/retire every tenant's moves. UK's Abbie Fox holds `can_manage_library` today. Blocked on one owner decision (D1 below), then a small policy migration. | Confirmed cross-org write access |
| U2 | **Per-org HR export recipient.** `send-hr-export` mails a single global (Alcan) address; a UK leaver's GDPR retention record would go to Alcan HR. | Cross-border PII routing |
| U3 | **Target-org guards on `role_preset` / `pause_user` / `unpause_user`** in admin-users (caller-org == target-org; `invite_user` already does this). | Inconsistent authz pattern |
| U4 | **Apply the parked hollow-eval release guard** (`supabase/staged/guard_release_against_hollow_evals.sql`). Verified NOT live; the client submit guard is the only defense before the next release round. | Known incident class |
| U5 | **Fix WL-2 late-flag correctness.** Per-location deadlines drive display but NOT the `confidence_late`/`performance_late` written at submit (system defaults used). Wrong accountability data for any custom-deadline location; hard UK blocker. | Core honesty guarantee |
| U6 | **Orphan production functions + hourly ghost cron.** 11 deployed edge functions have no repo source; 3 are PUBLIC (`sequencer-health`, `compute-weekly-plans`, `sync-onboarding-assignments`); cron `weekly-rollover` still invokes the orphan `rollover-weekly` **hourly** (`select cron.unschedule('weekly-rollover');` — one click in SQL editor; my attempt was permission-blocked). Then delete the orphan functions from the dashboard (no repo source = not redeployable, so owner confirms list first) and drop the ghost `[functions.sequencer-health]` from config.toml. | Unauthenticated orphan endpoints |
| U7 | **Flip `REVIEW_V2_DEFAULT` decision + fix the broken promise.** Staff currently receive the old V1 eval experience (V2 flag defaults off), and V2's recap promises focus moves will appear in weekly check-ins but nothing reads `staff_quarter_focus` in week assembly. Ship the connection or change the copy. | Product breaks its own word |

## Master scorecard (condensed)

**Weekly loop:** WL-1 ✅ (genuinely tight, mild home crowding) · WL-2 🔧 (U5) ·
WL-3 🔧 (great one-tap reminders; NO scheduled reminders exist; leads/OMs can't
send — D4) · WL-4 🔧 (Deputy works; excusals land retroactively Monday-after —
D5) · WL-5 🔧 (self-select slots + ~300-line backfill workflow contradict locked
decisions — D6).

**Facilitation:** FM-1 ✅ (submit moment lacks "phones out" + live feedback) ·
FM-2 ✅ (journey content is hard-coded Alcan-pediatric) · FM-3 🔧 (2/3 of moves
render bare; `intervention_text` exists on 234 moves but only shows when a
resource exists — cheap structural fix; and the FM-3 persona, the OM, is locked
out of the route — D3) · plus: surface pins to the facilitator's own location
with no picker, though facilitators travel.

**Coaching & signals:** SR-1 🔧/✗ (location tier = Ariyana's workspace, real and
good; **individual low-confidence signal routes nowhere** — plumbing half-built
twice, incl. a dead `useConfidenceSpotlight` hook) · SR-2 🔧 (lead queue exists,
capped at 2, lovely; no designated-catcher concept — `/training` is gated
super-admin — D7) · SR-3 🔧 (staged interventions exist; no curriculum-nudge hop
into the sequencer; no responsiveness metrics) · SR-4 🔧 (RDA-first order
correct; blocked on the archetype gate) · ME-1 ✗ (**no owner health view at
all**; Command Center answers only "who's late this week"; every metric is
computable from existing tables and §7 of management-model is the spec).

**Curriculum/sequencer:** CS-1 ✅ · CS-2 ✅ · CS-3 🔧 (see above; wire issues →
topicality, add inherency recurrence — D8, unify explanation building) · CS-4 🔧
(platform→effective library real; no hospitality-principle linkage) · CS-5 ✗
(expected P2; note `sequencer-rank` hard-types `roleId: 1|2`, so OM content also
needs an engine change).

**Evaluations:** EV-1 ✅ (two parallel capture surfaces to consolidate) · EV-2 ✗
(baseline type fully intact; **13 submitted Baseline evals in limbo** — D9) ·
EV-3 🔧 (no position dimension, per-staff release contradicts batching, no
all-finished gate; U4) · EV-4 🔧 (**57 of 58 released get viewed; 18 act** —
instrumentation without an engine; D10) · EV-5 ✗ (zero calibration/drift
surface; `evaluator_id` makes it a query away) · EV-6 ✅ (observed-vs-practiced
is real and frozen at submit; single-period only, no QoQ trend).

**Doctor line:** DR-1 ✅ (side-by-side compare with gap filters, right where the
PRD wants it) · DR-2 🔧 (full session loop exists; `prior_action_status` is
captured then never displayed — its only reader is dead code; no cadence
mechanism — D11) · DR-3 ✅ (with the known IA duplication debt) · PP-2 🔧 (no
per-director line split; both directors see all doctors — D12).

**Admin/tenancy:** PP-1 🔧 (model is right; vocabulary is legacy; no OM or
Evaluator preset — the 1.5 build) · PP-3 🔧 (U2; also org admins cannot offboard
their own leavers — D13) · MT-1 🔧 (U1) · MT-2 ✗ (no isolation tests; two
confirmed reach paths = U1, U3) · MT-3 🔧 (wizard is polished; logo-upload
failures silently swallowed; missing staff-import/library-review/dry-run steps)
· MT-4 ✅. **UK eval dry-run flag:** `resolve_role_display_name` is never called
from eval surfaces, so UK role labels won't render there; verify TZ handling
before the first UK eval.

## The new Track 3 (waves; replaces the old list)

**Wave 1 — Integrity (this week):** U1-U7 above. Small, mostly backend, each
independently shippable.

**Wave 2 — Close the reinforcement loop (the big value):**
1. EV-4 engine: flip V2 default (after D10), connect focus moves into weekly
   check-ins (or fix the copy), stalled-staff re-nudge in DeliveryTab, async
   question channel on received evals.
2. SR-1 individual tier: low-confidence submissions flow into the Training
   workspace as auto-tagged signal items for the right catcher, same week.
3. WL-3: scheduled automatic reminders (cron), and the lead/OM send policy (D4).
4. ME-1: the owner health view — loop integrity trends, cascade coverage,
   calibration health, closure funnel, QoQ movement (management-model §7 is the
   spec; all computable today).

**Wave 3 — Right-size the machine:**
5. 1.5 archetype presets (9 approved names, OM + Evaluator first-class,
   target-org guards, kills the `role_id===3` magic) + `/training` gated by a
   Functional Director archetype instead of super-admin.
6. Sequencer CS-3 upgrades: coaching issues feed topicality; per-move recurrence
   cadence for inherency (D8); one server-side explanation builder.
7. Facilitation: always render `intervention_text`; location picker; warm empty
   state; "phones out" submit moment with live submission ticks.

**Wave 4 — Consolidate & polish:** eval capture consolidation (one surface);
retire EvalResults v1; doctor IA convergence + surface the prior-action
timeline (D11) + per-director lines (D12); WL-5 removals per D6; jargon sweep
("Cycle • Week" badge, "Backfill", "Competency Blueprint"); MT-3 wizard
additions + un-swallow branding errors; an isolation test.

## Owner decisions needed (the roster)

- **D1** Pro Moves library model: one shared global library (practice-type
  filtered) or per-org authored content? Decides the U1 policy shape.
- **D2** (settled by U6 review): confirm the 11 orphan functions to delete.
- **D3** FM-3/OM facilitation: sequencing decision (OMs later, after CS-5) or
  re-scope the requirement?
- **D4** Who can send reminders: your 7/25 restriction vs the PRD's lead+OM
  inclusion — and does a scheduled auto-reminder change the answer?
- **D5** Deputy excusals: week-after honesty acceptable, or add mid-week sync?
- **D6** Backfill workflow and self-select slots: retire (per WL-5) or keep
  backfill as a sanctioned admin-granted exception?
- **D7** `/training` becomes Functional-Director-gated: confirm.
- **D8** Inherency: is AI `curriculum_priority` the intended stand-in (needs a
  much bigger weight) or do you want explicit per-move recurrence cadence?
- **D9** The 13 limbo Baseline evals: archive, or fold into nearest quarter?
- **D10** EV-4 lever: admin-side stalled-nudge queue, staff-side stronger flow,
  or both? What gates flipping V2 to default?
- **D11** Prior-action history: surface it (where?) or delete the dead timeline?
- **D12** Assign doctors to directors (state/line mapping) or shared-org view?
- **D13** Should org admins offboard their own staff, or is delete deliberately
  platform-only?

## Deletion batch (unrequired / dead, safe after decisions)

Dead code: `useConfidenceSpotlight.tsx`, `DoctorGrowthTimeline.tsx` (unless
D11 revives), `RecommenderPanel.tsx`, `WeeklyProMovesPanel.tsx`, dead seed data
in `facilitatorData.ts`, dead Lead Pro Move JSX in `ThisWeekPanel` (~150
lines), legacy `EvalResults` v1 tree, ghost `[functions.sequencer-health]`
config entry. Pending decisions: backfill/repair branch (~300 lines, D6),
baseline eval type end-to-end (D9), per-staff single release (or keep as
escape hatch), duplicated doctor browse tree.
