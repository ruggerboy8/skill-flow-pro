# Feature Spec — Facilitator Presentation Tool

*Status: building (feature #1). Owner decisions resolved 2026-06-22, refined after mockup v1.
Backlog: NF4. Target: usable by Ariana for her meetings later this week (first cut).*

## Purpose

A full-screen, screen-share-friendly, beautiful teaching surface that the facilitator (primary
user: Ariana, lead coach) uses to run the twice-weekly Pro Move meetings over Google Meet. It
replaces the Canva deck with a dynamic, flexible, non-linear page that pulls in live ProMoves data
at the right moment. North star: a highly polished, premium, pleasant-to-look-at surface that
makes facilitation effortless and looks great when screen-shared. The experience should feel
smooth and high-class as Ariana clicks through it.

## Meeting outcomes and philosophy (what the design serves)

The weekly loop only becomes social and coached in these meetings.

**Check-In (start of week), "understand it, believe it, be ready to do it":**
1. Connection (icebreaker, psychological safety).
2. Clarity: every person understands the week's pro moves for their role.
3. Readiness: practice via role-play so it is concrete.
4. Self-awareness: each person rates confidence (sets the week's baseline).
5. Energy: leave motivated to practice.

**Check-Out (end of week), "reflect, celebrate, connect to the bigger why":**
1. Connection (icebreaker).
2. Reflection: glows and grows, anchored to the patient journey.
3. Celebration: name wins and growth.
4. Honest self-assessment: each rates performance (closes the confidence-to-performance loop).
5. Meaning: connect behaviors to the patient journey (why the pro moves exist).

## Layout and navigation (refined)

- **Meeting type and role are small dropdowns at the top** (Check-in vs Check-out; DFI / RDA / OM).
- **The left nav is only the steps of the meeting** (the journey through the meeting). Ariana moves
  through them one at a time. Nothing else lives in the left rail.
- Content fills the rest of the screen, large and legible for screen-share.
- Presentation-grade visuals, purpose-built (not the participant components reused). Calm, spacious,
  premium feel.

## Flows

### Check-In (left-nav steps)
1. **Question of the Day** (icebreaker).
2. **Pro Moves** for the selected role, shown **one at a time as a carousel** (Ariana has the team
   go through them one by one): read aloud, discuss, role-play where it helps. Open the scripting /
   learning material for a move when it has it.
3. **Confidence**: cue the team to rate confidence in the app on their own phones. The screen shows
   the rating scale as a teaching reference. The surface does not collect scores.
4. High fives, done.

### Check-Out (left-nav steps)
1. **Question of the Day** (icebreaker).
2. **Glows** (what went well). The **patient journey lives here** as the anchor we ask about.
   Ariana can pull up the journey and surface specific stages or moments to add flavor while the
   team shares wins (drill into a stage for its description and that role's pro moves).
3. **Grows** (what to make smoother next week).
4. **Performance**: cue the team to submit performance in the app. The screen shows the rating scale.

> Language we use: check-ins submit **confidence**; check-outs submit **performance**. The
> presentation never reads or writes scores. Staff submit on their own phones; the surface displays
> content and prompts only.

### Rating scale (existing app definitions, shown on the confidence / performance steps)
Reuse verbatim from `NumberScale.tsx`:
- **4**: "I am a master and do it all the time."
- **3**: "I do this 95% of the time."
- **2**: "I have some room for improvement here."
- **1**: "I rarely do this or didn't know I should have been doing it."

## Question of the Day  (resolved)

- A pre-loaded curated set of about 150 to 200 icebreakers (we seed a table). No AI generation.
- Click through the set; track "already used" so repeats can be skipped.
- Write-your-own for when nothing fits.

## Pro Moves display and learning material

- Pull the week's pro moves for the selected role from the live weekly plan
  (`weekly_plan` / `weekly_assignments`, confirm exact source in build), for Ariana's location.
- Show **one at a time (carousel)** with prev/next and a "x of n" indicator.
- If a move has resources (`pro_move_resources`: scripts, videos, docs), open them in a
  presentation-friendly viewer.

## Patient journey (lives inside the Check-Out "Glows" step)

Apply the concept of the patient journey (5 stages, see
[reference/patient-journey-source.md](../reference/patient-journey-source.md)); ignore the manager
audit tool it described. The journey is the interplay of roles that together make a visit
excellent. It is not a separate nav item. It sits inside Glows as the anchor: Ariana pulls it up
to remind the team what we are reflecting on, and surfaces relevant moments.

Drill 1 to 2 levels deep:
- Level 0: the 5 stages (clickable graphic).
- Level 1: a stage's description (what happens there).
- Level 2: that stage's pro moves, filtered to the role being facilitated.

**Data approach (conservative tagging):** add a nullable `journey_stage` tag to pro moves so the
explorer can pull "stage + role." **Not every pro move maps to a stage.** Some are general best
practices (e.g. reviewing uptime tasks) with no journey stage. Do not force a mapping; leave those
untagged. Seed the stages and starting content from the handoff doc; the clinical director refines.

## Access and nudges  (sensible defaults)

- Access: facilitators / coaches (default any coach; can scope later).
- Nudges: a short one-line "what to do here" cue per step for v1.
- Roles: DFI / RDA / OM for v1 (Doctor later).

## Out of scope (for now)

- Collecting or submitting scores from the presentation (staff use their phones).
- The manager patient-journey audit tool (concept only).
- The learner-facing patient-journey module (later; shares the journey content model).
