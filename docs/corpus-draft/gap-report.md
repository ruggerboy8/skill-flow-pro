> **DRAFT - AI-generated 2026-08-20 from the Pro Moves framework. Not canon. Requires review by John before entering the Ask corpus.**

# Master Gap Report

This is the merged list of every knowledge gap found while drafting the 62 corpus chapters and pressure-testing the structure with 199 persona questions. Chapters carry about 480 inline gap markers; merged and deduplicated they come down to the roughly 40 asks below, grouped by the expert who owns the answer and ordered by how much each one unblocks.

Each gap has three parts: what is missing, why it matters (which chapters and questions it blocks), and a ready-to-send capture prompt. Every prompt is scoped to about 10 minutes of talking. A voice memo or a hallway conversation with notes is enough; the corpus drafting can do the formatting.

How to read the "Unblocks" lines: chapter IDs reference `corpus-index.md`; question counts come from the four banks in `questions/` (new dental assistant, veteran DFI, office manager, associate doctor).

---

## 1. Ariyana (Dental Assistant + Lead Dental Assistant content)

### A1. The clinical checklists pack: room reset, tray setups, instruments

**Missing:** The actual room reset checklist, the per-procedure tray setup guides (including the standard "likely alternatives" per procedure), an instrument identification guide, per-procedure assisting sequences, and sterilizer operating steps for the real equipment. The framework repeatedly references these documents (moves 56, 102) but none of their content is in the export.

**Why it matters:** These are the first things a new assistant asks in week one. Blocks the heart of CLIN-17 and CLIN-18, plus RSVD-3, and 5 questions in the new-DA bank (tray setup, room-ready checklist, sterilizer, instrument cheat sheet, x-ray usability) and the office manager's sterilizer-failure question.

**Capture prompt:** "Hey Ariyana, give us 10 minutes on what a room has to look like before the next patient. Walk me through the reset checklist item by item, then pick two common procedures and talk through the tray: what always goes on it and what you stage 'just in case.' If the visual guides already exist as photos or laminates, snap pictures and send them; that alone closes most of this gap."

### A2. Charting the Alcan way: conventions, walkthrough, and fixing mistakes

**Missing:** Alcan's charting conventions (abbreviations, condition codes, odontogram practices, note templates), a step-by-step charting walkthrough in the actual software, the clinical note draft template and the draft-to-signed workflow, which procedures require an intraoral photo, height and weight entry specifics, and above all the correction workflow when a charting error is found after the visit.

**Why it matters:** Blocks CLIN-19 and CLER-23, two new-DA questions ("what do I type during the exam," "I charted something wrong, now what"), and the associate doctor's record-amendment question. The correction workflow is the scariest hole: everyone eventually mis-charts, and nothing tells them what to do next.

**Capture prompt:** "Hey Ariyana, 10 minutes on charting. Pretend I'm a brand-new assistant: what abbreviations and codes do we actually use, what does a good note draft contain, and, most important, walk me through the last time someone found a charting mistake after the family left. Who fixed it, how, and where did that get recorded?"

### A3. Where the RDA's lane ends: escalation and boundary lines

**Missing:** The line between what an RDA reassures on versus what must go to the doctor, what goes to the doctor versus the office manager, how to handle a complaint aimed at the doctor, de-escalation when the child is in the room, approved risk-of-delay language and its limits, the boundary between RDA plan explanation and doctor-only explanation, and what a good handoff to the treatment coordinator contains.

**Why it matters:** This one theme blocks five chapters (CULT-26, CULT-28, CASE-29, CASE-30, CASE-32). The framework teaches the conversational moves beautifully but never says where they stop.

**Capture prompt:** "Hey Ariyana, 10 minutes on lanes. Give me three real examples each of: something an RDA should just handle chairside, something that always goes quietly to the doctor, and something that goes to the office manager. Then tell me what you'd say if a parent complained to you about the doctor, and how far an RDA can go describing the risks of delaying treatment before it becomes the doctor's conversation."

