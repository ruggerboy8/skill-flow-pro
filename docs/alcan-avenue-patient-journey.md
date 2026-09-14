# The Alcan Avenue Patient Journey

> **Status:** Working draft **v0.3**, 2026-08-13. Owner: John.
>
> **Changed in v0.3:** Overlaid Sam's Cashing Up analysis (11 Aug, corrected
> 13 Aug). The data validates the model and fixes three things: the response-time
> standard is now two-stage and evidence-based, the **non-responder cadence** was
> missing entirely and is now written in, and **the standing pipeline** is now a
> named TCO workstream rather than a footnote about the dentists' private lists.
> Three outstanding data questions are answered. Numbers cited as *(CU)* come from
> that workbook and are the only figures here that should be treated as measured.
>
> **Changed in v0.2:** Bobby's review call. Nine of eleven open questions
> answered, hygiene added as a first-class part of the journey, the triage model
> restructured from two tracks to three, and the response-time and continuity
> models materially revised.
>
> **Purpose:** The single narrated description of what a patient's experience is
> meant to be at Alcan Avenue, end to end, across every role. Step one of Tim's
> sequence: **journey → job descriptions → KPIs → performance spreadsheets → Pro
> Moves.** Everything downstream inherits this document's assumptions.
>
> **Sources:** (a) Bobby's original TCO narration; (b) Bobby and Sam's review
> call, 2026-08-04; (c) the Tim Otto sequencing conversation; (d) the live Skill
> Flow Pro `general_uk` library, read 2026-07-29; (e) **the Cashing Up analysis
> workbook, 11 August 2026**, covering every receipt since 14 December 2022 and
> 2,278 CRM leads since March 2025. Marked *(CU)* throughout.
>
> **Confidence:** Tracks A and B are Bobby's own words across two conversations
> and are high confidence. Track C is reconstructed from the live Pro Move library
> and has still **not** been walked through with Bobby. Flagged inline.

---

## How to read this document

**Two tiers.** Every element carries a tier tag.

| Tag | Meaning |
|---|---|
| **`T1`** | Do this now. No new resource, spend, or build required. |
| **`T2`** | Requires something that does not exist yet: a built asset, a purchase, physical space, or a systems change. Collected in §11. |

**Three tracks.** This is the v0.2 restructure. The old "new versus existing"
split was wrong. The real split happens at the **enquiry**, based on what the
patient is asking for.

```
                         ALL new patient enquiries
                                    │
                                   TCO
                                    │
                 ┌──────────────────┴──────────────────┐
                 │                                     │
        "I want an implant"                    "I need a dentist"
        "I want my teeth straight"             "We've moved to the area"
        "I hate my smile"                      "I want to register my family"
                 │                                     │
          TRACK A                                TRACK B
       Treatment-led                          Registration-led
   TCO consultation first                  Hygiene / therapist first
                                          TCO called in if something found

        Established patient base, routine recall  →  TRACK C (reception)
```

| | **A: Treatment-led** | **B: Registration-led** | **C: Established** |
|---|---|---|---|
| Trigger | Names a treatment | Wants a dentist | Already ours |
| First appointment | TCO consultation | Hygienist / therapist | Whatever they booked |
| Owner | **TCO**, end to end | **Hygienist**, with TCO on call | **Reception and nurse** |
| Status | New. This is the change. | **New in v0.2.** Also a change. | Live today. |

---

## 1. The operating shift, in one page

Today, Avenue runs on **whoever is free**. A patient enquires and whoever picks up
owns that moment. They come in and whoever is at the desk greets them. Angelina
and Millie are doing treatment coordinator work on top of full reception duties,
which works because they are good at it, and stops working the moment three
surgeries are running, the door goes, and the phone goes at once.

The problem is not that anyone does a bad job. It is that **nobody owns the
patient.** Notes go into CareStack, calls go into VoiceStack, and things still get
lost, because a record is not a relationship.

The standard replaces that with a named owner:

> **Every new patient gets one person who introduces themselves at the first
> contact and is still there at the last one.** That person has a direct number.
> The patient never rings the practice and asks to be passed to someone. The
> dentist never carries the money conversation. And when something goes wrong,
> the patient complains to someone who already knows them.

**v0.2 adds a second shift alongside it.** Hygiene stops being an afterthought
the dentist mentions and a patient rebooks for. It becomes the front door of the
routine journey. Bobby's reasoning is blunt and worth keeping: dentists do not
push hygiene, because they are focused on their own dentistry and getting paid
for it. So the conversation gets taken out of their hands. Every new patient
needs hygiene, the therapist sees them first, and the therapist becomes a second
diagnostic portal into the practice rather than a service booked after the fact.

**Two design rules Bobby and John locked on the review call, worth stating once
and applying everywhere:**

1. **Design for best case, not for current staffing.** We write the process we
   want and then work out how close current staffing gets. We do not write a
   standard and immediately caveat it.
2. **No role blending.** If you are a nurse, you are a nurse. The grab-bag
   model, where a spare nurse covers TCO work on a quiet day, is exactly what
   this replaces. Staffing gets solved with staffing, not by widening jobs.

---

## 2. Who does what: the role map

| Role | Owns | Changes most | Notes |
|---|---|---|---|
| **TCO** | The entire Track A relationship, plus first contact on every new enquiry, plus consultant call-ins from hygiene. | **Everything. Does not exist yet at Avenue.** | Bobby's target is one to two dedicated people. Millie is the internal candidate. |
| **Hygienist / therapist** | **New in v0.2.** The front door of Track B. Hygiene delivery, oral health education, and spotting the opportunity that triggers a TCO call-in. | **Significantly.** From service provider to diagnostic and conversational entry point. | Current hygienist on maternity from October. New therapist recruited, fresh graduate, keen and open. |
| **Reception / FOH** | Track C, the physical front of house, the established base. Loses new patient intake. Retains enquiry catch when the TCO is with a patient. | Significantly. Narrower scope, higher bar. | Currently carries de facto TCO duties. |
| **Nurse** | Chairside, the surgery, the clinical record, the handover to the dentist. | Least of any role. | Already strong Pro Move coverage. |
| **Dentist** | Diagnosis, the clinical plan, prescribing staging and timeframes. **Loses** fee presentation, objection handling, and the hygiene conversation. | Meaningfully. Chair time gets protected. | Also needs the shadow recall lists taken off them. See §5.6. |
| **Practice manager** | The system, not the transactions. The numbers, the standards, complaint oversight, developing the team. TCO line manager. | **Significantly, per Tim.** | New hire landing ~4 weeks. Alcan has **no** usable source JD for this role. |

---

