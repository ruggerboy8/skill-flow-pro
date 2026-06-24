# Feature Spec — Staff Delivery (Phase 2, EX4)

*Status: planning. Date: 2026-06-24.*
*Inputs: a UX first-principles + audit pass (design-ux-researcher) and a behavioral persona
walkthrough (design-persona-walkthrough, Fogg / Cialdini / LIFT / peak-end). The two converged
independently; this doc is their synthesis. Source surfaces:
[`src/pages/EvaluationReview.tsx`](../../src/pages/EvaluationReview.tsx),
[`src/lib/reviewPayload.ts`](../../src/lib/reviewPayload.ts),
[`src/components/review/CompetencyCard.tsx`](../../src/components/review/CompetencyCard.tsx).*

> Plan, not a build. The current staff review wizard has good bones; this is about sequencing,
> surfacing the new Glow/Grow data, and closing the loop to the weekly cadence. Conservative
> migration applies: ship a versioned `review_payload` v3 alongside v2 and rework the UI on top.

---

## 1. First principles: what staff delivery is for

A quarterly evaluation is opened maybe four times a year. It is the rare, high-stakes moment where
someone in authority tells a staff member, in detail, how they are doing. It either fuels the next
quarter of weekly check-ins or damages the trust the weekly loop runs on. Five jobs:

1. **Feel seen and valued.** Finish believing a real person watched their real work and noticed
   specific things. Enemy: genericness. The per-competency Glow/Grow text the capture flow now
   stores is the raw material, and it is the asset the current delivery most under-uses.
2. **Understand where I stand, without it stinging.** Honest read across the four domains, framed as
   orientation not verdict. Scores stay 1-4; the design job is framing.
3. **Know what to work on next.** Output is a small, *owned* set of focus Pro Moves. Ownership
   predicts follow-through, so it must feel like their choice, not an assignment.
4. **Be motivated to keep going.** End on energy, not relief that it is over.
5. **Connect to the weekly loop.** The Pro Moves chosen here should visibly become what they check
   in and out against. This is the quarterly→weekly baton pass, and it is the most strategically
   important job and the one the current flow handles worst.

**Target emotional arc:** curiosity → feeling seen → honest-but-safe self-awareness → ownership of a
plan → momentum. Failure modes: anxiety at the front, ceremony-with-no-follow-through at the back.

---

## 2. The ideal flow (peak-first, work-second, warm-last)

The single governing insight (peak-end rule + anxious-skimmer persona): a staff member decides
"threat or gift" in the first screen, and reads everything after through that lens. So lead with
warmth and safety, contextualize every number with a story, and end on celebration plus a plan.

1. **Notification / entry.** "Your Q2 review from [Coach] is ready." Warm, low-pressure, time
   estimate. (Release is a separate admin step, already upstream.)
2. **Welcome.** Affirmation and safety first, not a 7-step agenda. "This is yours, it's private to
   you and your coach, about 5 minutes."
3. **The coach's note.** The human voice before any number. This is the natural opening peak.
4. **Domain-by-domain walkthrough (the heart).** For each of the four domains: a short orientation,
   the per-competency **Glow** (behavior + impact) and **Grow** (next step) in the coach's you-voice,
   the 1-4 score shown *beside* the warm text (never naked), and "Did not observe" rendered as a
   neutral, time-bounded state ("didn't come up this round, not a gap").
5. **Highlights / synthesis.** Pull up to the big picture, strengths first, growth as opportunity.
6. **Keep crushing.** Pick one strength to keep (affirming, ownership).
7. **Grow.** Choose growth competencies (1-2, not a hard "exactly 2"), with the coach's Grow text as
   context.
8. **Pro Moves.** Pick 1-3 concrete Pro Moves from the chosen growth areas; state explicitly that
   these appear in the weekly check-ins.
9. **Note to self + commit.**
10. **Closing handoff (mostly missing today).** Celebrate, recap the commitments in their own words,
    and connect forward: "Starting [next check-in], you'll see these in your weekly check-in."

---

## 3. Audit of the current wizard

**Good bones (keep):** the 8-step structure and warm copy; coach note leads before scores; progress
persistence (sessionStorage); idempotent/safe entry (ownership + submitted + release gates, view
stamped once); ownership-driven selection with caps; note-to-self with AI polish; `CompetencyCard`
as a reusable primitive.

**Gaps (change), in impact order:**