### A4. The video library and comfort setup

**Missing:** The list of Parent Pre-Treatment videos, which video matches which procedure, where they are played from, and the real operatory entertainment setup (headsets, screens, streaming, any content guidance).

**Why it matters:** Playing the correct video is a scored pro move (127) but nothing says which videos exist. Blocks parts of CLIN-20 and CULT-27, one new-DA question, and one associate-doctor question.

**Capture prompt:** "Hey Ariyana, 10 minutes in an operatory with your phone. List the pre-treatment videos we have, say which procedure each one goes with and where you pull it up, then show the comfort setup: headsets, what kids can watch, anything off-limits."

### A5. Aftercare instructions per procedure (with Dr. Alex)

**Missing:** The approved post-op instructions beyond the two sourced scripts (filling, extraction): crowns, pulpotomy, sedation visits, SDF, sealants, plus any printed handouts. The framework references an "Aftercare Script" that is not in the export.

**Why it matters:** Blocks CLIN-20 and CASE-14 (the front desk is also expected to give aftercare from memory, move 49), plus a new-DA question. This content serves three roles at once.

**Capture prompt:** "Hey Ariyana, could you and Dr. Alex give us 10 minutes on aftercare? For each common procedure, say out loud exactly what you tell the parent: numbness, eating, what to watch for, when to call. If printed handouts exist, photos of them are perfect."

### A6. Consent and authorization mechanics

**Missing:** The procedure-to-consent-form matrix as it lives in the software, what actually happens when the accompanying adult is not on the Authorized Individual Form (who to involve, whether the visit proceeds), and how families add or change authorized individuals.

**Why it matters:** Blocks CLER-24 and parts of CLER-5, one new-DA question (grandparent at the visit), one veteran-DFI question (stepdad not on the list), and one associate-doctor question. Note: Dr. Alex already gave the special-consent procedure list in the framework (see CLER-406); this ask is the workflow side.

**Capture prompt:** "Hey Ariyana, 10 minutes on forms and authorized adults. Where do the consent forms live in the software and how do you match form to procedure? Then tell me the real story of a time the adult at the visit was not on the authorized list: who did you call, and did the appointment happen?"

### A7. The Lead Dental Assistant role, beyond one move

**Missing:** The fuller Lead DA role definition and duties (the framework holds exactly one Lead pro move), an observation rubric for the monthly chairside observations, whether and where observations are recorded, and expectations for Lead-to-RDA feedback conversations.

**Why it matters:** CLIN-554 is nearly empty without it, and CLIN-18's "how is mastery assessed" question leans on it. Also matters for the coaching cascade the management model depends on.

**Capture prompt:** "Hey Ariyana, 10 minutes on being a Lead. What does a Lead DA actually do in a week beyond assisting? When you observe someone during a procedure, what are you watching for, and where do you write it down? And how do you deliver a correction to someone you work beside all day?"

### A8. Smaller confirmations (batch these into any of the above sessions)

- X-ray quality criteria per image type and retake limits, with Dr. Alex (CLIN-18, one new-DA question).
- The complete patient status workflow so the RDA's two transitions sit in context, and the preferred doctor-flow channel per office (CLER-22).
- The RDA scope-of-practice breakdown by procedure and state rules (CLIN-18).
- Supplies: the high-turnover disposables checklist and the reorder workflow once something is flagged low; Uptime task contents for RDAs; where the Reschedule list lives (CLER-21, one new-DA question). Also: the training resources attached to move 63 are placeholder links (a YouTube music video and yahoo.com) and should be replaced or retired.
- Review-ask etiquette: what counts as an "extreme case" to skip the Google review ask, where the QR code lives, repeat-visitor expectations (CULT-25).
- Whether comfort offers (coffee, blanket, headset) apply at every visit type or only procedures (CULT-27).

---

## 2. Dr. Alex (Doctor content)

### D1. The NPO guidelines, stated once and canonically