## 3. Triage and continuity

### 3.1 Where enquiries go

**Answered.** All new patient enquiries go to the TCO. Volume supports it:
**143 Boxley enquiries in July** plus roughly **25 phone calls**, running
24 / 34 / 30 across the first three weeks, so about **30 a week**. Bobby's
judgement is that one person can absorb 30 enquiries a week **if that is all they
are doing**. Not if they are also on reception.

| Enquiry | Route |
|---|---|
| New patient naming a treatment (implant, aligners, cosmetic, sedation) | **Track A**, TCO consultation |
| New patient wanting general registration or a checkup | **Track B**, hygiene first |
| Established patient, routine need | Track C, reception |
| Established patient asking about implants, aligners or cosmetic work | **Track A**, opened as a new case |
| Emergency, new or established | Reception first, get them seen. TCO picks up afterwards if a plan emerges. *(Still unconfirmed with Bobby.)* |

### 3.2 The response-time problem, and the answer

This came up on the review call and it is a genuinely good catch by Bobby. **A
TCO who is mid-consultation cannot answer the phone within ten minutes.** The two
halves of the job fight each other.

**The model, until there are two full-time TCOs:**

- **First response is practice-neutral.** If the TCO cannot pick up, it rings
  through to reception, who acknowledge and capture. **`T2`** *(VoiceStack routing change)*
- **First real human contact is always the TCO.** Reception catches, the TCO
  converts. Nobody else runs a new-patient conversation.
- **Once there are two TCOs**, one runs response and one runs consultations.

### 3.2b What the data says about speed, and what it does not *(CU)*

The workbook measures this directly, and it changes the standard we set in v0.2.

On webform leads alone, which strips out the walk-in distortion:

| Time to first contact | Convert to treatment |
|---|---|
| **Within 1 hour** | **25.4%** |
| 4 to 24 hours | 17.6% |
| 1 to 3 days | 14.3% |

Median lead-to-treatment is **5 days**, **56%** of all conversions happen inside
a week, and only **4%** happen after three months. A lead still untouched after a
fortnight is realistically gone.

**Two honest caveats.** The finest measured band is *within one hour*. Nothing in
the data distinguishes ten minutes from sixty, so the v0.2 standard of "10 gold,
20 threshold" is tighter than the evidence supports. And the "more than 3 days"
row shows the *best* conversion of all, which cannot be right; those are almost
all cases where contact was logged after the patient had already been in, so the
timestamp records admin catch-up. Speed demonstrably helps inside 72 hours and
the dataset cannot prove anything beyond that.

**The revised standard, which fits both the evidence and §3.2:**

| Stage | Standard | Owner |
|---|---|---|
| **Acknowledgement** | 10 minutes gold, 20 minutes threshold | Whoever picks up. Reception catches when the TCO is with a patient. |
| **TCO callback, the real conversation** | **Within the hour**, during opening hours | TCO |

This is better than a single number. It keeps the fast-acknowledgement discipline
Bobby wants without setting the TCO a target the job structurally prevents them
from hitting, and the hour is the figure the practice's own data actually
supports.

### 3.3 The continuity tiers

**Perfect world:** the same TCO from first call to last appointment.

**Real world:** holidays, days off, and a part-time postholder mean that is not
always possible. Bobby's position is that leeway is fine **provided the handover
is explained properly and an introduction is made**. What is not fine is the
patient discovering it by surprise.

So the first conversation sorts the patient into a continuity tier: **`T1`**

| Tier | Who | Standard |
|---|---|---|
| **Strict continuity** | High-value cases **and** high-anxiety cases. Bobby named sedation patients and the very nervous explicitly, alongside the big-ticket work. | Same TCO throughout. If unavoidable, a named, warm, explained handover. |
| **Standard** | Everyone else. Bobby's example: the patient whose tooth hurts and who just wants it fixed. | Continuity preferred, not guaranteed. Any TCO can pick it up from the record. |

That anxiety sits alongside value in the top tier is an important point and it
should survive into the training. The nervous patient has more to lose from being
passed around than the expensive one does.

### 3.4 The staffing gap, stated plainly

Millie wants the role and works **Tuesday, Wednesday, Thursday**. She may add
Fridays in three to four months. **Mondays and Fridays have no TCO.**

Per design rule 1, the process is not being written around this. The options are
a decision for Bobby, not a process compromise:

- Hire a **part-time TCO for Mondays and Fridays**, who later absorbs the full
  week as volume grows and Millie moves to Fridays.
- Accept degraded continuity two days a week and say so openly.

**This is time-critical.** It carries recruitment lead time and it should be
settled before the practice manager starts, not after.

**One data point that softens it *(CU)*.** Day of week is a bigger and far more
certain effect than any month: Wednesday runs 9.5 patients per open day,
**Tuesday 7.4 and Friday 7.3**, a 29% spread. So **Friday is the second-quietest
day in the practice**, and one of the two uncovered days is the one that costs
least to leave uncovered. Monday sits mid-table at 8.3.

That does not remove the need for a decision, but it does mean the honest choice
is a **Monday-weighted part-time hire**, not a full two-day gap to be panicked
about. It also means Millie's Tuesday, Wednesday, Thursday covers the busiest day
of the week and gives her a naturally quiet Tuesday for pipeline calling.

---

# TRACK A: Treatment-led

*The patient names what they want. Bobby's original narration, confirmed and
refined on review.*

---

## A1. The enquiry lands

**The standard:** No new patient enquiry sits unattended, whatever channel it
came through.

**Owner:** TCO, with reception as catch

- New patient calls route to the TCO first, then fall through to reception after a few rings. **`T2`**
- The TCO runs Boxley live in the background all day and works the queue continuously, not in batches. **`T1`**
- Website forms, chat, social, and practice referrals all land in the same queue and are treated the same. **`T1`**
- **Referral source captured every time.** Case acceptance is materially higher on practice referrals than cold marketing, and it changes how the call opens. **`T1`**

**The standard.** Acknowledgement within 10 minutes gold, 20 threshold. TCO
callback within the hour. See §3.2b for the evidence and the reasoning.

> **Resolves the 10-versus-20 conflict.** Front Desk Pro Move 219 currently says
> ten minutes. That becomes the *acknowledgement* target and stays with reception
> as the catch. The TCO gets a new move at within-the-hour for the real
> conversation.

### A1b. The lead who does not pick up

> **New in v0.3. This was missing from v0.2 entirely, and it is the largest
> single leak in the business.**

The workbook is unambiguous about where Avenue loses money *(CU)*:

