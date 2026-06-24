# Per-Domain Capture Framing & Stems — Draft Working Set

*Date: 2026-06-24. Feeds [`evaluation-overhaul.md`](evaluation-overhaul.md) §2.1.*
*Owner to edit wording. Grounded in live Pro Move content for Front Desk (role_id 1) as the worked
example; other roles follow the same synthesis method.*

---

## Design principles (owner-set, 2026-06-24)

1. **Everything is in "you," addressed to the staff member.** The evaluator is writing feedback that
   the staff member will read, so framings and stems are second person: "You greet every family…",
   "You could grow by…".
2. **Prompts are domain *summaries*, not questions.** Instead of asking "Where did you see them
   welcome patients?", we show a short summary of what the domain means for this person's role, and
   let the evaluator respond to it.
3. **The Pro Moves themselves are the primary prompting resource.** They are concrete, observable,
   and already define "good." They must be **accessible and readable** beside the capture area, but
   presented so they **do not overwhelm** (grouped by competency, scannable, expandable).
4. **No skipping a domain.** The evaluator always enters something for every domain. Granular "didn't
   see it" lives at the **competency** level via an N/A / "Did not observe" rating, not by skipping
   the domain. **Default to rating more often than not.**
5. **Framing is per role.** Each (role, domain) summary is synthesized from *that role's* Pro Moves in
   *that domain*. The four domains mean different things for a Front Desk teammate than for a Dental
   Assistant.

---

## How the per-(role, domain) summary is produced

Synthesize a short you-voice summary from the role's Pro Moves in the domain. Generate once per
(role, domain), curate, and **store as config** (do not regenerate per evaluation). The Front Desk
examples below were synthesized by hand from the live Pro Moves as a model for the rest.

---

## Worked example — Front Desk (role_id 1)

Each domain shows: the **you-voice summary** (the prompt), the **competencies** it spans (the readable
Pro Moves sit under each in the UI), and **you-voice starter stems** for the Glow and Grow capture
areas.

### Clinical
> **Summary (prompt):** "In Clinical, you are the front desk's bridge to the clinical team. You keep
> patients moving, alerting the back the moment someone is ready and flagging anyone waiting more than
> ten minutes; you hand off clean information; you adapt the schedule when emergencies or delays hit;
> and you know common procedures well enough to speak to them with confidence."

Competencies: Patient Flow Coordination · Clinical Team Communication · Daily Schedule Adaptability ·
Fundamental Dental Knowledge.

### Clerical
> **Summary (prompt):** "In Clerical, you run the front-desk machinery. You balance phones, texts, and
> the guest in front of you without dropping any of them; you keep records and paperwork accurate
> before check-in; you work the schedule days ahead to confirm visits and fill open slots; and you
> keep the front area clean, stocked, and welcoming."

Competencies: Communication Balancing · Patient Record Maintenance · Strategic Scheduling ·
Welcoming Environment.

### Cultural
> **Summary (prompt):** "In Cultural, you set how families feel. You greet every patient and guardian
> warmly and by their preferred name, build trust by asking about their goals, deliver hard policy and
> balance conversations with both kindness and firmness, and stay calm and accountable when you
> receive critical feedback."

Competencies: Welcoming Presence · Trust Building Interactions · Empathetic Practice Policy
Education · Handling Critical Feedback.

### Case Acceptance
> **Summary (prompt):** "In Case Acceptance, you help families say yes to care. You explain treatment
> and finances clearly, using estimated benefits and patient portion rather than covered or not; you
> build the doctor's and the practice's credibility; you handle objections about cost or x-rays with
> confidence instead of pressure; and you smooth the path through portal and paperwork."

Competencies: Treatment Communication · Establishing Credibility · Effective Objection Handling ·
Facilitating Smooth Processes.

### Starter stems (you-voice, all domains)
- **Glow capture:** "You did a great job…" / "You consistently…" / "I noticed how well you…"
- **Grow capture:** "You could grow by…" / "I'd love to see you…" / "Next quarter, focus on…"

---

## Capture rules

- **Every domain gets a response.** The Glow and Grow areas are the input; the domain summary plus the
  Pro Moves prompt them.
- **N/A is per competency**, labeled "Did not observe." It is the only way to register "I didn't see
  this," and it lives on the individual competency rating, never on a whole domain.
- **Default to rating.** The UI should make rating the easy, expected path and N/A the deliberate
  exception, not the reverse.
- **Pro Moves are readable but contained:** grouped under their competency, scannable, expandable for
  the full statement, so they teach without burying the evaluator.

---

## Still for the owner

1. **Wording pass** on the four Front Desk summaries and the starter stems.
2. **Remaining roles:** synthesize Dental Assistant, Office Manager (and Lead Dental Assistant) the
   same way. Doctor is the separate doctor track. Empty placeholder roles (Hygienist, Treatment
   Coordinator) wait until they have Pro Moves.
3. **Generation vs hand-curation:** are you comfortable with an AI first-pass synthesis of each
   (role, domain) summary that you then edit, or do you want to author them directly?

---

## What this unblocks

- **Workstream A** (`slot-domain-feedback`, the new function built alongside the live
  `map-observation-notes`): per domain it receives the role's competencies, the readable Pro Moves,
  and the evaluator's Glow-labeled and Grow-labeled you-voice text, and returns per-competency
  Glow/Grow slotting. No glow-vs-grow inference, no timeline.
- **Workstream B** (capture UI): per-domain screen content is specified — you-voice summary, Pro
  Moves under each competency, two labeled capture areas with starter stems, per-competency rating
  with an explicit "Did not observe," and no domain-level skip.
