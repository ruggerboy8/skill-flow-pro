# ProMoves — Clean-Room Product Requirements (reverse PRD)

> **Status:** v0.1 draft for John's review — 2026-07-25.
> **Method:** written as if John brought his operating model to a developer on day
> one, *deliberately blind to the current app*. Sources: the operating model docs
> ([management-model.md](management-model.md), hospitality principles) and two
> owner interviews (2026-07-24/25). Nothing in here references current screens,
> tables, or code on purpose.
> **What it's for:** Phase C compares this doc against the app, space by space.
> Every finding lands in one of four buckets:
> **✅ aligned** · **🔧 close, needs tweak** · **❌ misaligned or missing** ·
> **🪦 unrequired** (implemented capability with no stated need here).
> **Priorities:** P0 = core operating model, must work well today. P1 = needed to
> close known gaps. P2 = future / requires discussion first.
> Sections marked **[DISCUSS]** are proposals awaiting a design conversation, not
> settled requirements.

---

## 1. The system in one paragraph

ProMoves is a distributed coaching operating system for dental practices. Every
staff member practices a small set of observable behaviors ("Pro Moves") each
week, rates their confidence at the start of the week and their performance at
the end, and reviews both in short facilitated group meetings. A coaching
cascade (functional director → location lead → participant) converts that weekly
signal into changed behavior; quarterly calibrated evaluations keep everyone
honest; and the purpose anchor is always the patient ("every Pro Move has a
patient on the other side of it"). The app's job is to make the weekly habit
nearly effortless, make the meetings easy to run well, and route the right
signal to the right coach at the moment they can act on it.

## 2. Actors and their real weeks

| Actor | Their week |
|---|---|
| **Participant** (RDA, DFI, OM as learner) | Attends a check-in meeting early-week: icebreaker, discussion/role-play of this week's Pro Moves, then submits confidence scores. Attends a check-out meeting late-week: icebreaker, glows-and-grows reflection, submits performance scores. Occasionally: receives a quarterly evaluation, picks focus moves, views learning resources. |
| **Location Lead** (e.g. Lead RDA) | A participant who is also the location's source of improvement truth for their line: has a regular conversation with their functional director where surfaced issues land, and carries interventions back to peers. |
| **Office Manager** | A participant (operational Pro Moves today; leadership Pro Moves are a stated development goal). Additionally sees their location's participation: who has/hasn't submitted, and can look into low-confidence flags. Intended future: an intervention vector for DFI/patient-flow issues (see §7). |
| **Functional Director** (Ariyana for RDA; Raul + Wes covering DFI and OM) | Facilitates check-in/check-out meetings across the org for their line (Mon/Tue and Thu/Fri). Sends targeted reminders to non-submitters. Sets/adjusts the weekly curriculum roughly biweekly. Runs quarterly evaluations. Holds regular lead conversations (RDA line today) where issues route to intervention. |
| **Clinical Director** (Dr. Alex, Dr. Casey) | Runs the doctor line: observed baselines, prep, recurring coaching sessions with agreed actions and follow-ups. |
| **Doctor** | On the clinical coaching track (self-baseline, prep, sessions), not the weekly loop. |
| **Org Admin** (UK sister org) | Sets up and runs their own org: locations, staff, branding, deadlines. Must be self-explanatory; no access to any other org's anything. |
| **Platform Owner** (John) | Everything above plus: releases evaluations, manages the platform library, onboards orgs, watches system health. Wants to *shed* jobs to the actors above over time, not accumulate them. |

---

## 3. Weekly loop (capture) — P0

- **WL-1** A participant can see this week's assigned Pro Moves and submit
  confidence (start of week) and performance (end of week) ratings in under two
  minutes, on a phone, with zero training. This is the whole job of the
  participant surface; nothing may crowd it.
- **WL-2** Deadlines are per location (day + time for each of confidence and
  performance); submissions are marked on-time/late accordingly.
- **WL-3** Non-submission is visible same-day to the location lead, OM, and
  functional director, with one-tap targeted reminders (and, P1, scheduled
  automatic reminders configurable per org so a human doesn't press the button).
- **WL-4** Legitimate absence (didn't work the relevant days, leave, location
  closure, not yet started) auto-excuses the requirement, driven by the
  workforce-management system where connected, so accountability data stays
  honest without manual bookkeeping.
- **WL-5** The weekly loop is universal: one global scope-and-sequence per role;
  every location and new joiner drops into the current week. No self-selection,
  no per-user tracks, no catch-up workflow for missed weeks (the meeting is the
  point; a missed week is simply missed).

## 4. Facilitated meetings — P0

- **FM-1** A facilitator can run a check-in or check-out meeting from a single
  presentable screen: icebreaker prompt (regenerable until satisfied), this
  week's Pro Moves for the selected role with scripting/expectations, attached
  learning resources playable in the room, and a clear "now submit your scores"
  moment.
- **FM-2** Check-out adds a reflection structure (glows/grows) anchored to the
  patient journey.
- **FM-3** Prep time target: a competent facilitator needs under five minutes of
  preparation; a nervous first-time facilitator (the OM case) can run an
  acceptable meeting just by following the screen. Facilitation confidence is a
  named adoption bottleneck for the OM line; the surface itself is the training
  wheels.

## 5. Curriculum & sequencing — P0 for manual, P1 for assisted

- **CS-1** Content hierarchy: Role → Domain → Competency → Pro Move, with
  learning resources attached at the Pro Move level. Pro Moves carry practice
  type (pediatric/general) so each org sees content fit for its practice.
- **CS-2** A functional director can set the upcoming weeks' Pro Moves for their
  role in minutes: see what's planned, drag/adjust, publish. Manual control is
  the baseline and always wins.
- **CS-3 (P1)** The system *proposes* a scope-and-sequence the director can
  accept or adjust, balancing four named forces: **recency** (time since last
  practiced), **inherency** (foundational moves recur more), **topicality**
  (what current signals — low confidence, eval scores, surfaced issues — say is
  needed now), and **intensity** (don't overload; respect a weekly budget).
  Every proposal shows its reasoning in one plain sentence ("last practiced 14
  weeks ago; 3 low-confidence flags at two locations"). A proposal engine that
  can't explain itself doesn't ship. Full automation is explicitly *not* the
  requirement; assisted curation is.
- **CS-4 (P1)** Library lifecycle: owners can add, revise, retire, and re-anchor
  Pro Moves (wording, resources, hospitality-principle linkage) with the org
  seeing only current content; per-org visibility and wording overrides for the
  multi-tenant library (platform library → org's effective library).
- **CS-5 (P2)** The OM Pro Move set gains cultural/leadership content (being
  developed with Raul and Wes); the model must not assume all Pro Moves are
  operational tasks.

## 6. Evaluation & calibration — P0, with named P1 gaps

- **EV-1** Quarterly, per role line: an evaluator scores each competency 1-4
  with notes required on low scores, drawing on observation. Capture must be
  low-friction in the operatory/front-desk context (record a long free-form
  observation; the system helps slot it into competencies).
- **EV-2** Evaluations happen **only** on the standard quarterly timeline. There
  is no separate "baseline" evaluation type; a newly joined org's first
  quarterly round *is* its baseline.
- **EV-3** Release is gated and batched: for a given location and position,
  evals release together once all are finished, on an admin's explicit action.
  Nobody learns "everyone else got theirs days ago."
- **EV-4 (P1)** Closure is a first-class requirement, not an afterthought: the
  staff member is actively brought to their eval (peak-first, work-second,
  warm-last delivery), acknowledges it, picks 1-3 focus Pro Moves, and those
  focus moves visibly connect to their subsequent weeks. Target: released →
  acknowledged → focus-selected approaches 100%, and the app + meeting cadence
  (not 1:1 review, which doesn't scale for the RDA line) is what gets it there.
  An async question/comment channel on a received eval substitutes for the
  unstaffable 1:1. **[DISCUSS: exact staff-side experience]**
- **EV-5 (P1)** Calibration is designed, not emergent: one calibrated rater per
  line where possible; where multiple raters exist, the system exposes
  rater-drift (score distributions by rater) and supports a norming practice.
- **EV-6** Evaluation aggregates roll up by location and org for trend reading
  (see §8), and observed-vs-practiced gaps (eval score vs. weekly performance
  self-rating) are computable per competency.

## 7. Signal routing & intervention — P1, scaffolded **[DISCUSS]**

*The one working intervention loop today is human: Ariyana's recurring Lead-RDA
conversations. The requirement is to give that loop rails, then extend it to
other lines gently (change-management constraint: introduce one new habit at a
time, to people who already have adjacent habits).*

- **SR-1** Tiered signal model:
  - **Individual:** a low confidence score is the highest-authenticity signal
    ("I'm raising my hand"). It must reach the right coach (lead / director /
    OM per line) while the week is still live, not in a report later.
  - **Location:** confidence aggregation is weak; the meaningful location
    signals are evaluation aggregates and a lightweight **issue log** the
    director/lead maintains (Ariyana's emerging practice): observed issues,
    linked where possible to competency/Pro Move, with status.
  - **Org:** under-defined by design; start by rolling up the location layer
    (issue themes, eval trends) and learn what's useful before building more.
- **SR-2** Every surfaced signal has a designated catcher per line/location (the
  "single source of improvement truth"), and the app routes to that person: a
  short queue of "worth a conversation this week" items, not a dashboard to go
  digging in.
- **SR-3** Interventions are lightweight and trackable: acknowledge → converse /
  role-play / resource / curriculum nudge (feeds CS-3 topicality) → resolved,
  with just enough logging to see time-to-response and themes, and never so much
  process that it deters honest low scores (psychological safety is a hard
  design constraint: signals route to coaching, visibly never to punishment).
- **SR-4 (P2)** Rollout order follows the working cascade: RDA line first
  (rails under the existing habit), then OM-as-catcher for DFI/patient-flow
  issues once OM leadership development (CS-5) makes that fair to ask.
- **SR-5 (P2)** Staff free-text reflection ("how is it going?") as an additional
  signal source for triangulating location/org issues, opt-in and
  safety-preserving.

## 8. Doctor line — P0 (organizational priority)

- **DR-1** Per doctor: self-baseline + clinical director's observed baseline
  over the same competency set, compared to seed the coaching agenda.
- **DR-2** Recurring coaching sessions: prep (both sides), selected focus
  items, meeting record with agreed experiments/actions, doctor confirmation,
  and follow-up sessions that resurface prior actions' status. Cadence is
  regular and per-director (Dr. Alex and Dr. Casey, in their respective
  states).
- **DR-3** The doctor experience is a peer-coaching track, not the weekly loop;
  it shares the content spine and (P2, once volume exists) contributes signals
  to §7 (e.g. doctor-observed RDA issues routing to the RDA director).

## 9. People, permissions & lifecycle — P0

- **PP-1** Permission model = **archetype + scope**: Participant, Lead, Office
  Manager, Functional Director/Regional, Evaluator, Clinical Director, Doctor,
  Org Admin, Platform Owner. An admin assigns a person an archetype and a scope
  (locations/org) in one step; fine-grained toggles exist only as advanced
  overrides. Someone can hold two hats (participant + evaluator) without the
  system inventing a third concept.
- **PP-2** What each archetype sees is exactly its job (§2): participants see
  the loop; leads/OMs add their location; directors add their line across
  locations; org admins add org management; platform owner adds cross-org. No
  archetype ever sees another org's data (see MT-2).
- **PP-3** Staff lifecycle: hire → invited/provisioned (ideally triggered by
  the workforce system the org already uses, so nobody shows up to a meeting
  unprovisioned) → participating from their first full week → pause/leave
  states → offboarding with an HR-retention export before deletion
  (GDPR-compatible).

## 10. Multi-tenancy & org onboarding — P0 isolation, P1 polish

- **MT-1** An organization is the hard isolation boundary: content visibility,
  people, scores, evals, branding, deadlines, and any AI processing are
  org-scoped. Practice type (pediatric/general) filters the effective library.
- **MT-2** Isolation is verifiable: it must be possible to demonstrate (test,
  not trust) that no surface leaks org A's options, names, or data into org
  B's view — including for multi-hat users, and *excluding* the platform
  owner's deliberately cross-org view, which must be visibly labeled as such
  so cross-org sightings aren't mistaken for leaks.
- **MT-3 (P1)** Org onboarding is a guided, explanatory walkthrough an org
  admin can complete alone: org profile + branding (logo, color — reliably
  saved), locations + deadlines, roles + display-name overrides (UK
  terminology), staff import/invites, effective library review, first-week
  dry run. Polish matters here: this flow is a credibility statement.
- **MT-4** Tenancy ambition is bounded: serve the sister org(s) well; no
  self-serve SaaS machinery beyond what MT-3 needs.

## 11. Measurement — P1

- **ME-1** A small owner-facing health view computed from existing exhaust:
  loop integrity (check-in vs check-out completion, lateness) per location/
  role; cascade coverage (which lines/locations have an active calibrated
  lead); calibration health (raters per line, drift, observed-vs-practiced
  gap); eval closure funnel (released → acknowledged → focus-selected);
  signal responsiveness once §7 ships (raised vs addressed, time-to-response);
  quarter-over-quarter movement on chosen focus areas. Adoption is measured
  over activity; hard clinical/PMS data is explicitly out of scope until real.

## 12. Cross-cutting constraints

- **XC-1** Phone-first for participants; projector-friendly for facilitation.
- **XC-2** UK-ready: location timezones drive all deadlines; org-specific role
  labels; GDPR retention/erasure via PP-3.
- **XC-3** Psychological safety is a design invariant: honest low scores must
  never route to anything that feels evaluative or punitive (§7, EV-4 tone).
- **XC-4** Change management: any change to an existing habit ships with a
  short "how it used to work → how it works now" note, and new asks roll out
  one line at a time, piggybacked on existing habits.
- **XC-5** Warm, plain product voice (Alcan brand); no jargon on staff-facing
  surfaces; "sequencer/curriculum/capability" style words stay internal.

---

## 13. Open items for the design conversation

1. **Intervention scaffold (§7):** which intervention types to pilot first on
   the RDA line, and what the lead's weekly queue actually contains.
2. **Eval closure experience (EV-4):** the staff-side receive → acknowledge →
   focus flow, and what the async back-and-forth looks like.
3. **Org-level synthesis (SR-1 org tier):** deliberately under-defined; revisit
   after the location tier produces data.
4. **OM leadership curriculum (CS-5):** content work with Raul/Wes precedes any
   OM-as-catcher rollout.
5. **Roaming staff (wrinkle, no decision yet):** some staff aren't anchored to a
   single location (e.g. Kids Tooth Team's Texas locations) — they float. The
   model currently assumes one primary location per person (deadlines, OM
   visibility, location rollups). Park until it hurts; note it wherever
   location-scoped requirements (WL-2, PP-2, SR-1) get implemented.