| Funnel step | Leads | Kept |
|---|---|---|
| Qualified | 1,915 | |
| Usable name recorded | 1,663 | 86.8% |
| **Team made contact** | **1,632** | **98.1%** |
| **On CareStack as a patient** | **637** | **39.0%** |
| Treated after the lead | 496 | 77.9% |
| Treated beyond an exam | 395 | 79.6% |

**995 leads, 61% of everyone the team actually spoke to, never made it onto
CareStack.** Every other step in the funnel runs at 78% or better. Once a patient
is on the system this practice converts well. The entire loss is upstream.

**"No Response" is the biggest coded reason: 446 leads, and only 33 of those 446
ever reached CareStack.** Right now a lead that does not answer appears simply to
be dropped. There is no cadence, so there is no second attempt.

**The standard: `T1`**

- **Five contact attempts across ten working days**, mixing phone, SMS and email. **`T1`**
- Ten days is the whole window, because a lead untouched after a fortnight is realistically gone. **`T1`**
- **Then it gets closed with a coded reason.** Not left open, not silently abandoned. **`T1`**
- Creating the CareStack record is part of the *first* call, not something that waits for them to book. This is the step the funnel is losing. **`T1`**

> **A measurement problem worth fixing at the same time.** 1,210 of 1,915
> qualified leads carry **no lost reason at all**, so the CRM is not recording an
> outcome for roughly two-thirds of the book. Any percentage taken from the
> lost-reason field today describes the coded third, not the whole. The coded
> close above fixes this as a by-product.

**Data questions now answered by the workbook** *(CU)*: July 2026 ran **153
leads → 54 onto CareStack → 28 treated**. That sizes the TCO's real workload and
closes the three data asks from v0.2.

---

## A2. The first call

**The standard:** The purpose is not to answer the patient's question. It is to
build enough rapport that they want to come in, and to learn enough to prepare.

- The TCO rings. By phone, deliberately, not by message. **`T1`**
- Name and practice, then straight into discovery. **`T1`**
- Ask, listen more than you talk: what is going on, is it for them, what happened, **why now**, **why us**. **`T1`**
- Captured through VoiceStack, hands free, into the record. The TCO is not typing while the patient talks. **`T1`**
- Boxley to CareStack is one click, then address and remaining details. **`T1`**
- Book the consultation and take the **£35 refundable deposit**. The consultation is free. The deposit protects the diary and is why the failure-to-attend rate is low. **`T1`**
- Sort the patient into a continuity tier (§3.3). **`T1`**
- Book as soon as they can come. No minimum lead time. **`T1`**

**What good sounds like,** when someone opens with "how much is an implant":

> "Thanks so much for getting in touch, Mr Smith. Before I answer that, can you
> tell me a bit more about what's going on? Is it for yourself? Have you lost a
> tooth?"

**What it must never sound like:**

> "Our implants start from £X."

**The rule: prices are not quoted on the phone.** If a number comes up at all it
is the last thing in the conversation, not the first.

---

## A3. Preparing for the consultation

**Owner:** TCO

### Forms, and the 32Co change

**New in v0.2.** Avenue uses **32Co**, an aligner company providing a
custom-branded app. The patient takes photographs on their phone and the app
returns an AI simulation with a before-and-after slider of their finished result.
It carries its own CRM. If the patient does not complete it at home, it gets done
in the practice.

**Bobby wants 32Co to replace the smile questionnaire**, not sit alongside it.
That reverses the v0.1 plan to build a set of treatment-specific questionnaires.

> **Open, and it matters. See Q13.** 32Co covers the smile makeover and aligner
> case well. It does not obviously cover implants, general dentistry, or anxiety
> and sedation. Either those still need questionnaires or something else fills
> the gap. Do not let 32Co's strength on one pathway leave the other three with
> no pre-consultation instrument at all.

**John's caveat, which stands regardless:** we still need the patient's desires
**in their own words**, captured somewhere we control. An AI simulation tells us
what their teeth could look like. It does not tell us that their daughter is
getting married in three months. That is what the recorded TCO conversation is
for, and it is the thing the whole close hangs on.

Medical history still goes out through CareStack automatically. The TCO is
accountable for **everything being complete and confirmed 48 hours before the
appointment.** **`T1`**

The reasoning behind the form still holds and belongs in the training: British
patients disclose far more in writing than they will say out loud. The form is
what lets the TCO open with "I see here you said..." and get to the real answer.

### The welcome pack. Answered on review.

Avenue used to post a physical welcome pack and stopped on cost. It comes back,
treatment specific, with a personal handwritten note from the TCO. **`T2`**

**The rule:**

| Gap between booking and appointment | What happens |
|---|---|
| **More than three days** | Pack goes in the post |
| **Three days or fewer** | Pack is handed to them in the practice on arrival |

**Dispatch standard: packs go out the next business day after booking.** Book on
Monday, posts Tuesday. Bobby's reasoning is that the pack works precisely because
it arrives while the conversation is still warm, so batching it weekly defeats
the point. There is a post office across the road, so this is a process
discipline problem, not a logistics one.

Sam's contribution: handing it over in the practice for short-lead bookings also
gives the patient a reason to turn up.

### The preparation

Before the appointment the TCO builds a short written profile from the call
recording and the completed forms. Bobby's framing: we have not seen this patient
yet, but based on what they have told us, this is what they need.

| Field | Why |
|---|---|
| Likely procedures | Sets the vocabulary needed for the day |
| Ballpark investment range | The TCO must be ready with a figure. See A6. |
| The patient's stated priority | What the entire close hangs on |
| Why now | The thing that made them ring this week |
| Why us | Referral, recommendation, social. Changes the opening. |
| Communication style | Detail-hungry or overview-only |
| Continuity tier | Set at A2 |

Nothing exists for this today. Worksheet first or AI-assisted draft. **`T2`**
There is a real argument for the worksheet, because it forces the TCO to read the
transcript rather than be handed a summary.

**48 hours out**, a personal WhatsApp from the TCO. Not an automated reminder. **`T2`**

---

## A4. Arrival

**Owner:** TCO, supported by reception

- Reception may check them in, but the **TCO meets and greets**. **`T1`**
- A short tour. **`T1`**
- Tea, coffee, water, offered before anything else. **`T1`**
- **The dentist cameo.** If a dentist is free, ten seconds. "Lovely to meet you, hope to see you again soon." **`T1`**

The cameo costs nothing and does one specific job. Later, when the TCO says "Dr
Bhandal will want to look at this," the patient has a face for the name. Nice to
have, never a priority, and no dentist gets pulled from a surgery for it.

---

## A5. The consultation

**Owner:** TCO, in a private room. **`T2`** *(dedicated rooms arrive with the upstairs build)*

