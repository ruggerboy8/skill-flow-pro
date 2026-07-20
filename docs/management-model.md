# ProMoves — Management Model & Development Roadmap

> **Status:** Living draft v0.1 — 2026-07-20. Owner: John.
> **Purpose:** A shared, honest picture of how the ProMoves ecosystem actually
> operates, the management theory that legitimizes it, the gaps between the
> designed system and the deployed one, and a change-managed roadmap for
> continued development. This is also intended as durable IP for the eventual
> Alcan transaction: it articulates *why* ProMoves is a defensible way to run
> the organization, not just *that* it exists.
>
> **Analytical lenses:** Change Management (ADKAR / Kotter / Prosci) and
> Organizational Psychology (Edmondson psychological safety, Self-Determination
> Theory, Bandura self-efficacy, inter-rater calibration, Tichy leader-as-teacher).
>
> **Method note:** the current-state section blends (a) the design canon under
> `docs/` and (b) read-only aggregate queries against the live Alcan database on
> 2026-07-20. Where a claim comes from live data it is marked *(live)*.

---

## 1. ProMoves in one paragraph (the management thesis)

ProMoves is a **distributed coaching operating system**. It turns "getting
better at your job" into a measurable weekly habit for every staff member, and
it changes behavior by closing that habit loop with a *calibrated human coach at
each location*. The weekly confidence-to-performance loop is the engine; the
Pro Move is the shared behavioral instrument; a three-tier coaching cascade
(functional Director → location Lead → participant) is the mechanism that
converts weekly data into changed behavior and, ultimately, into a better
patient experience. The differentiator is not the app screens. It is that every
level of the organization coaches against the *same observable unit* with the
*same weekly data*.

---

## 2. How the ecosystem operates today (current-state map)

### 2.1 The weekly loop (the engine)
- **Check-In (start of week):** each participant sees the Pro Moves assigned to
  their role this week and rates **confidence** (1–4).
- **Practice:** they work the Pro Moves during the week.
- **Check-Out (end of week):** they rate actual **performance** (1–4) on the
  same moves. The managed signal is the **confidence-to-performance gap** and its
  trend.
- Deadlines are **per location** (own due day/time for confidence and
  performance); submissions are marked on-time vs. late.
- The loop "becomes social" in **twice-weekly facilitated meetings** (Check-In
  and Check-Out), which add connection, role-play, reflection (glows/grows), and
  meaning anchored to the patient journey.

**Health *(live)*:** genuinely adopted and growing. Active participants rose from
~19 (Aug 2025) to **68** (of 93 staff) across **12 active Alcan locations**.
Lateness fell from ~58% (late 2025) to ~15%. **But the loop leaks at check-out:**
confidence check-ins run near 100% weekly while performance check-outs run
~25–30% lower (e.g. June 2026: 807 check-ins, 579 check-outs).

### 2.2 The content spine
```
Role (RDA, DFI/front-desk, Office Manager, Doctor, …)
  └── Domain  (4: Clinical, Clerical, Cultural, Case Acceptance)
        └── Competency  (~126)
              └── Pro Move  (~332 — the atomic, observable "I always…" behavior)
```
Pro Moves carry attached learning **resources** (video/doc). Assignment is
human-controlled: a **recommender/sequencer** *suggests* next moves; a Regional
Manager reviews and sets the actual weekly plan (the sequencer never
auto-assigns). Staff do **not** self-select their own Pro Moves (a deliberate
product decision).

### 2.3 The human cascade (the mechanism) — and where it is complete
The intended structure, per functional line: **org-level Director** (calibrates
and develops the leads) → **location-level Lead** (the single source of
improvement truth at the site, and a leader in development) → **participant**.

| Functional line | Org Director | Location Lead | Weekly loop | Status |
|---|---|---|---|---|
| **RDA** (dental assistant) | Ariyana (Director of RDAs); runs regular lead-RDA check-ins | Lead RDAs (6) | Yes | **Reference implementation — works** |
| **DFI** (Director of First Impressions / front desk) | *None* — OMs / Regional Managers fill the void | Unclear (OM?) | Yes | **Broken: no director, rater drift** |
| **Office Manager** | *Unclear who coaches OMs* | OM is meant to be the front-desk truth, but facilitation is inconsistent *(live: OM participation less consistent)* | Yes | **Weak / inconsistent** |
| **Doctor** | Clinical Directors (Dr. Alex, Dr. Casey) — emerging | None (no location tier) | No (separate baseline + coaching track) | **Nascent: 8/12 baselines, 0 completed coaching sessions** *(live)* |