**Missing:** The actual NPO rules: cutoff times, what counts as food or liquid, which appointment and sedation types they apply to, and the had-juice-this-morning decision. The framework references a Pre-Op Checklist whose content is not in the export; one sourced script says only "no food or drink after midnight."

**Why it matters:** This is the single most-referenced missing document in the corpus. The front desk reads NPO rules on every confirmation call (CULT-10, CASE-14), the doctor bank flags it (kid ate breakfast before sedation), the veteran DFI asks it, and CASE-412 needs it per modality. Blocks 4 chapters and at least 4 questions across 3 roles, and it is safety-critical.

**Capture prompt:** "Dr. Alex, 10 minutes on NPO. For each sedation type (nitrous, oral sedation, GA) and for regular treatment visits: what are the exact cutoffs, what counts as breaking them, and what does the front desk do when a parent says the child already had something this morning? We will turn it into the one card every role reads from."

### D2. Emergency and incident protocols

**Missing:** The medical emergency protocol (child faints, allergic reaction, who does what), the needlestick and exposure protocol with its reporting steps, and the mandated-reporter process for suspected neglect.

**Why it matters:** Fills RSVD-4, which is currently an empty shelf, and answers 6 urgent questions across three banks (2 new-DA, 2 office manager, 2 associate doctor). These are the questions where a wrong or missing answer does the most harm.

**Capture prompt:** "Dr. Alex, 10 minutes on the bad moments. Walk through what happens, step by step and by role, if a child faints in the chair. Then the needlestick drill: first five minutes, who gets told, what gets filed. Then the mandated-reporter path for suspected neglect: who does the doctor call, and does anyone else need to know? Tim can add the facility and incident-report side afterward."

### D3. The sedation safety pack