Conversation first, always. You do not take someone into a room and say "open up,
I'm going to scan you."

**The room kit. `T2`** Intraoral scanner, clinical camera, workstation, wall
screen, and a portfolio of before-and-afters plus video testimonials.

On the portfolio, the requirement is specific and should survive into the Pro
Move: **the case shown must match the patient.** A fifty year old English woman
considering implants is shown a fifty year old English woman. Demographic match
is the point, not library size.

**In order:**

**1. The practice manifesto. `T2`** A short, warm statement of what Avenue
believes and why the visit is built the way it is. Not a sales pitch. Shape: *at
Avenue we care a great deal about X, Y and Z, which is why we always do A, so
that patients always feel B and never feel C.*

**2. The preview. `T1`**

> "So here's how this'll go. First we're just going to have a chat, and I'm going
> to ask you a lot of questions. Then I'll take some photos and a scan, because I
> need to see what's actually going on. Then I'll pop you back out for another
> cup of tea while I go through it all properly, and then we'll sit back down and
> I'll tell you exactly what I've found."

**3. Discovery. `T1`** Deeper than the phone call, anchored to the forms and the
32Co simulation if there is one. What they want and what they fear.

**4. The style question. `T1`** Asked every time:

> "Some people want to know every last detail, and some people would rather I
> just gave them the overview. Which are you?"

**5. Capture. `T1`** Clinical photographs and an intraoral scan. **That is the
entire clinical content of this appointment.** No examination. The TCO is not
diagnosing. That boundary matters for the job description and the consent
wording, and it is the line between a treatment coordinator and a clinician.

**6. The analysis break. `T1`** Five to ten minutes, patient back to the lounge
with another drink.

This does three jobs at once. It gives the TCO time to think. It gives the
patient a moment with their own expectations. And **it is the window to grab a
dentist** if the TCO is unsure or on the fence. The patient never sees the
uncertainty.

---

## A6. Findings, and the money conversation

> "So Mr Smith, I've had a really detailed look at your photos and your scans,
> and this is exactly what we found."

1. **Here is what I found.** On the screen.
2. **Here is what it is called.** Plain language.
3. **Here is the remedy,** and the options.
4. **Here is a case like yours.** Matched before and after.
5. **And here is how that connects to what you told me you wanted.**

Step five is the hinge. If discovery was done properly:

> "You came here today because your daughter's getting married in three months
> and you don't want a gap in your smile. I'm really glad to tell you that we can
> do this for you. We can give you your smile back and make sure you can smile in
> every one of those photographs. To do that, we need to do X, Y and Z, and I'm
> confident we'll get you there."

If you did not ask in the first place, you do not know, and you cannot say any of
that.

**The ballpark. `T1`** An indicative investment range **at this appointment**,
not at the dentist appointment. This is what stops the £49 exam turning into a
£3,000 surprise, losing both the case and the chair time.

---

## A7. The close, or the warm hold

> "How do you feel about that?"
>
> "What would you like to do next?"

The second question is where objections surface, and surfacing them is the point.
An objection you have heard is workable. One the patient takes home is not. The
real ones are cost, needing to speak to a partner, fear, and competing
priorities.

**If yes:**
- Book the clinical examination and take the consultation fee. **`T1`**
- **Preview that appointment specifically**, including cost: **`T1`**
  - **Clear aligners:** £250 deposit funding the ClinCheck, deducted from the total. Retained if they do not proceed. Bobby's worked example: £250 now against £3,750, with £3,500 on ClinCheck confirmation.
  - **Implants:** a CBCT scan on the day, with a fee. Around 95% of patients who pay for the CT go ahead, so it is both a commitment signal and a clinical necessity. The TCO must set the expectation, because the TCO cannot prescribe the scan and the patient should not first hear the cost in the chair.

**If not yet:**

The fallback is a real goal, not a consolation: **get them booked back for a
review.** A patient who returns has spent motivation and time to do it, which is
a strong intent signal. If they will not book a second visit, they were never
close, or the case was not made.

- A specific follow-up call, date and time agreed. Not "I'll be in touch." **`T1`**
- Into the pipeline with a next action and an owner. **`T1`**
- Drip content, matched to their case. **`T2`**

---

## A8. Between consultation and clinical exam

- File written up before the end of the day. **`T1`**
- Pipeline updated with stage, value, next action. **`T1`**
- 48 hours out, the personal WhatsApp. **`T2`**

---

## A9. Clinical examination day

1. **TCO meets and greets again.** Familiarity is the point. **`T1`**
2. **Warm handoff to nurse and dentist.** Formal enough that the patient registers it as a moment. **`T1`**
3. Nurse and dentist run the appointment. Existing nurse Pro Moves cover it: present the patient by name with procedure, history and concerns (265); tell, show, do (262); record agreed treatment as presented (259).
4. Dentist diagnoses, images, builds the plan.
5. **Dentist and TCO confer.** The dentist prescribes staging, sequence and timeframes. The TCO owns everything else. **`T1`**
6. **The patient goes back to the TCO before they leave. `T1`**

**The hard rule:** if the dentist formulated the plan on the day, the patient does
not leave the building without seeing the TCO and being signed up.

---

## A10. The commitment

- **Reconnect to the arc.** We have met a few times, we have looked at everything properly, here is where we have got to. **`T1`**
- **Name what changed.** Confirm what they knew from the ballpark, be straight about anything new. The implant that needs a sinus lift and goes from £3,000 to £5,000 is the conversation this model exists to handle. **`T1`**
- **Present the investment without apology.** Value anchored before price. **`T1`**
- **All payment routes as normal options, not fallbacks:** membership plan, staged payment, third-party finance. **`T1`**
- **Book the full sequence** to the prescribed staging. **`T1`**
- **Take payment or deposit.** **`T1`**
- **Obtain and document consent**, and build the plan in CareStack. **`T1`**

> Practice manager Pro Moves 329 and 330 already back-stop this. The TCO does it,
> the practice manager verifies it. Right shape, already exists.

---

## A11. During treatment

- The TCO stays the named contact. The patient rings the TCO, not the practice. **`T1`**
- The TCO watches for drift: missed appointments, wavering, payment issues, and acts early. **`T1`**

### The day-after call. Answered on review.

**Owner: the TCO**, for the patients who get one. Reception does this today; it
moves.

| Gets a call | Does not |
|---|---|
| Extractions, root canals, implants, **anything surgical**, major cosmetic and aesthetic work including veneers and composite bonding | Routine fillings and checkups |

A short call, a minute or two, checking in.