| # | Finding | Evidence |
|---|---|---|
| A | **Per-competency Glow/Grow is not used.** `ReviewPayloadItem` carries only `observer_note`/`self_note`; the card shows one "View Coach Notes" toggle. The richest "feel seen" asset is invisible. | `reviewPayload.ts:7-18`; `CompetencyCard.tsx:62-77` |
| B | **"Full Evaluation" is an off-ramp.** Step 2 navigates away to a raw score grid and asks the user to use the browser back button. Highest backfire/shutdown point for an anxious user. | `EvaluationReview.tsx:368, :372-380` |
| C | **No weekly-loop handoff at the end.** Save → toast → route to `/`. The quarterly→weekly baton pass does not exist. | `handleSave` `:173-197` |
| D | **"Did not observe"/N/A absent from delivery** and reads as negative on a bare grid. Owner ruled N/A is legitimate coverage. | payload has no N/A field; overhaul §3.1 |
| E | **Sparse gate contradicts a locked decision.** Below 4 scored competencies the view degrades; owner said drop the count-of-4 gate. | `:393-408`; server `v_sparse := v_scored_count < 4` |
| F | **Synthesis is global top/bottom, not per-domain**, so the owner's "Glow and Grow per domain" preference is not honored. | `:388-459` |
| G | Behavioral copy issues: the "no coach note" empty state says "your scores will tell the story" (a threat sentence); Gap math (`Gap: -1`) reintroduces judgment; a 2-strengths-vs-3-growth asymmetry reads as "more wrong than right"; the hard "exactly 2 growth" gate can feel coercive. | `:325-328, :416-436, :159-171` |
| H | Cleanups: hardcoded `text-amber-500`/`text-blue-500`/`text-green-600` should use tokens; growth competencies with no Pro Moves silently vanish. | `:416, :436, :221, :655` |

---

## 4. Prioritized plan

The structural fixes are gated on a **`review_payload` v3 bump** carrying per-competency
Glow/Grow, per-domain structure, and N/A. The client already version-gates the parser
(`reviewPayload.ts:38-59`), so ship v3 computation alongside v2 (conservative migration), update the
parser, then rework the UI.

- **P0 — Surface Glow/Grow throughout.** Extend `ReviewPayloadItem` + `compute_and_store_review_payload`
  (the RPC, server-side migration) to carry `observer_glow`/`observer_grow`; render distinct Glow and
  Grow sections in `CompetencyCard`. The core "feel seen" lever; unlocks the rest.
- **P1 — Re-sequence to peak-first/warm-last + add the closing recap (§2).** Highest experiential
  lever per both agents. Coach note early; strengths before growth; end on celebration + recapped
  commitments. Mostly copy/ordering on existing steps plus one new closing step.
- **P2 — Replace the "View Full Evaluation" off-ramp with an in-wizard per-domain walkthrough.**
  Removes the worst shutdown point; makes the richest content first-class.
- **P3 — Weekly-loop handoff.** Closing screen + Home surface connecting chosen focus Pro Moves to
  the next weekly check-in. Data (`staff_quarter_focus`) is already written; high strategic value,
  low effort.
- **P4 — First-class neutral N/A** ("didn't come up this round, not a gap") in card + walkthrough.
- **P5 — Drop the sparse gate** (UI branch + server `v_sparse`); always render the warm, complete view.
- **P6 — Behavioral copy + cleanups:** rewrite the "no note" empty state; expand coach notes by
  default in highlights; de-emphasize Gap; rebalance/ reframe the strengths-vs-growth ratio; allow
  1-2 growth; tokenize colors; graceful empty states.

---

## 5. Open decisions for the owner

1. **Scope of the rework:** incremental on the existing wizard (re-sequence + v3 payload + new
   closing step), or a fuller rebuild of the review surface? Recommendation: incremental; the bones
   are good and the payload-version approach lets us layer safely.
2. **Weekly-loop handoff surface:** what exactly should the staff member see on Home / in the next
   check-in that ties back to the eval? Needs a small design decision about the Home and check-in
   surfaces (outside this wizard).
3. **Gap display:** keep the coach-vs-self gap visible at all, or retire it from the staff view?
4. **Sequencing vs the capture work:** Phase 2 depends on real evals existing from the new capture
   flow. Reasonable to start the additive P0 payload work now and do the UI rework after teammates
   validate capture.