The RDA line is the model. The others are missing one or both tiers.

### 2.4 Evaluation & calibration
- A **quarterly** evaluation is coach-authored, scored **per competency** on a
  **1–4** scale (notes forced for scores ≤ 2), then **admin-released** to staff
  (submit ≠ release by design). An AI pipeline turns an observation recording
  into per-competency coaching notes.
- After an eval, the staff member picks **1–3 focus Pro Moves** that become what
  they check in/out against — the intended **quarterly → weekly baton pass**.
- **Calibration is emergent, not designed.** The canon contains *no* cross-coach
  norming process. *(live)* RDA Q2 2026 was scored by a **single evaluator**
  (Ariyana) → consistent; DFI Q2 was scored by **three** → drift. This is the
  clearest reason the RDA line holds and the DFI line wobbles.
- **Coverage & closure *(live)*:** evaluations exist only for RDA and DFI
  (doctors, OMs, hygienists: none). Of 59 evals released to staff, **18 were
  acknowledged (31%)**; 29 became a quarter focus. The observed-vs-practiced
  score gap in Q2 was **+0.61** with staff rating higher than the calibrated
  observer on **56%** of items. *(Framing note: the "self" score is now derived
  from weekly performance averages, so treat this as observed-vs-practiced, not
  pure self-report.)*