**John's rule, and it is the practical one:** it matters more that the patient
gets a call than that the call comes from the TCO. So the TCO needs a defined way
to pull reception in on a heavy day. **`T1`**

> **Resolves the conflict with Front Desk Pro Move 242.** That move splits: TCO
> for the surgical and cosmetic list above, reception for the rest and as
> overflow.

---

## A12. End of treatment

1. **Final clinical photographs.** **`T1`**
2. **The reveal.** Before and after, side by side. **`T1`**
3. **Video testimonial.** **`T1`**
4. **Social media consent**, asked separately and explicitly. **`T1`**
5. **Google review.** **`T1`**
6. **The referral ask.** **`T1`**

By this point Avenue has seen this patient perhaps a dozen times over months, and
the ask lands at the peak of the relationship from someone who has just seen
their own before and after. Completely different from a text two hours after a
filling. It also feeds the portfolio the next patient sees, so the journey
compounds.

---

# TRACK B: Registration-led

> **New in v0.2.** The patient wants a dentist, not a named treatment. This is
> the volume route and it is where Bobby wants the biggest structural change.

---

## B1. Why this track exists

Today: patient comes in, has a checkup with the dentist, and is told to rebook
for hygiene. The team's belief is that patients will not book hygiene alongside
the dentist appointment. **Bobby's view is that this is not true, and that it is
purely a function of how it is explained.**

Under the new model, hygiene moves to the front:

> **Every new patient needs hygiene.** They are new, we have not seen them
> before, so unless another practice rings to say they cleaned them yesterday,
> they are having their teeth cleaned.

Two reasons this is more than a scheduling preference:

1. **It takes the hygiene conversation away from the dentist.** Bobby is direct
   about why: dentists do not push it, because they are focused on their own
   dentistry and getting paid for it, and they do not emphasise the importance
   enough.
2. **The hygienist is a better diagnostic and conversational portal than the
   dentist.** They see far more patients with crooked teeth, staining, tartar and
   perio than any single dentist does, and they have a natural, non-salesy
   opening: if your teeth were straighter you would not be fighting these
   problems.

---

## B2. Booking

- Hygiene is **pre-booked at the point of enquiry**, not offered on the day. **`T1`**

Bobby was explicit: if you do not book it, you lose the diary space. Same-day
availability is not a substitute for a booked appointment.

- Block scheduling is being redesigned to support this. **`T2`**

---

## B3. The hygiene appointment

**Owner:** hygienist / therapist

The therapist does as much as possible within scope. Beyond the clinical work:

- **Oral health education**, framed around what the patient actually cares about. **`T1`**
- **Hygieny app. `T2`** The 32Co hygiene product gives the patient a plaque score and a staining score and generates a report they take away. It makes an invisible problem visible and it makes the conversation concrete rather than a telling-off.
- **Spot the opportunity.** Crooked teeth, staining, wear, perio, anything the patient has expressed unhappiness about. **`T1`**

---

## B4. The TCO call-in

**New in v0.2 and a genuinely new behaviour for the practice.**

When the therapist finds something worth a conversation, they **bring the TCO in
during the visit.** Not a note in the record, not a callback next week. In the
room, while the patient is in the chair and the thing they have just been shown is
still on the screen.

> "Before you head off, let me introduce you to someone. This is Millie, she
> looks after patients who are thinking about exactly this sort of thing."

The TCO then runs a short version of the Track A discovery, and if there is real
interest, books a proper consultation.

**Open. See Q14.** Whether *every* Track B patient meets the TCO, or only those
where something is found, is not yet decided. Bobby leaned toward the latter but
did not settle it. It is a meaningful difference in TCO workload.

---

## B5. On to the dentist

The patient then sees the dentist for their examination, arriving already
cleaned, already educated, and already having had any treatment conversation
opened by someone other than the person who will be paid to do the work.

---

# TRACK C: Established patients

> **Confidence warning.** Reconstructed from the 103 live Avenue Pro Moves. Not
> Bobby's narration and **still not reviewed with him.** Here so the reception and
> nurse job descriptions have something to stand on. Treat as a first draft.

**Before the day.** Unconfirmed appointments contacted at 48 hours (226).
Outstanding balances flagged before arrival (233). Incomplete paperwork worked
daily (225). Empty slots filled from the short-notice list (209, 227). Consent
forms confirmed a week before treatment (253).

**Arrival.** Stand up, smile, greet by preferred name (243, 239). Confirm
registration and medical history *before* completing check-in (224). Complete
check-in fully with an offer of a drink before any other task (222, 244). One
curious open question (240). Preview the dentist by name with a specific detail
(248). Late arrivals acknowledged with an honest wait expectation (234).

**Into the surgery.** Reception alerts the clinical team on check-in (215). Nurse
collects the patient personally (260). Greet by name, eye contact, introduce
yourself (294). Past ten minutes, reception notifies the lead nurse (216) and
speaks to everyone waiting if running more than ten minutes behind (210).

**In the chair.** Tray set for the procedure and its likely alternatives (269).
Assess mood on seating, flag quietly to the dentist (286). Tell them they can
raise a hand to pause (287). Curious question while seating (295), blanket or
drink (296). **Tell, show, do** before every action (262). Preview the dentist
and procedure (267), introduce by name with a specific comment on expertise
(306), highlight the technology (307). **The handover:** patient by name, planned
procedure, relevant history, and any concerns raised (265). Chart as the dentist
calls findings (258). Once the dentist leaves, check comprehension and narrate
next steps (298), then "how does that sound?" (297).

**Out.** Patient shares back the post-op plan (299). Six-month recall booked in
the surgery (281). Membership plan mentioned, handed to reception (282). Status
updated (274). **Walk them to the lounge**, offer hospitality, tell them
reception will be over shortly (305).

**Checkout.** Outstanding balance processed (217). Membership plan presented to
non-members (255). Literature offered to the undecided (214). Importance of the
next appointment emphasised (289, 232). Cost concerns met with every option
(247).

**After.** Day-after call for the clinical list in A11, reception for the rest
(242). Personalised response to every positive Google review within 24 hours
(241). VoiceStack Opportunities cleared to zero (228).

---

# CROSS-CUTTING

## 5.1 Complaints. Answered on review, and changed from v0.1.

**The change:** in v0.1 I had complaints escalating to the practice manager only
when formal. Bobby's actual position is stronger.

> **Every complaint goes to the practice manager for awareness.** Not for action,
> for awareness. The practice manager should know about every one.