**Missing:** Confirmation that the AAPD dosing table quoted in the framework (move 205's resources) is current, plus the canonical chairside reference document; the sedation medication log's fields and location; the mid-appointment protocol when sedation is escalating or failing (stop criteria, documentation, retreatment planning); the GA delivery model (where GA happens, scheduling, wait times) and the standard GA risk conversation; the precise definition of "treatment time" for the 20 and 40 minute boundaries; and the full text of the parental separation policy.

**Why it matters:** Blocks parts of CLIN-404, CLER-405, CLER-406, CASE-412, and CULT-408, and two associate-doctor questions. The drafted CLIN-404 currently quotes mg/kg numbers from the framework with a "verify before use" warning; that warning needs to become a verified fact.

**Capture prompt:** "Dr. Alex, 10 minutes on sedation logistics. First, confirm the dosing table we captured is current and name the one reference document you want doctors using chairside. Then: what exactly goes in the med log and when, what is the actual play when a sedation is failing mid-appointment, and where does GA physically happen for us? Finish by saying the parental separation policy out loud the way you'd say it to a parent."

### D4. Consent, refusal, and parting ways

**Missing:** Where the special consent forms live and the pull-the-right-form workflow (the list of procedures needing them is already sourced); whether an informed refusal form or note template exists; the escalation path when a parent keeps refusing x-rays (document-and-proceed limits, refusal forms, declining to treat); and the process for transitioning a misaligned family out of the practice, including who approves it.

**Why it matters:** Blocks parts of CLER-406, CULT-410, and CLIN-403, plus two associate-doctor questions. The scripts for these conversations are already strong; what is missing is the paperwork and the authority chain behind them.

**Capture prompt:** "Dr. Alex, 10 minutes on saying no and being told no. When a parent declines x-rays or treatment, what physically gets documented and on what form? How many conversations before it becomes a standards-of-care boundary? And when a family truly is not a fit, what is the actual transition-out process and who signs off?"

### D5. Clinical standards fill-ins

**Missing:** The specific caries risk assessment tool and categories Alcan charts; the standard image set for a new patient by age and dentition stage; positive guidance for when a composite is the right choice on primary molars (the crown criteria exist, the composite side does not); SDF and Curodont application protocols plus the standard SDF-staining talking points; the recare interval standards behind "clinically appropriate interval"; confirmation of the assembled age-based milestone sequence; and a worked list of legitimate cost levers versus off-limits compromises.

**Why it matters:** Blocks the remaining holes in CLIN-402, CLIN-403, CLIN-404, CASE-32, CASE-413, and CASE-414. These are the "second question" gaps: the framework answers the first question well and the follow-up not at all.

**Capture prompt:** "Dr. Alex, 10 minutes of rapid fire, and one-sentence answers are fine: which caries risk tool do we chart and where; what images does a new 4-year-old versus a new 9-year-old get; when is a composite the right call on a baby molar; how do you talk a parent through SDF turning the spot dark; what recall intervals do we use by risk; and name two cost levers you are comfortable with and two you never offer."

### D6. The AI and documentation stack, named and nailed down

**Missing:** Which AI documentation system captures the dictated exams (and anything the doctor must do to support it), the correction workflow when the AI note or RDA charting does not match what was said, whether one canonical exam sequence exists or per-doctor consistency suffices, what a "22-point sheet" is, confirmation that the doctor-track "AI overlay" is OVERJET, and approved language for AI-hesitant parents.

**Why it matters:** Blocks parts of CLIN-401, CLER-406, CULT-408, and CASE-15. The whole doctor charting model runs through this tool and the corpus cannot currently name it.

**Capture prompt:** "Dr. Alex, 10 minutes on the AI stack. Name the documentation tool and the x-ray overlay so we stop saying 'the AI system.' What do you do when the note comes back wrong? Is there one blessed exam sequence? What is a 22-point sheet? And give me your best two sentences for a parent who is uneasy about AI reading their kid's x-rays."

### D7. Multi-provider etiquette

**Missing:** Whether and how the original doctor is looped in when a colleague changes their plan and where the rationale is documented; guidance for representing a colleague's plan to a family without undermining it; target scheduling windows by treatment urgency; and the follow-up process when a family leaves genuinely undecided (who calls, when, how it is tracked).

**Why it matters:** Blocks the remaining holes in CASE-413 and CASE-414 and one associate-doctor question. Matters more every time a second doctor joins a location.

**Capture prompt:** "Dr. Alex, 10 minutes on doctor-to-doctor trust. When you change another doctor's plan, do they hear about it and where do you write down why? How do you explain a colleague's reasoning you only half-agree with? And when a family leaves saying they'll think about it, who owns the follow-up call and when?"

---

## 3. Tim + regional managers (Front Desk/DFI + Office Manager content)

### T1. The software how-to shelf (RSVD-5), the single biggest unblock

**Missing:** Step-by-step how-tos for the systems every desk move assumes: CareStack (ASAP/Quick Fill lists, Interpreter Report, missing codes report, Same Day Verification report and the Medusind handoff, Portal Status view), VoiceStack (To-Do list creation and routing, voicemail views, the Opportunities columns), Iris chat assignment, Uptime (what it is, task catalogs, schedules), the patient portal (access steps, failed-invite troubleshooting, the no-portal fallback), plus which reports back the OM standards (call reports for the 3-ring rule, 48-hour confirmation report, uncollected balances report, claim flags and their common types, the Daily Production Report's contents and destination).

**Why it matters:** This is the widest gap in the corpus by far: it appears in some form in 14 chapters (CLIN-1 through CLIN-4, CLER-5 through CLER-8, CLER-21, CLER-38 through CLER-40, CASE-14, CASE-16) and at least 10 questions across all four banks. The framework says what to do in these systems on every page and never how.

**Capture prompt:** "Tim, this one is bigger than 10 minutes but starts with 10: screen-record yourself (or a strong OM) doing the Monday routine: pull the Interpreter Report, the missing codes report, and the Same Day Verification report and send it to Medusind, narrating as you click. Then a second recording for VoiceStack: create and assign a To-Do, clear an Opportunities item, sweep voicemail. Two recordings unblock more of this corpus than any other single artifact."

### T2. The money playbook at the desk and in the office

**Missing:** The complete current payment options and their rules (in-house plans, deposits, terms), the CareCredit and Payment Plan talking points the framework references, the CareCredit enrollment process, comp and waiver authority at the desk versus the OM's service-recovery authority versus what needs regional approval, the refund and billing-correction process, what happens when payment is refused on site, the balance escalation path, whether discount or hardship policies exist, and confirmation of the fee figures quoted in sourced scripts ($125 Standard Limited Exam Fee, $30 fluoride portion) plus whether they vary by location.

**Why it matters:** Blocks CASE-13, CASE-46, CLER-40, CULT-12, CULT-42, and parts of CLIN-1 and CLIN-3, plus 7 questions across the DFI and OM banks. Money moments are where families are lost, and right now the corpus can teach tone but not substance.

**Capture prompt:** "Tim, give us 10 minutes on money authority. List every payment option we actually offer and its rules. Then draw the three lines: what can a DFI comp or flex on her own, what can an OM do, and what needs you? Finish with the refund process start to finish, and confirm whether $125 for the limited exam and $30 for fluoride are still right everywhere."

### T3. Employment and onboarding basics (RSVD-1, RSVD-2, RSVD-6)

**Missing:** Office hours and arrival expectations, the PTO policy and request process, the holiday calendar, the call-in-sick procedure per role (including the doctor absence-notification chain), the dress code specifics for all roles (the Culture Guide's actual business-casual rules; RDA and doctor dress standards are documented nowhere), compensation and bonus structure basics with the right human to route personal questions to, the onboarding and systems-access checklist, and the org chart with reporting lines and meeting cadence.

**Why it matters:** These are the reserved shelves the question banks hammered hardest: about 15 questions across all four banks land here, including most of the day-one new-hire questions. Blocks RSVD-1, RSVD-2, and RSVD-6 entirely and CULT-9 partially.

**Capture prompt:** "Tim, 10 minutes of new-hire basics, answered like you are talking to someone who starts Monday: what time do people arrive, how do you ask for a day off, which holidays are we closed, how do you call in sick (staff, and separately doctors), what do people wear by role, and who does a new hire meet in week one? If any of this exists in a handbook already, just point us at it."

### T4. Cancellations, no-shows, and parting with patients

**Missing:** The full cancellation consequence ladder (the levels, what triggers each, what each restricts), the missed-appointment consequence policy in plain words the RDA can quote, and the patient dismissal policy for chronic no-shows, including whose call it is.

**Why it matters:** The consequence conversation is a scored move for both DFI and RDA (CULT-10, CULT-25) but nobody can state the actual consequences. Blocks those two chapters plus 3 questions (veteran DFI, office manager, new DA).

**Capture prompt:** "Tim, 10 minutes on the consequence ladder. Walk me up it: first 48-hour cancellation, second, third. What exactly does each level restrict? When does a family get dismissed from the practice, and who approves that? Say it the way you would want a DFI to say it on the phone."

### T5. The insurance and payer playbook

**Missing:** The Common Denials cheat sheet (per-carrier list of commonly denied procedures) the framework tells DFIs to study, what to do when verification fails at arrival, options when coverage has lapsed (seen today or rescheduled, and on what terms), what happens on the Medusind side of the daily report, and the preauth submission workflow with per-insurer quirks and escalation timelines.

**Why it matters:** Blocks CLIN-4, parts of CLER-5 and CLER-7, CASE-47, and 5 veteran-DFI questions. The desk is scored on knowing this by memory; the corpus should be where they learn it.

**Capture prompt:** "Tim, 10 minutes with whoever knows our payers best. Top three payers: what does each commonly deny? A family arrives and verification never came back, or their Medicaid lapsed: what are their real options today? And for preauths: which system, what documents, and how long before we chase?"

### T6. Pro Moves program mechanics, the operational half

**Missing:** The definitions of the two weekly ProMove meetings (cadence, attendees, agenda), the attendance tracking mechanism and follow-up expectations, where each Monday KPI is pulled and any targets, a sample weekly action plan email, the hand-off observation rubric and where observations get recorded, huddle and 1:1 structure for OMs, and the training and certification matrix by role.

**Why it matters:** Blocks the four thin OM chapters (CLIN-34, CLIN-35, CLER-37, CULT-41) and feeds the biggest structure gap in section 4 (the program guide shelf), which 15 or so NO_HOME questions point at.

**Capture prompt:** "Tim, 10 minutes on the program's plumbing. What are the two weekly meetings, who attends each, and how is attendance actually tracked? Where does an OM pull each Monday KPI, and forward me one real action-plan email you thought was good. Then: what should an OM watch for in the RDA-to-doctor handoff, and where do they write it down?"

### T7. When the schedule breaks: the crisis playbook

**Missing:** The doctor-out rebooking protocol (order of moves, who calls whom), double-booking collision triage (who gets priority, how the other family is moved kindly), the authority rules for same-day schedule changes, and short-notice interpreter booking.

**Why it matters:** Blocks parts of CLIN-3 and CLER-7 plus 5 questions (4 veteran DFI, 1 office manager). These are exactly the mornings when nobody has time to figure it out from scratch.

**Capture prompt:** "Tim, 10 minutes on bad mornings. The doctor calls in sick and today is full: walk me through the first hour, in order. Two kids double-booked in one slot: who moves and what do we say? And how do we get an interpreter for tomorrow when the Monday report already ran?"

### T8. Front-of-house physical conventions

**Missing:** What the info board physically is, its color-code legend, and how the handoff to an RDA works; what the tablets are and how a pull order is suggested on them; whether "Red Zone" is a defined threshold and the standard alert channel per location; the amenity stock lists and where refills live; the approved music and its controls; the full opening and closing checklists; the bathroom check standard.

**Why it matters:** Blocks the remaining holes in CLIN-1 (the most gap-dense chapter in the corpus), CLER-8, CULT-9, and CASE-48. All of it is 10 minutes of walking around an office.

**Capture prompt:** "Tim, do this one on video at a location: 10 minutes walking the front. Show the board and decode its colors, show the tablets and how the desk suggests a pull order, open the amenity cabinet, show where the music is controlled, and read out the opening and closing checklists if they exist on paper."

### T9. Reputation: the review template and the negative half

**Missing:** The actual Alcan review-response template text and where DFIs find it, and who responds to negative Google reviews and how (the framework only covers positive ones).

**Why it matters:** Blocks part of CULT-11 and 2 questions (veteran DFI, office manager). Also one of the proposed new shelves in section 4.

**Capture prompt:** "Tim, 5 of your 10 minutes: paste us the review-response template. The other 5: a one-star review names a team member. Who owns the response, what is the policy, and what should the OM say to the team member?"

### T10. Smaller confirmations (batch into any session)

- Memo versus appointment note conventions, and the escalation guide for desk observations (CLIN-2).
- Which complaint types the desk escalates immediately and how escalations are documented; the OM complaint log and the threshold for regional involvement (CULT-12, CULT-42).
- The marketing contact, submission channel, weekly content assignments, and the photo/video consent policy (CULT-44); community event expectations.
- Per-doctor credibility fact sheets (training, years, strengths) and the canonical technology list with parent-friendly benefit lines, with Dr. Alex (CASE-15, CASE-31).
- Canonical benefits-language phrase set: the OM move says "estimated family contribution" while DFI and RDA moves say "patient portion/responsibility"; confirm whether one is preferred (CASE-45).
- The specialist referral directory per location and the referral send/follow-up workflow, with Dr. Alex (CLIN-404, CLER-405).
- Estimate, consent, and payment handling when treatment expands mid-appointment (CLIN-404).
- The charitable care program list (St. David's Foundation is named as one), how program status is flagged, and what counts as long distance (CLIN-404).
- The play-area introduction script, if an official one exists (CLER-6).
- Front desk study materials or onboarding curriculum for dental knowledge, plus the canonical common-procedures table (names, durations, codes, one-line descriptions), with clinical review from Ariyana or Dr. Alex (CLIN-4).

---

## 4. Structure gaps: NO_HOME questions and new shelves

The four question banks produced 199 questions; 54 found no home in the current index. They cluster hard. Below are the proposed new shelves, ordered by how many questions each would catch. Shelves RSVD-1 through RSVD-7 already exist and their content asks are covered in the expert sections above.

### S1. RSVD-8: How the Pro Moves program works (proposed, highest priority)

The largest single finding of the whole run: about 15 NO_HOME questions across all four personas are people asking Ask about Ask's own world. What is a Pro Move, what are the two weekly meetings, who scores me and where do I see scores, can a manager change assignments, how do I dispute a score, why isn't this busywork, and the learning-curve reassurance for a slow new hire. The corpus catalogs every move and never explains the program a new hire is dropped into. Content owners: John writes the program explainer; Tim confirms the operational mechanics (see T6). Note: several of these questions ("what are MY moves this week," "has anyone scored me") are LIVE-DATA and need the platform exposed as tools; the shelf holds the explainer, not the answers.

### S2. RSVD-9: People management, discipline, and HR escalation (proposed)

Office manager NO_HOME cluster: how to write someone up, whether someone can be let go, what to do with a harassment or discomfort report. Plus the fairness-and-conflict BOUNDARY questions from every bank that need a routing note (who to talk to), not adjudication. Content owner: Tim + regional managers, with a hard rule that the corpus routes to humans and never plays HR.

### S3. RSVD-10: Records release, privacy, and legal requests (proposed)

Five questions across three banks: a parent wants x-rays emailed, another office requests records, a lawyer requests the chart, custody documents and court orders, filming in the operatory (HIPAA-adjacent). Content owners: Tim + regional managers for process, Dr. Alex for the clinical-records side.

### S4. RSVD-11: Payments, collections, and refunds beyond the friendly reminder (proposed)

Veteran-DFI cluster: refuses to pay at check-in, refund requests, comp authority. Content overlaps T2; the structural point is that the index has no home for the hard half of money conversations.

### S5. RSVD-12: Reputation and review management (proposed)

Negative reviews have no home (the framework covers only positive responses). Content overlaps T9.

### S6. RSVD-13: Patient conduct and dismissal (proposed)

Where de-escalation ends: the abusive caller, when you may disengage, and dismissing chronic no-show families. Content overlaps T4.

### S7. RSVD-14: Daily office rhythm (proposed)

The new-DA questions "what do I do first thing" and "what is morning huddle" have no home; huddle appears only inside a doctor pro move. A short per-role opening/huddle/closing rhythm page would catch them. Owners: Tim + regional managers, with Ariyana for the clinical morning.

### S8. Smaller proposed shelves

- **Dress code and appearance, all roles.** CULT-9 covers admin only; RDA and doctor standards are documented nowhere (2 questions). Fold into RSVD-1/6 content if preferred.
- **Glossary of Alcan terms and abbreviations.** One new-DA question, but it supports every chapter; cheap to seed from the drafting work already done.
- **Who to talk to: escalation and support directory.** Several BOUNDARY questions need only a routing map (org chart plus "for X, see Y"). Pairs with the org chart ask in T3.
- **Family-facing practice policies.** Filming and photos in the operatory, siblings in the room, chaperones (1 to 2 questions). Owner: Tim.
- **Insurance and payer playbook.** The lapsed-Medicaid question was NO_HOME; T5's content could live on its own shelf rather than inside competency chapters.
- **Sedation and GA day-of protocols.** The doctor bank suggested it for the NPO-broken question; D1 and D3 provide the content, and a shelf makes it findable by every role.

### S9. Two structural observations that are not shelves

- **LIVE-DATA questions (20 of 199)** need the platform exposed to Ask as tools: my assignments this week, my check-in status, my score trend, my team's completion, next meeting. No document answers these; the corpus can only explain where the answers live. Worth its own line on the product roadmap.
- **Cross-role policies live under the role that authored them.** The veteran DFI kept landing on doctor-owned sections (the parental separation policy lives in CLER-406 but the desk explains it at booking). When sorting Basecamp content, prefer a shared home (a shelf) for any policy more than one role recites, and let role chapters link to it.

---

## 5. Alcan company basics: who we are (added 2026-08-21)

> Source: brand-fit review of the Ask assistant, 2026-08-21. These are the
> identity documents the corpus needs so the bot can answer "what does Alcan
> stand for" and ground policy answers in values, not just rules. The employee
> handbook (John is obtaining a copy) is the expected source for several;
> when it lands, check items 1, 5, 7, 10, and 11 against it first.

| # | Document | Why the bot needs it | Likely source |
|---|---|---|---|
| B1 | Mission and values one-pager | The literal answer to "what does Alcan stand for" | Handbook, else write it |
| B2 | Founding story: Tim and Dr. Alex, Kids Tooth Team to Alcan Dental Cooperative | Humanizes every answer; "who started this and why" | Founder interview (needs capture) |
| B3 | The coaching philosophy: growth, not surveillance | Grounds "why do I rate myself" answers in intent | Adapt brand-brief.md + management-model.md |
| B4 | Promise to families: the patient experience standard | Lets policy answers cite the why behind the rule | Curate Dr. Alex's Basecamp posts |
| B5 | Offices and structure (locations, org > group > location) | Basic orientation; new-hire staple | Handbook + DB; write a one-pager |
| B6 | Leadership and who-owns-what directory | Doubles as the escalation routing map (open question) | Needs to be written |
| B7 | Role guide (why DFI is Director of First Impressions, etc.) | Role names carry culture; explains them | UK-expansion JDs + handbook |
| B8 | The weekly loop explained for staff (what scores are for and NOT for) | The anti-surveillance grounding, in Alcan's own words | Staff-voice rewrite of system-overview |
| B9 | Recognition traditions: glows and grows, Vitals, kudos, annual meeting, TOPS | Answers "how do we celebrate" with lived specifics | Curate Basecamp |
| B10 | Employee promise: CE, pay-band transparency, career path | Frames benefits as growth | Handbook |
| B11 | Communication norms: Basecamp, huddles, where things live | "Where do I find/post X" questions | Handbook + Basecamp |
| B12 | How we talk to families: the house script style | Source of verbatim scripts for the bot to quote | Curate Tim's posts |
| B13 | External authorities we defer to (TSBDE, AHA, CDC) | Powers "Alcan defers to X, which says..." | Curate Dr. Alex's posts |
| B14 | Glossary of Alcan-isms (Pro Move, DFI, short call list, huddle) | Vocabulary for every other answer | docs/glossary.md, staff-voice rewrite (overlaps S8) |

B1, B2, and B6 are the ones only the founders can produce; worth capturing
while John has their attention. B14 overlaps the S8 glossary shelf; treat as
one item.

### B15. Staff bios (added 2026-08-21, policy sketch pending John's sign-off)

**What:** One self-authored bio document per person: name, role, location,
what they own (mapped to expert areas), how to reach them, background they
choose to share, and a personal line they write themselves. Leadership first
(overlaps B6), then everyone, collected via a short template.

**Policy sketch:**
- Bios are self-authored or self-approved, opt-in. The person is the owning
  expert of their own bio; nothing about a person enters the corpus without
  their sign-off.
- HARD LINE: platform data (scores, check-ins, evals, coaching notes) never
  enters bio documents or any corpus document. Same firewall class as the
  conversation-privacy consent rule.
- Excluded always: compensation, HR history, schedules, personal contact info.
- Bot behavior: answer "who is X / what do they do / who owns Y" from bios;
  decline evaluative or comparative questions about people and route to a
  human, same posture as venting. (Needs a system-prompt rule when bios land.)
