# Feature Spec (DRAFT) — Facilitator Presentation Tool

*Status: scoping. Owner input captured 2026-06-22. This is a working draft to react to — open
questions at the bottom. Related backlog item: NF4.*

## Purpose

A **full-screen, screen-share-friendly, visually appealing** page that a facilitator (primary
user: **Ariana**, the lead coach) pulls up to run the twice-weekly Pro Move meetings over Google
Meet. The goal is **clear presentation + a flexible, navigable viewport** through which the
facilitator surfaces the right content at the right moment — *not* a rigid slide deck. It replaces
the current Canva deck with a native, dynamic experience driven by live ProMoves data.

## Core principles

- **Fills the entire screen** and looks pleasant when screen-shared to staff.
- **Small, unobtrusive left nav** — navigation chrome stays tiny so content owns the viewport.
- **Non-linear / navigable** — the facilitator jumps between sections freely (it's
  facilitator-driven, not a linear wizard).
- **Dynamic** — pulls the actual Pro Moves of the week and their resources from live data.
- **Role-aware** — the facilitator selects which role the meeting is for: **DFI / RDA / OM**.
- **Facilitator-guided** — light "nudges" tell the facilitator what happens at each step (read
  aloud, discuss, role-play, rate, celebrate).
- **Viewer-friendly redesign** — existing in-app components/assets won't be reused as-is; this
  surface needs presentation-grade visuals.

## Meeting types

The facilitator picks **Check-In** or **Check-Out** (the meeting cadence is per-location, e.g.
Mon/Thu or Mon/Fri). The flow differs:

### Check-In meeting
1. **Question of the Day** — a light "get to know you" icebreaker (see below).
2. **Pro Moves review** — show this week's 3 Pro Moves for the selected role. Facilitator reads
   each aloud; group discusses; **role-play where appropriate** (nudge). If a Pro Move has
   **learning material/scripting**, the facilitator can pull it up in a viewer-friendly way.
3. **Rate confidence** — staff rate their confidence (see open Q on who submits).
4. **High fives, done** — simple close.

### Check-Out meeting
1. **Question of the Day** — same icebreaker mechanic.
2. **Glows & Grows** — what went well / what could've gone better for the week, framed with the
   **patient-journey** mental model (reflections tied to specific patient-journey elements).
3. **Celebrate** wins & growth opportunities.
4. **Submit performance scores.**
5. **Patient-Journey explorer** — a navigable graphic (see below) the facilitator clicks through,
   highlighting the elements most important for the role being coached.

## Question of the Day

- A pool of **~150–200** icebreaker questions.
- Facilitator **clicks through** until she finds one she likes / hasn't used.
- **Write-your-own** option.
- Source: either a **pre-loaded curated set** (a table) or **light AI generation** — *open Q.*
  (Recommendation: pre-load a curated set for speed/reliability during a live meeting, with an
  optional "generate more" button and write-your-own. Track "already used" so she can skip repeats.)

## Pro Moves display + learning material

- Pull the **week's Pro Moves for the selected role** from live data (the same weekly plan the
  participants get — *confirm source*).
- Render each large and legible for screen-share.
- If a Pro Move has resources (`pro_move_resources` — videos, scripts, docs), let the facilitator
  open them in a **presentation-friendly** viewer (not the participant component).

## Patient-Journey explorer (Check-Out)

Apply the **concept** of the patient journey (from the handoff doc — see
[reference/patient-journey-source.md](../reference/patient-journey-source.md)), **not** the
manager audit tool it described. The patient journey is the interplay of roles that together make
a visit excellent; each role owns different moments.

- A **clickable graphic** of the journey (the handoff doc models **5 stages**: Check-In →
  Transition to Chair → Chair → Chair-to-Checkout → Checkout), each stage owned by certain roles.
- The facilitator can **highlight the elements most relevant to the role** she's coaching, so
  Glows & Grows reflections tie to specific journey moments.
- This shares a content model with the future **learner-facing patient-journey module** (later) —
  so we should store the journey content in a way both can read.

## Data sources (current understanding)

- Week's Pro Moves for a role → `weekly_plan` / `weekly_assignments` (confirm during build).
- Pro Move resources → `pro_move_resources`.
- Confidence/performance submission → existing `weekly_scores` flow (open Q on who submits).
- Question-of-the-Day pool → **new** table (or AI). 
- Patient-journey content → **new** structure (seed from the handoff doc; clinical director refines).

## Open questions (for owner)

1. **Question of the Day:** pre-loaded curated set, AI-generated, or both? Any categories/tags?
2. **Pro Moves source:** confirm the week's 3 Pro Moves per role come from the same weekly plan
   participants see, at the facilitator's location. Same 3 for everyone in the role, right?
3. **Who submits scores during the meeting?** Do staff rate confidence/performance on *their own
   devices* (the presentation just prompts them), or does the facilitator collect/submit? This is
   the biggest scope fork for the feature.
4. **Patient-journey content:** do we have finalized journey content, or build the structure and
   let the clinical director fill it (seeding from the handoff doc as placeholder)?
5. **Access:** who can open the facilitator view — just coaches/facilitators? Any coach, or
   scoped to their location/role?
6. **Facilitator nudges:** how prescriptive? A short "what to do here" line per step, or richer
   guidance/scripts?
7. **Role coverage:** DFI, RDA, OM confirmed. Any others (Doctor) now or later?

## Explicitly out of scope (for now)

- The manager **patient-journey audit tool** (the handoff doc's main subject) — concept only.
- The **learner-facing patient-journey module** — later; shares the journey content model.