| Level | Example | Who handles | Who is told |
|---|---|---|---|
| Niggle | Ran late, lost time off work, mild irritation | **TCO** | Practice manager |
| Verbal concern | Unhappy with care or communication | **TCO** | Practice manager |
| **Billing** | Anything about money | **TCO**, because the TCO is the person who asked for it | Practice manager |
| **Formal written complaint** | Anything submitted in writing | **Practice manager responds** | Bobby |
| Clinical | Treatment failure, adverse outcome, regulatory weight | **Escalate immediately.** TCO stays as the patient's contact. | Bobby |

Avenue's first formal written complaint came after three and a half years.
Everything before it was resolved by a conversation, front of house, or seeing
the dentist. **The thing that actually matters is response speed**, not the
escalation ladder.

**Logging, which is new.** Sam's point, and it is a good one: without a log,
patterns are invisible. Five people quietly moaning about the building work is a
signal, and today it evaporates.

- Currently: only recorded in patient records, and properly only when formal.
- **Wanted:** a full log that can be pulled and analysed monthly.
- **Bobby's idea:** a **complaint code in CareStack with a zero fee attached**, notes written against it, monthly report pulled. **`T2`** *(needs a CareStack rep conversation)*
- **Principle:** do not give staff another spreadsheet. It lives in the patient record so the next interaction can pick the conversation back up, which Sam rightly noted is itself part of the response.

## 5.2 TCO reporting and coaching. Answered on review.

**Reports to:** the **practice manager**, who tracks their KPIs.

**Coached by:** split, deliberately.

| Dimension | Coach |
|---|---|
| **Clinical knowledge** | A dentist, via regular check-ins. This also fits the workflow, since the dentist and TCO tag-team every case anyway. |
| **Cultural, behavioural, accountability** | **Practice manager** |
| **Technique and instruction set** | External TCO trainers may help build it, but the standard is held internally. |

Bobby's caution on external trainers is worth keeping: they arrive with their own
way of doing things, which is fine for building the curriculum and not fine for
owning the standard.

> This maps cleanly onto the ProMoves cascade in `docs/management-model.md`. The
> TCO line gets a functional director (a dentist, for clinical) and a location
> lead (the practice manager). It is the first new line built with both tiers
> deliberately in place rather than discovered afterwards.

## 5.3 Incentives. Answered on review.

**No individual financial incentive for the TCO.** Bobby and Sam already
discussed and landed on it.

The reasoning is worth preserving, because it is a values statement and it will
come up again with every new Alcan Avenue partner:

> Every single person in the practice has an impact on that patient's journey. If
> you incentivise one individual, how is that fair when the nurse might have been
> incredible, and might have mattered more to the patient than anyone?

**Still open, routed to Tim (Q16).** Sam floated a **pooled** incentive, a single
pot split by percentage across roles. That is a different proposition from
individual commission and it deserves a proper answer. Tim's practices have moved
away from financial incentives toward cultural ones. Kids Tooth Team tried
straight financial incentives without great success. Tim has the reasoning.

## 5.4 Hygiene as a growth engine

Covered in Track B, restated here because it belongs in the KPI set. The
hygienist is not a service line, they are the second-highest-volume diagnostic
conversation in the practice. Anything that measures new treatment starts should
attribute hygiene-originated cases separately, or the value of the change will be
invisible in the numbers.

## 5.5 What the TCO does *not* do

Worth stating explicitly, because the job will attract scope creep:

- **No clinical examination.** Photos and scans only.
- **No diagnosis.**
- **No prescribing.** The TCO cannot order a CBCT scan. The dentist does.
- **No reception cover.** Per design rule 2.
- **No nursing.** Same rule, in reverse.

## 5.5b The standing pipeline: the TCO's other half

> **New in v0.3, and it changes what the role actually is on day one.**

Everything in Tracks A and B describes what happens to a patient arriving *from
now on*. That is roughly half the job. The other half is the book that already
exists, and it is large *(CU)*:

| | |
|---|---|
| Unscheduled treatment planned and not booked | **£1,711,475** across **602 patients** |
| Median holding | £1,067 |
| Proposed and never answered | £1,363,927 |
| **Of that, raised in the last 6 months (genuinely live)** | **£958,424** |
| Patients holding a live proposed plan no other campaign reaches | **250, worth £472,514** |
| Held by patients lapsed over 9 months | £456,979 |

**This is the same behaviour as A7 and A8**, the warm hold and the scheduled
follow-up call, applied retroactively to a backlog that built up because nobody
owned it. It is not a different skill. It is the same skill, pointed backwards.

**Why it matters for how we sequence the role:** on day one the TCO's highest-value
work is not running a Track A consultation. It is **working 250 people who have
already been shown a price and never got an answer.** Nothing needs designing for
that, and it needs no consultation room.

**The standing expectations: `T1`**

- Every presented plan gets an owner, a next action and a date. No plan sits unanswered.
- Weekly pipeline review with the practice manager, which Pro Move 316 already assumes exists.
- Lapsed patients holding planned treatment are worked as a standing list, not a one-off campaign.
- **Stale is real.** £405,503 of the proposed total was raised more than six months ago and should be treated as cold. Some plans were declined verbally and never coded, so the note gets checked before the call.

## 5.6 The dentists' shadow lists. A live problem to fix.

Raised by Bobby on the review call and worth its own line, because it is a real
current failure with a real current cost.

Dentists are **keeping their own private lists** of patients who have not come
back for treatment, and then chasing the front desk daily about them. Bobby
called it inefficient. It is worse than that: it is an unowned, invisible,
duplicated pipeline that generates friction with the front desk every single day
and produces no aggregate view of anything.

**Under the new model this is the TCO's pipeline**, held in one place, worked
systematically, and reported weekly to the practice manager. Practice manager Pro
Move 316 already assumes this exists.

**Worth noting for the rollout:** this is one of the few changes that makes
somebody's day *immediately* easier without needing the building, the practice
manager, or a system change. See the rollout recommendation.

---

## 9. The standards, in one place