### 2.5 The "why" (philosophy / theory of change)
- **Hospitality Principles** reframe Pro Moves from compliance to patient
  outcome: *Own the First Moment*, *Master the Moves* ("every Pro Move has a
  patient on the other side of it"), *Be the Reason*. Target question shifts from
  "did I do everything right?" to "did this family leave better than they
  arrived?"
- Modeled on **Southwest**'s hospitality analysis; Alcan's equivalent insight
  from its own reviews is **"I didn't have to worry."**
- The **patient journey** (5 observable stages) is the meaning-anchor used in
  check-out reflection.
- Staff-facing evaluation delivery is explicitly engineered on behavioral design
  (Fogg, Cialdini, peak-end rule): **peak-first, work-second, warm-last**,
  because ownership predicts follow-through.

---

## 3. Management-theory mapping (why this is a legitimate operating model)

| ProMoves component | Established framework it maps to |
|---|---|
| Weekly confidence→performance loop | Management **operating cadence** + **self-regulated learning**; the confidence score is literally a **Bandura self-efficacy** measure |
| Pro Move as atomic observable behavior | **Behavior-based performance / OBM**; **deliberate practice** |
| Competency library + quarterly scored eval | **Criterion-referenced competency management** + **inter-rater reliability** (calibration) |
| Director → Lead → participant cascade | **Leader-as-teacher / train-the-trainer** (Tichy's *Leadership Engine*); the direct lead as the **#1 reinforcement channel** (ADKAR/Prosci) |
| Honest low-score submission | **Psychological safety** (Edmondson) as the substrate the whole loop depends on |
| Patient-outcome reframe (Hospitality) | **Purpose & autonomy** (Self-Determination Theory); meaning as the durable motivator |
| Whole system | An **adoption engine** best read through **ADKAR** (see below) |

**ADKAR read of the loop** (this is the diagnostic backbone):
Awareness/Desire ≈ check-in + the "why" (patient journey) → Knowledge ≈ Pro Move
+ resources → Ability ≈ doing the move → **Reinforcement ≈ check-out + eval +
coaching**. Every current soft spot lives on the **Reinforcement** side.

**Where ProMoves diverges from the textbooks (the moat):** most competency and
coaching systems are quarterly and top-down. ProMoves fuses a *weekly behavioral
data stream* with a *distributed coaching cascade* around a *shared observable
unit*. That fusion, not any single part, is the defensible asset.

---

## 4. Gap register (designed ≠ deployed)

Type legend: **D** = system design, **F** = focal point / attention, **R** = resource / role.

| # | Gap | Evidence | Lens | Type | Severity |
|---|---|---|---|---|---|
| **G1** | Location coaching cascade complete only for RDA; missing/weak for DFI, OM, doctor | §2.3 table; *(live)* | Tichy / ADKAR channel | R | **High** |
| **G2** | Low-confidence signal has no intervention/routing path (demand with no supply) | *(live)* regular low-confidence submissions; no follow-up mechanism | Edmondson (safety decays if unanswered) | D | **High** |
| **G3** | Calibration is emergent, not designed | *(live)* single-rater RDA works; 3-rater DFI drifts | Inter-rater reliability | D/R | **High** |
| **G4** | Reinforcement leak | *(live)* check-out ~25–30% below check-in; eval acknowledgement 31% | ADKAR Reinforcement | D/F | Med |
| **G5** | Content lifecycle: Pro Moves + learning materials aging, under-connected to Hospitality Principles / expectation clarity | Owner (John), 2026-07-20 | Curriculum maintenance | R | Med |
| **G6** | Impact measurement / KPI baseline not formalized | Owner + backlog | Measure adoption not activity | F | Med |
| **G7** | Cross-role signal synthesis (doctor → RDA director) unbuilt | Backlog NF3 | Same organ as G2 | D | Med |
| **G8** | Navigation / IA is frankensteined; important surfaces buried (e.g. Pro Move library behind Platform Console); permission model split across two systems | Owner (John), 2026-07-20 | Cognitive load; same class as G1 (Ariyana's fragmented surface) | D | Med |

**Key synthesis:** **G2 and G7 are the same missing organ** — a
synthesis-and-routing layer that delivers surfaced signals to the right
location-level coach at the right moment. Build it once, instantiate it several
ways.

---

## 5. The organizing principle for the roadmap

> **Every location has a single, calibrated source of improvement truth for each
> functional line — and the app routes the right signal to that person at the
> moment they coach.**

Two moves realize it: (1) **replicate the RDA reference cascade** across the DFI,
OM, and doctor lines (role + calibration + facilitation cadence); (2) build the
**signal-routing organ** so the weekly data actually reaches the coach.

---

## 6. Proposed sequencing (change-managed)

Guardrails from the change-management lens: don't oversaturate the org, extend
what already works before inventing new, **measure adoption not activity**, and
protect the psychological safety the loop runs on.

- **Phase 0 — Shared model (now).** This document. Agree the operating model,
  name the location-lead coaching role explicitly, and name the calibration
  practice. Mostly writing and alignment, little/no build.
- **Phase 1 — Close the highest-value loop, least build.** Route low-confidence
  signals into a short location-level coaching queue that surfaces to the lead
  (starting with the working RDA cascade). Instrument it.
- **Phase 2 — Replicate the cascade to DFI / OM.** Define the director/lead
  roles, the calibration practice, and the facilitation cadence for the
  front-desk line.
- **Phase 3 — Mature the doctor line + cross-role routing (NF3).** Once doctor
  coaching has volume, turn on the doctor → RDA-director signal path.
- **Parallel track A — Content lifecycle.** Refresh Pro Moves and their learning
  materials, re-anchored to the Hospitality Principles and sharp expectation
  clarity ("what good looks like" for each move).
- **Parallel track B — Impact measurement.** Stand up the KPI baseline (§7) from
  existing data now; layer in hard clinical data later (§9).

---

## 7. KPI baseline — computable **today** from existing data

- **Loop integrity:** check-in vs check-out completion per location/role; lateness trend.
- **Cascade coverage:** which locations/lines have an active, calibrated lead running check-ins.
- **Calibration health:** rater count per line (1 = calibrated, >1 = drift risk); observed-vs-practiced score gap.
- **Feedback closure:** eval coverage by role/location; released → acknowledged → focus-selected conversion (currently 59 → 18 → 29).
- **Signal responsiveness (once G2 ships):** low-confidence volume raised vs. addressed, and time-to-response.
- **Behavior movement:** quarter-over-quarter Pro Move score change on chosen focus areas.

---

## 8. To investigate (non-data inputs)
- Staff interviews (lived experience of the loop and the meetings).
- Ariyana's perspective on the lead-RDA check-ins (what works, what's missing).
- What "single source of truth" should mean for the OM/front-desk line.
- Retroactive KPI reconstruction where feasible.

---

## 9. Pinned — hard-data layer (future, not yet available)
Two forthcoming MCP connections will add provider- and location-level hard data:
**practice management software** and **Overjet** (AI diagnostics). These will
strengthen the KPI layer (§7) and the doctor line materially. **We are
deliberately planning as if this data does not exist yet;** do not design
dependencies on it until it is real.
