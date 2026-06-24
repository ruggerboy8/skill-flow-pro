# Per-Domain Capture Stems — Draft Working Set

*Date: 2026-06-24. Feeds [`evaluation-overhaul.md`](evaluation-overhaul.md) §2.1 (open item #1).*
*Owner to edit the wording. This is a starting draft grounded in the live competency/Pro Move
content, not final copy.*

> **Design principle behind these:** each stem is explicitly labeled **Glow** (going well) or
> **Grow** (room to improve). That label travels with the evaluator's response into
> `map-observation-notes`, so the AI never has to *infer* whether a comment was praise or critique.
> It only has to slot the comment under the right competency. This is what makes the slotting
> reliable and what seeds the staff review's Highlights / Grow sections directly.
>
> The four domains are **behavioral**, not clinical-technique. The content is front-desk and
> guardian-facing (greeting, check-in, scheduling, objection handling). Stems prompt for **observable
> behavior the evaluator actually saw**, which is exactly what an evaluator who knows the person but
> not the framework can speak to.

---

## How the stems are used in the flow

1. The evaluator is on one domain (e.g. Clinical). The domain's competencies and Pro Move titles are
   visible beside the prompts (titles only, description on hover).
2. They answer the **Glow** prompt, then the **Grow** prompt, by voice or text. Optional starter
   stems sit in the input as ghost text to get them unstuck.
3. The response is slotted under the right competencies, and the Glow/Grow label is preserved.
4. They set the 1–4 scores for that domain's competencies, then move on (or jump to another domain).

Domain framings below are deliberately plain-language so they orient an evaluator without competency
fluency.

---

## Clinical

*Plain-language framing shown to the evaluator:* "How this person keeps patients moving smoothly and
keeps the clinical team in the loop. Think flow, communication with the back, and adapting when the
day changes." *(Real competencies here include Patient Flow Coordination, Clinical Team
Communication, Daily Schedule Adaptability.)*

- **Glow prompt:** "Where did you see this person keep the day running smoothly or keep the clinical
  team well-informed? Give a specific moment if you can."
  - Starter stems: "One thing they did really well was…" / "I noticed they were great at…"
- **Grow prompt:** "Where did flow or communication with the back break down, or where could they be
  more proactive?"
  - Starter stems: "I'd love to see them…" / "Next time, it would help if they…"

## Clerical

*Framing:* "How this person handles the front-desk machinery: records and paperwork, balancing
phones and in-person guests, and getting ahead of the schedule." *(Patient Record Maintenance,
Communication Balancing, Strategic Scheduling.)*

- **Glow prompt:** "Where were they on top of the details, accurate records, paperwork ready,
  schedule worked ahead, or smooth at juggling the desk and a guest at once?"
  - Starter stems: "They really stayed on top of…" / "I was impressed by how they…"
- **Grow prompt:** "Where did details slip, or where did they get stuck juggling competing demands at
  the desk?"
  - Starter stems: "It would help if they…" / "I'd like to see them tighten up…"

## Cultural

*Framing:* "How this person makes patients and guardians feel: the welcome, the warmth, building
trust, and handling policy conversations with both kindness and firmness." *(Welcoming Presence,
Trust Building Interactions, Empathetic Practice Policy Education.)*

- **Glow prompt:** "When did you see them make a patient or guardian feel genuinely welcome or build
  real trust? What did that look like?"
  - Starter stems: "They have a real gift for…" / "A guardian clearly felt…"
- **Grow prompt:** "Where could the warmth, the read on a family, or a hard policy conversation have
  gone better?"
  - Starter stems: "I'd love to help them with…" / "They could lean further into…"

## Case Acceptance

*Framing:* "How this person helps families say yes to care: explaining treatment clearly,
establishing the doctor's credibility, and handling objections without pressure." *(Treatment
Communication, Establishing Credibility, Effective Objection Handling.)*

- **Glow prompt:** "Where did they communicate treatment well, build the doctor up, or turn a
  hesitation into a yes? Give the moment if you can."
  - Starter stems: "They did a great job explaining…" / "When a parent pushed back, they…"
- **Grow prompt:** "Where did a treatment conversation fall flat, or an objection go unaddressed?"
  - Starter stems: "I'd like to see them get more comfortable with…" / "Next time, they could…"

---

## Notes for the owner to weigh in on

1. **Tone:** drafted in the warm, conversational Alcan voice. Adjust as needed.
2. **One Glow + one Grow per domain** is the default. We could add a second optional probe per domain
   ("anything else?") but two prompts keeps it light.
3. **Role-specific framing:** the framings above are written for the front-desk/guardian-facing
   content the live data shows. If a role (e.g. an assistant or hygienist) has materially different
   competencies under the same domain, the framing line may need a per-role variant. Flag if so.
4. **Optional skip:** an evaluator who genuinely did not observe a domain should be able to skip it
   cleanly (ties to the Phase 2 decision that not every domain needs a Glow and a Grow).

---

## What this unblocks

- **Workstream A** (`map-observation-notes` rework): the function's input contract is now clear. It
  receives, per domain, the staff role's competencies for that domain plus the evaluator's
  **Glow-labeled** and **Grow-labeled** responses, and returns per-competency `glow` / `grow` text.
  No timeline, no glow-vs-grow inference.
- **Workstream B** (capture UI): the per-domain screen content is specified (framing + two labeled
  prompts + starter stems + competency/Pro Move sidebar).