| Standard | Value | Owner | Status |
|---|---|---|---|
| **Acknowledgement** of a new enquiry | **10 min gold, 20 min threshold** | Whoever picks up | **Resolved.** Stays with reception as the catch. |
| **TCO callback**, the real conversation | **Within the hour** | TCO | **New in v0.3.** The figure the practice's own data supports *(CU)*. |
| **Non-responder cadence** | **5 attempts over 10 working days, then coded close** | TCO | **New in v0.3.** Currently no cadence exists at all. |
| CareStack record created | **On the first call**, not when they book | TCO | **New in v0.3.** This is the leaking step. |
| Phones / texts / emails | 3 rings / 3 min / 3 hrs | Reception | Live (218) |
| Consultation deposit | £35, refundable | TCO | Live |
| Forms confirmed complete | 48 hours before | TCO | New |
| Welcome pack dispatch | **Next business day after booking** | TCO writes, reception posts | **New, resolved** |
| Welcome pack cutoff | **>3 days posted, ≤3 days handed over in practice** | TCO | **New, resolved** |
| Appointment confirmation | 48 hours before | Reception (C), TCO (A) | Split by track |
| Personal WhatsApp | 48 hours before | TCO | **`T2`** |
| Consent forms before treatment | 1 week before | Reception, verified by PM | Live (253, 329) |
| Waiting time escalation | 10 minutes | Reception → lead nurse | Live (216, 210) |
| Analysis break | 5 to 10 minutes | TCO | New |
| Clear aligner deposit | £250, retained, deducted from total | TCO | Live, moves to TCO |
| Day-after call | Surgical and major cosmetic only | **TCO**, reception as overflow | **Resolved** |
| Hygiene for new patients | **Every new patient, pre-booked** | Reception / TCO at booking | **New in v0.2** |
| Complaint awareness | **Every complaint, to the practice manager** | All | **Resolved** |
| Google review response | 24 hours | Reception | Live (241) |

---

## 10. What this changes about each position

### Treatment Coordinator
**Written from scratch.** The Alcan US Treatment Coordinator JD is a benefits,
claims and CDT-coding role and transfers almost nothing but the job title. The
working competency draft plus this journey is the better starting material.

The journey adds material the competency draft does not yet cover: enquiry
response and first-call discovery; consultation framing (manifesto, preview,
style question); the analysis break and knowing when to pull a dentist in;
**the hygiene call-in**; continuity tiering; continuity handover; the day-after
call; the end-of-treatment protocol; first-line and billing complaint ownership;
and **owning the recall pipeline the dentists currently shadow**.

Confirmed fix: **Pipeline Management is Clerical.** It currently appears in both
CASE 5 and CULT 4. Remove both, place once in Clerical, which returns Case
Acceptance to four.

### Hygienist / therapist
**Also effectively written from scratch,** and this is new since v0.1.
`hygienist_gen_uk` has zero competencies in the platform. The role gains oral
health education as a core accountability, the Hygieny workflow, and the TCO
call-in. It is no longer a service provider, it is the front door of the volume
track.

### Reception / DFI
Similar shape, narrower scope, higher bar. Loses new patient intake, the enquiry
pipeline, and the commercial conversation. **Keeps the enquiry catch**, which
must be written in explicitly, because "answer it if the TCO cannot" is a real
duty and easy to leave unstated. Keeps and deepens front of house, the
established base, schedule integrity, confirmations, balances, and checkout.

### Nurse
Least affected. Add the TCO handoff and receive.

### Dentist
No fee presentation, no objection handling, **no hygiene conversation**, and
**no private recall lists**. Protected chair time. New obligation to confer with
the TCO on staging before the patient leaves.

### Practice manager
Changes most after the TCO. Doing to verifying and developing. **Line manages the
TCO.** Sees every complaint. Owns the numbers. Stops being the default owner of
unhappy patients.

**The risk worth naming:** this is the highest-priority job description, it lands
in roughly four weeks, and **Alcan's source document for it is blank.** One
bullet reading "mich". There is nothing to adapt.

---

## 11. The build list

*Everything tagged `T2`.*

**Physical and technical**
1. New-patient phone routing to a TCO line, with fall-through to reception *(VoiceStack)*
2. Dedicated consultation rooms *(upstairs build, ~4 to 6 weeks)*
3. Consultation room kit: scanner, camera, workstation, wall screen
4. Practice WhatsApp number and a policy governing it

**Systems configuration**
5. **CareStack complaint code** with zero fee, plus the monthly pull *(needs a CareStack rep conversation)*
6. **Block scheduling redesign** to support hygiene-first
7. **32Co** rollout, and a decision on what covers the non-aligner pathways
8. **Hygieny** rollout
9. Alcan HR systems: time clocks and related *(detail pending from Tim)*

**Content and assets**
10. Demographic-matched before-and-after portfolio
11. Video testimonial library
12. The practice manifesto script
13. The consultation preview script or visual
14. Printed welcome packs, treatment-specific, with a personal note
15. Drip content sequences for undecided patients
16. Written complaint escalation criteria
17. Pre-consultation questionnaires for whatever 32Co does not cover

**Process tools**
18. The pre-consultation patient profile: worksheet first, AI-assisted later
19. Consolidated recall pipeline, replacing the dentists' private lists
20. TCO pipeline reporting for the weekly practice manager review

---

## 12. Conflicts with the live Pro Move library

The TCO role exists in the platform (`tco_gen_uk`, role_id 10) with **zero
competencies and zero Pro Moves**, correctly and deliberately. The existing
libraries were written for pre-TCO, pre-hygiene-first Avenue.

| Live Pro Move | Currently | Under the new model |
|---|---|---|
| 219: Boxley enquiry call within 10 min | Front Desk | **Moves to TCO.** Becomes 10 gold / 20 threshold. Reception keeps a catch version. |
| 254: membership plan on every new patient enquiry call | Front Desk | **Drop or move.** Conflicts with Bobby's discovery-only first call. |
| 250: portal registration on the booking call | Front Desk | **Moves to TCO** |
| 251: verbally preview the visit when booking | Front Desk | **Moves to TCO** |
| 248, 249: preview the dentist and technology when booking | Front Desk | **Moves to TCO** |
| 238: ask goals and note them when booking | Front Desk | **Moves to TCO**, expands substantially |
| 226: contact unconfirmed appointments at 48 hrs | Front Desk | **Splits by track** |
| 242: day-after treatment call | Front Desk | **Splits.** TCO for surgical and major cosmetic, reception for the rest and overflow. |
| 208: tell new patients the nurse will collect them for a scan | Front Desk | **Rewrite.** Wrong for both new tracks. |
| 260: nurse collects new patients, does the intraoral scan | Nurse | **Track C only.** Track A scans are the TCO's; Track B starts with the therapist. |
| 281: book the 6-month recall before they leave | Nurse | **Extend.** Needs a hygiene equivalent under Track B. |
| 247, 303: cost concerns and staging reassurance | Front Desk, Nurse | Keep, but the referral path changes to the TCO |

**About a dozen moves change hands.** Staff check in and out against some of them
weekly. Announce the reassignment as a deliberate change; do not ship it quietly.

---

## 13. Questions

### Answered on the review call

