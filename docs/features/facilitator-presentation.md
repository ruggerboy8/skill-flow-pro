# Feature Spec — Facilitator Presentation Tool

*Status: **building** (feature #1). Owner decisions resolved 2026-06-22. Backlog: NF4.
Target: usable by Ariana for her meetings later this week (first cut).*

## Purpose

A **full-screen, screen-share-friendly, beautiful** teaching surface that the facilitator
(primary user: **Ariana**, lead coach) uses to run the twice-weekly Pro Move meetings over Google
Meet. It replaces the Canva deck with a **dynamic, flexible, non-linear** page that pulls in live
ProMoves data at the right moment. The north star: a **highly polished, responsive, pleasant-to-
look-at** surface that makes Ariana's facilitation effortless and looks great when screen-shared.

## Meeting outcomes & philosophy (what the design must serve)

The weekly loop only becomes *social and coached* in these meetings. The surface should optimize
for these outcomes:

**Check-In (start of week) — "understand it, believe it, be ready to do it":**
1. **Connection** — open with a human moment (icebreaker) to build psychological safety.
2. **Clarity** — every person clearly understands the week's 3 Pro Moves for their role (what
   excellent looks/sounds like).
3. **Readiness** — practice via role-play so it's concrete, not abstract.
4. **Self-awareness** — each person rates their **confidence** (sets the baseline for the week).
5. **Energy** — leave motivated to actually practice.

**Check-Out (end of week) — "reflect, celebrate, connect to the bigger why":**
1. **Connection** — icebreaker again.
2. **Reflection** — Glows & Grows tied to real **patient-journey** moments (turn experience into
   learning).
3. **Celebration** — name wins and growth; reinforce a positive culture.
4. **Honest self-assessment** — each rates their **performance** (closes the confidence→performance loop).
5. **Meaning** — connect individual behaviors to the patient journey (the *why* the Pro Moves exist).

Design implication: this is a **teaching instrument**, not a form. Big, legible, calm visuals;
fast navigation; the facilitator stays in flow and the screen carries the room.

## Core principles

- **Fills the screen**, looks great screen-shared. **Tiny left nav**; content owns the viewport.
- **Non-linear** — facilitator jumps between sections freely (facilitator-driven, not a wizard).
- **Role-aware** — facilitator selects the role the meeting is for: **DFI / RDA / OM**.
- **Dynamic** — pulls the actual week's Pro Moves + resources from live data.
- **Light facilitator nudges** — a short "what happens here" cue per step.
- **Presentation-grade visuals** — purpose-built, not the participant components reused.

## Flows

### Check-In
1. **Question of the Day** — icebreaker.
2. **Pro Moves review** — the week's 3 Pro Moves for the selected role, shown large. Read aloud →
   discuss → **role-play where appropriate** (nudge). Open **learning material/scripting** if present.
3. **Confidence prompt** — *cue staff to rate confidence on their own phones in the app.* The
   presentation does **not** collect scores — it prompts; staff submit individually.
4. **High fives, done.**

### Check-Out
1. **Question of the Day** — icebreaker.
2. **Glows & Grows** — what went well / what to improve, framed by the **patient journey**.
3. **Celebrate** wins & growth.
4. **Performance prompt** — *cue staff to submit performance scores on their own phones.* (Prompt only.)
5. **Patient-Journey explorer** — the navigable teaching graphic (below).

> **Scope simplifier (resolved):** the presentation **never reads or writes scores**. Staff submit
> on their own devices; the surface only displays content and prompts. This keeps it a clean
> presentation/teaching layer over existing data.

## Question of the Day  *(resolved)*

- A **pre-loaded curated set of ~150–200** icebreaker questions (we'll source/scrape a good set
  and seed a table). **No AI generation.**
- Facilitator **clicks through** the set (and we track "already used" so she can skip repeats).
- **Write-your-own** for the moment when nothing in the set fits.

## Pro Moves display + learning material

- Pull the **week's Pro Moves for the selected role** from the live weekly plan
  (`weekly_plan` / `weekly_assignments` — confirm exact source during build), for Ariana's location.
- Render large and legible for screen-share.
- If a Pro Move has resources (`pro_move_resources` — scripts, videos, docs), open them in a
  **presentation-friendly** viewer.

## Patient-Journey explorer  *(resolved approach)*

Apply the **concept** of the patient journey (5 stages — see
[reference/patient-journey-source.md](../reference/patient-journey-source.md)); ignore the manager
audit tool it described. The journey is the **interplay of roles** that together make a visit
excellent; each role owns different moments.

**Stages are set; content is mostly there but not fully finalized.** Build the interface now; let
the clinical director refine content over time. Interaction = **drill 1–2 levels deep**:

- **Level 0 — the journey** — a clickable graphic of the 5 stages.
- **Level 1 — a stage** — the description of what happens in that segment of the journey.
- **Level 2 — a stage, for this role** — the **prompts / Pro Moves associated with that stage,
  filtered to the staff category Ariana is facilitating for** (DFI / RDA / OM).

**Data approach:** **tag Pro Moves (and/or prompts) in the database with their associated
patient-journey stage**, so the explorer can pull "stage X + role Y" easily. (A `journey_stage`
tag on `pro_moves`, or a join table — decide in build.) Shares a content model with the future
learner-facing patient-journey module.

## Access & nudges  *(minor opens — sensible defaults)*

- **Access:** facilitators/coaches (default: any coach; can scope later). Confirm if it should be
  limited to specific people for v1.
- **Nudges:** short one-line "what to do here" cues per step (not full scripts) for v1.
- **Roles:** DFI / RDA / OM for v1 (Doctor later).

## Out of scope (for now)

- Collecting/submitting scores from the presentation (staff use their phones).
- The manager patient-journey **audit tool** (concept only).
- The learner-facing patient-journey module (later; shares the journey content model).
