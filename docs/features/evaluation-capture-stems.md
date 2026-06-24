# Per-Domain Capture Framing & Stems — Draft Working Set

*Date: 2026-06-24. Feeds [`evaluation-overhaul.md`](evaluation-overhaul.md) §2.1.*
*Owner to edit wording. Grounded in live Pro Move content for Front Desk (role_id 1) as the worked
example; other roles follow the same synthesis method.*

---

## Design principles (owner-set, 2026-06-24)

1. **Two voices, split by purpose.**
   - **Domain summaries are third person** ("they" / "this team member"). They prompt the *evaluator*
     to recall what they observed: "In Cultural, they set how families feel…".
   - **Stems are second person** ("you"). They are the evaluator's actual words to the staff member,
     who will read them: "You consistently…", "One opportunity for you is…".
   - The summary sets the frame and jogs memory; the stems help write the feedback.
1b. **Stems should sound like effective coaching.** Glow stems name a specific behavior *and its
   impact* (situation–behavior–impact). Grow stems are forward-looking, specific, and supportive —
   an opportunity and a next step, not a verdict.
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

## Per-role domain summaries

Each domain block shows the **third-person summary** (the prompt to the evaluator) and the
**competencies** it spans (the readable Pro Moves sit under each in the UI). The you-voice starter
stems are shared across all roles and listed once at the end. Active staff roles are Front Desk,
Dental Assistant, and Office Manager; Doctor is the separate doctor track.

## Front Desk (role_id 1)

### Clinical
> **Summary (prompt):** "In Clinical, they are the front desk's bridge to the clinical team. They
> keep patients moving, alerting the back the moment someone is ready and flagging anyone waiting more
> than ten minutes; they hand off clean information; they adapt the schedule when emergencies or
> delays hit; and they know common procedures well enough to speak to them with confidence."

Competencies: Patient Flow Coordination · Clinical Team Communication · Daily Schedule Adaptability ·
Fundamental Dental Knowledge.

### Clerical
> **Summary (prompt):** "In Clerical, they run the front-desk machinery. They balance phones, texts,
> and the guest in front of them without dropping any of them; they keep records and paperwork
> accurate before check-in; they work the schedule days ahead to confirm visits and fill open slots;
> and they keep the front area clean, stocked, and welcoming."

Competencies: Communication Balancing · Patient Record Maintenance · Strategic Scheduling ·
Welcoming Environment.

### Cultural
> **Summary (prompt):** "In Cultural, they set how families feel. They greet every patient and
> guardian warmly and by their preferred name, build trust by asking about their goals, deliver hard
> policy and balance conversations with both kindness and firmness, and stay calm and accountable
> when they receive critical feedback."

Competencies: Welcoming Presence · Trust Building Interactions · Empathetic Practice Policy
Education · Handling Critical Feedback.

### Case Acceptance
> **Summary (prompt):** "In Case Acceptance, they help families say yes to care. They explain
> treatment and finances clearly, using estimated benefits and patient portion rather than covered or
> not; they build the doctor's and the practice's credibility; they handle objections about cost or
> x-rays with confidence instead of pressure; and they smooth the path through portal and paperwork."

Competencies: Treatment Communication · Establishing Credibility · Effective Objection Handling ·
Facilitating Smooth Processes.

## Dental Assistant (role_id 2)

### Clinical
> **Summary (prompt):** "In Clinical, they are the doctor's hands chairside. They chart accurately as
> the doctor calls findings, anticipate the next instrument before it is asked for, run tell-show-do
> and watch closely for a patient's comfort and anxiety, present the patient cleanly when the doctor
> enters, and keep the room sterile and reset between patients."

Competencies: Accurate Charting · Mastery of Dental Procedures · Patient Comfort and Communication
During Procedures · Sterilization and Procedure Preparation.

### Clerical
> **Summary (prompt):** "In Clerical, they keep the chair on schedule and the record clean. They
> confirm consent forms and the authorized adult before starting, move patient status in real time,
> resequence chairs and flag the Lead RDA when running behind, verify medical history, draft clinical
> notes before the patient leaves, schedule recare while the patient is in-chair, and stay on top of
> Uptime tasks and disposables."

Competencies: Clerical Procedure Requirements · Coordinating Patient Flow · Office Task Management ·
Patient Record Management.

### Cultural
> **Summary (prompt):** "In Cultural, they make the chair feel safe. They greet the patient by name
> with eye contact, read the parent's and patient's mood, offer comfort like a blanket or headset,
> give the patient a hand-raise to pause, ask a curious open-ended question, reinforce attendance
> kindly, and stay calm and resolution-focused when a parent is frustrated."

Competencies: Trust Building Interactions · Demonstrating Emotional Intelligence · Empathetic
Practice Policy Education · Handling Constructive Feedback.

### Case Acceptance
> **Summary (prompt):** "In Case Acceptance, they help families understand and accept care. After the
> doctor leaves the chair they check for comprehension and ask how the plan sounds, identify the real
> concern behind a hesitation (comfort, time, or cost), link treatment to the parent's goals for
> their child, preview the doctor and OVERJET to build credibility, use estimated-benefits language,
> and make sure the next visit is scheduled at the right interval."

Competencies: Clear Treatment Communication · Effective Objection Handling · Empowering Informed
Decisions · Establishing Credibility.

## Office Manager (role_id 3)

### Clinical
> **Summary (prompt):** "In Clinical, their role is oversight, not chairside. Each week they review
> clinical-equipment Uptime tasks with the Lead RDA, observe the RDA-to-doctor hand-off and document
> an opportunity to coach, and verify Pro Move meeting attendance, following up with anyone who
> missed."

Competencies: Compliance and Safety · Patient Care Standards · Team Training Oversight.

### Clerical
> **Summary (prompt):** "In Clerical, they run the operational engine. They review last week's KPIs
> every Monday and send the Regional Manager an action plan, work uncollected balances and claim
> flags daily, reconcile the production report, dig into the root cause of recurring flags and coach
> the fix at huddle, and make sure phones are answered in three rings and every visit inside 48 hours
> is confirmed."

Competencies: Operational Efficiency · Revenue Cycle Management · Root Cause Analysis · Schedule and
Flow.

### Cultural
> **Summary (prompt):** "In Cultural, they set the tone for the office. They walk the floor twice a
> day with specific encouragement, stay aware of the room's mood and reset it or address tension
> directly, personally follow up on any escalated parent concern by the end of the next day, and make
> sure the week's social content reaches marketing."

Competencies: Leading and Coaching · Emotional Intelligence · Trust Building · Community and
Marketing.

### Case Acceptance
> **Summary (prompt):** "In Case Acceptance, they own the financial conversation and model the
> standard. They use estimated-benefits and family-contribution language, respond to financial
> concerns with clear options like staging treatment or CareCredit, personally complete a full
> over-the-top check-in with at least one family a day so the team sees the bar, and submit
> preauthorization within 48 hours while reviewing approvals daily."

Competencies: Case Communication · Financial Coordination · Patient Experience · Treatment Plan
Follow-Up.

---

## Starter stems (you-voice, coaching-grade, all roles and domains)
*Glow names a behavior and its impact; Grow points forward to a specific next step.*

- **Glow capture:**
  - "You consistently [behavior], and it shows in [impact]…"
  - "One of your real strengths is the way you…"
  - "I noticed how you [specific moment] — families clearly felt…"
- **Grow capture:**
  - "You're already strong at …; the next level is to…"
  - "One opportunity this quarter: when …, try…"
  - "I'd love to see you …, especially when…"
  - "A small shift that would make a big difference: …"

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