| # | Question | Answer |
|---|---|---|
| ~~1~~ | All new patients or high value only? | **All new patient enquiries go to the TCO**, then route by Track A or B. ~30 enquiries/week is absorbable by one dedicated person. |
| ~~2~~ | One TCO or two? | **One dedicated, plus Monday/Friday cover.** Two full-time as volume grows, at which point one runs response and one runs consultations. |
| ~~3~~ | 20 minutes or 10? | **10 gold, 20 threshold.** |
| ~~4~~ | Welcome pack lead time? | **>3 days posted, ≤3 days handed over. Dispatch next business day after booking.** |
| ~~5~~ | Who makes the day-after call? | **TCO**, for surgical and major cosmetic only. Reception as overflow. |
| ~~6~~ | Complaint escalation line? | **Every complaint to the practice manager for awareness.** TCO handles niggles, verbal concerns and billing. PM responds to formal written. Log everything. |
| ~~7~~ | TCO reports to and coached by? | **Reports to the practice manager.** Clinical coaching from a dentist, cultural and accountability from the practice manager. |
| ~~8~~ | Incentivised? | **No individual financial incentive.** Pooled incentive still open, see Q16. |
| ~~9~~ | Where does hygiene fit? | **At the front.** See Track B. The largest single change in v0.2. |
| ~~10~~ | Online versus phone? | **143 Boxley to ~25 phone in July**, so roughly 6 to 1 online. Cleaner data coming. |
| ~~11~~ | Anything changed or wrong? | Bobby agrees with substantially all of it. One addition: 32Co and Hygieny. |

### Open

**For Bobby**

12. **Monday and Friday cover.** Part-time TCO hire, or accept degraded continuity two days a week? Carries recruitment lead time and should be settled before the practice manager starts.
13. **What covers the pathways 32Co does not?** It handles aligners and smile makeover. Implants, general dentistry, and anxiety or sedation still need a pre-consultation instrument.
14. **Does every Track B patient meet the TCO, or only when something is found?** Materially different TCO workload.
15. **Track C has still never been reviewed with you.** It is currently my reconstruction from the Pro Move library. Worth thirty minutes.
16. **Emergencies.** Reception first, TCO picks up afterwards. Assumed, never confirmed.

**For Tim**

17. **Pooled incentive.** Sam's proposal: one pot split by percentage across roles. Different question from individual commission. What is the reasoning behind moving Alcan away from financial incentives, and does a pooled model survive it?

**Data, now answered by the Cashing Up workbook**

| # | Question | Answer *(CU)* |
|---|---|---|
| ~~18~~ | Boxley report | In the workbook. 2,278 leads since March 2025. |
| ~~19~~ | VoiceStack: total calls versus new patients | Channel breakdown on "Lead conversion". |
| ~~20~~ | **How many enquiries walked through the door** | **July 2026: 153 leads → 54 onto CareStack → 28 treated.** Across the whole period, 1,632 contacted → 637 records → 395 treated beyond an exam. |

**New from the data**

23. **Sedation is the weakest lead category on every measure** *(CU)*: 103 leads, 18.4% reach CareStack, 10.7% treated, £87 a lead, slowest median at 22 days. Bobby named nervous and sedation patients as the **strict-continuity** tier in §3.3. So the group he most wants protected is currently the worst served. That is a strong validation of the instinct and a sizeable opportunity, and it should shape what the TCO is trained on first.
24. **Fix the lead mix before the TCO inherits it.** Facebook Lead Ads: 358 leads, 15.1% reach CareStack, £62 a lead, against £642 for manually-added walk-ins and phone. Two implant campaigns delivered essentially nothing from 89 leads. If the TCO starts while that volume is still flowing, a large share of their first month is spent on the worst-converting traffic in the practice. Pausing the dead campaigns is a prerequisite for the role landing well, not a separate marketing task.
25. **The re-engagement multiple.** An existing patient getting back in touch converts at 57.8% and is worth £458. A genuinely new enquiry converts at 19.7% and is worth £154. Working the book is roughly **three times as productive per contact** as buying a new lead, which is the strongest argument in the data for §5.5b.

**For us**

21. Does the pre-consultation profile ship as a worksheet or a tool? The worksheet ships this month, the tool does not.
22. Can CareStack carry the complaint code cleanly, or does the log need to live elsewhere?

---

## 14. Where this goes next

Tim's sequence still governs the definition work, but the review call surfaced a
second workstream running on a different clock. See the rollout recommendation
for the full picture. In short:

1. **Definition** (desk work, no dependencies): journey → job descriptions → KPIs → manager scorecard → Pro Moves.
2. **Readiness** (staff preparation, and the thing Tim's sequence does not cover): the team is already asking about changes and has been told to wait.
3. **Systems** (longest lead times, least visibility): phone routing, CareStack, 32Co, block scheduling, Alcan HR.

**Timeline anchors as of 2026-08-13, with the trading calendar overlaid** *(CU)*:

| When | What | Trading |
|---|---|---|
| **17 Aug to 2 Sep** | **The late-summer lull. 2.4 weeks, footfall 80% of trend.** | Quietest stretch before the peak |
| ~4 to 6 weeks | Building complete, offices ready | Lands into the peak |
| ~4 weeks | New practice manager starts | Lands into the peak |
| **3rd week Sep to end Nov** | | **Peak trading. Value index 118 to 139, peaking early October.** |
| ~9 September | New therapist starts, ~3 month induction | Productive around the December trough |
| ~3 to 4 months | Millie potentially available Fridays | |
| **13 Dec to 9 Jan** | | **Deepest trough. Value 44% of trend, footfall 59%.** |
| TBC | Alcan HR systems, time clocks and related | |

**The risk this table makes obvious:** the building, the practice manager and the
therapist's induction all land in or just before the highest-earning weeks of the
year, for a team already unsettled after a colleague's exit. That concentration
is the single biggest threat to this working.

**The opportunity it makes obvious:** there is a clean **2.4-week window from 17
August** that sits immediately before the peak opens, and it is the quietest
footfall stretch of the autumn.

**One correction worth carrying into every conversation about timing.** August is
not a quiet month for *patients*. Footfall is flat all year, every month between
92 and 112 on the index. What drops in August and December is **value**, jointly
33% below trend. The workbook's own words: the practice "keeps seeing much the
same number of people but they commit to far less treatment. That is a conversion
problem in those weeks, not a demand problem."

Which means August's weakness *is the thing the TCO model fixes*. Training now is
not filling dead time. It is working on the exact deficiency the quiet months
expose.

*(Statistical honesty: August and December are significant only when taken
together, p = 0.026. Individually neither reaches significance, August p = 0.16,
and the omnibus test across all twelve months fails at p = 0.41. Three and a half
years is a short series. The day-of-week effect is both larger and far more
certain than any month effect.)*
