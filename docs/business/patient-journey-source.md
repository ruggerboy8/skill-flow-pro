# Patient Journey Audit Tool — Handoff Document

## Organization Context

**Alcan Dental Cooperative** is a dentist-owned pediatric dental cooperative approaching 15 locations. There is wide variance across locations in how the patient journey is executed. This project standardizes the patient journey into a single observable framework that staff can learn from and managers can audit against.

Alcan has an existing coaching and competency platform called **Skill Flow Pro** that uses a framework called **Pro Moves** — discrete, observable behaviors that define excellence in a dental practice role. Each Pro Move belongs to one of four domains (Clinical, Clerical, Cultural, Case Acceptance) and is assigned to a specific role (Front Desk, Dental Assistant, Doctor, Office Manager). Staff practice 3 Pro Moves per week with self-assessments; coaches conduct quarterly evaluations.

The patient journey work connects directly to Pro Moves. Where a journey checkpoint maps to an existing Pro Move, the audit tool should surface that connection so coaching conversations tie back to the development system.

---

## What We're Building

A **mobile-first, web-based audit tool** that an office manager uses to follow a single patient through the full journey — from check-in to checkout — scoring binary checkpoints at each stage.

There are two related experiences:

1. **Learning Guide** — an educational reference that explains the patient journey standard. Organized by stage, each stage shows: What It Looks Like, What It Sounds Like, What It Doesn't Look Like, What It Doesn't Sound Like, and Connected Pro Moves. This is for staff to study. A working prototype exists (patient-journey.jsx).

2. **Audit Tool** — the interactive scoring instrument. An office manager follows one patient through the journey, marking each checkpoint as observed (pass) or not observed (fail). Binary scoring only — if it's not fully to standard, it's not performed. This is the primary deliverable. A working POC exists (patient-journey-audit.jsx).

---

## The Patient Journey — 5 Stages

### Stage 1: Check-In
**What happens:** Family arrives at the lobby. Front desk greets, verifies paperwork, offers hospitality, previews the doctor, and changes patient status.

**Primary role:** Front Desk

**Observable checkpoints:**
- Staff stood up to greet patient and guardian
- Greeted patient and guardian by name with eye contact
- Offered hospitality (beverage, play area) before returning to other tasks
- Confirmed forms and paperwork completion verbally with guardian
- Previewed the doctor by name and mentioned a specific positive detail

**Key anti-patterns to catch:**
- Greeting patients while seated / looking at screen
- Marking patient as "Checked In" before confirming forms
- Moving on to other tasks before completing the welcome

**Example script (what it sounds like):**
"Welcome in, Jessica! And this must be Johnny — we're so glad you guys are here today. Can I get you a coffee or water? You'll be seeing Dr. Patel today — she did her residency at Children's Hospital in Baltimore. You're going to love her."

---

### Stage 2: Transition to Chair
**What happens:** Patient moves from lobby to exam room. Front desk alerts clinical team; assistant comes to lobby to pick up the patient personally.

**Primary roles:** Front Desk handing off to Dental Assistant

**Observable checkpoints:**
- Front desk verbally notified clinical team immediately after check-in
- Assistant came to the lobby to greet patient (not called from hallway)
- Assistant greeted patient by name and introduced themselves
- Wait time from check-in to pull-back was under 10 minutes

**Key anti-patterns to catch:**
- Patient's name shouted from the hallway
- Clinical team didn't know patient was checked in
- Patient waiting 10+ minutes with no acknowledgment

**Example script:**
"Hey Jordan, Johnny Martinez is checked in and ready — he's in for a filling follow-up, upper right. Mom is Jessica."
(then from assistant in lobby:) "Hi Johnny! I'm Jordan, I'll be taking care of you today. Mom, you're welcome to come on back with us."

---

### Stage 3: Chair (Exam Room)
**What happens:** Everything inside the exam room — assistant prep, doctor entrance, treatment discussion, and clinical work. This is the densest stage.

**Primary roles:** Dental Assistant + Doctor

**Observable checkpoints:**
- Assistant used Tell, Show, Do before each action on the patient
- Warm handoff: assistant presented patient to doctor IN the room, in front of family
- Warm handoff included: patient name, guardian name, age, reason for visit, relevant history
- No private conference — doctor was NOT briefed outside the room
- Doctor asked parent about their priorities before presenting treatment
- Doctor confirmed a clear, agreed-upon treatment plan before leaving the room

**Critical standard — the warm handoff:**
This is a non-negotiable. The assistant does NOT step out to privately brief the doctor. Instead, the doctor enters the room and the assistant performs the full case presentation in front of the family:

"Dr. Alex, this is Johnny and his mom Jessica. Johnny is five — he's been with us before but hasn't seen you yet. We're looking at the upper right quadrant today. Johnny mentioned a little bit of pain. No changes to medical history, and I've already taken a couple of X-rays."

The anti-pattern is the private hallway conference: "Doctor, can I talk to you outside for a second?" This undermines family trust and breaks transparency.

**Key anti-patterns to catch:**
- Assistant stepping out to brief doctor privately
- Doctor entering room with no context — "So... what are we doing today?"
- Procedures performed without Tell, Show, Do
- Family leaving room without a clear plan

---

### Stage 4: Chair to Checkout (Transition)
**What happens:** Post-treatment instructions delivered, clinical team communicates summary to front desk, assistant walks family to checkout and introduces them to front desk staff.

**Primary roles:** Dental Assistant handing off to Front Desk

**Observable checkpoints:**
- Assistant gave clear post-op instructions to guardian before leaving the chair
- Assistant communicated treatment summary to front desk BEFORE family arrived at checkout
- Assistant physically walked the family to the front desk (not just pointed)
- Assistant introduced family to front desk staff by name

**Key anti-patterns to catch:**
- Family wandering to front desk unescorted
- Post-op instructions skipped or rushed
- Front desk had no idea what treatment was performed

**Example script:**
"Johnny did great! He's going to be numb on this side for about an hour — totally normal. Once that wears off, he can eat and drink like usual. If anything feels off, give us a call right away."
(then walking up:) "Maria, this is Jessica and Johnny — Johnny did awesome today. They're all set for checkout."

---

### Stage 5: Checkout
**What happens:** Next appointment scheduled, financials communicated clearly, warm personalized goodbye.

**Primary role:** Front Desk

**Observable checkpoints:**
- Next appointment was scheduled BEFORE discussing financials
- Any balance or copay was explained clearly and with empathy
- Visit ended with a genuine, personalized goodbye using the family's name

**Key anti-patterns to catch:**
- Family leaving without next appointment scheduled
- Balance stated with no context or empathy — "You owe $45."
- Impersonal or transactional goodbye

**Example script:**
"Let's get Johnny's next visit on the calendar — Dr. Patel recommended we see him back in about six months. Does Tuesday or Thursday morning work better?"
"For today's visit, your insurance covered the cleaning and X-rays. The filling has a small copay of $45 — would you like to take care of that today?"

---

## Content Architecture — Per-Stage Content Model

Every stage follows this consistent structure:

| Content Block | Purpose | Used In |
|---|---|---|
| **The Standard** | One-sentence description of what this stage accomplishes | Learning Guide + Audit |
| **Observable Checkpoints** | Binary pass/fail items an observer can see or hear | Audit Tool |
| **What It Looks Like** | Observable behaviors — what a coach would see | Learning Guide |
| **What It Sounds Like** | Actual scripts staff should use | Learning Guide + Audit (expandable) |
| **What It Doesn't Look Like** | Anti-patterns — bad habits being replaced | Learning Guide + Audit (collapsed reference) |
| **What It Doesn't Sound Like** | Language that signals a missed standard | Learning Guide |
| **Key Roles** | Who owns this moment, who supports | Both |
| **Connected Pro Moves** | Links to specific Pro Moves from the library | Both |
| **Observer Notes** | Free-text per stage for debrief | Audit Tool |
| **Media** | Supporting video, images, audio (placeholder slots) | Learning Guide |

---

## Design Decisions (Confirmed)

- **Audience for audit:** Office manager. Provide more context rather than less, but don't make it busy.
- **Flow:** Following a single patient through the journey, stage by stage. Not posting up at one station.
- **Scoring:** Binary only. If it's not fully to standard, it's not performed. Even subjective things like scripting are scored as did/didn't.
- **Observability:** Only include things an observer can directly see or hear. "Checked the patient memo" is NOT observable from across the room. "Stood up to greet" IS observable.
- **Data persistence:** For the POC, state persists in-session only. Summary report page at the end. No backend required yet.
- **Pro Moves connection:** Where a checkpoint maps to an existing Pro Move, surface that connection. In the audit report, missed checkpoints with Pro Move connections should aggregate into a "Coaching Focus" section that recommends which Pro Moves to prioritize next.
- **Mobile-first:** Optimized for phone use (office manager walking around with their phone). Must work on desktop too.

---

## Pro Moves Connections (from existing library)

These are confirmed mappings between journey checkpoints and existing Pro Moves:

### Check-In
| Checkpoint | Pro Move ID | Competency |
|---|---|---|
| Staff stood up to greet | 1 | Welcoming Presence |
| Greeted by name with eye contact | 1 | Welcoming Presence |
| Offered hospitality | 3 | Communication Balancing |
| Confirmed forms | 2 | Patient Record Maintenance |
| Previewed doctor | 15 | Establishing Credibility |

### Transition to Chair
| Checkpoint | Pro Move ID | Competency |
|---|---|---|
| Notified clinical team | 4 | Patient Flow Coordination |
| Assistant came to lobby | 20 | Trust Building Interactions |
| Greeted patient by name | 20 | Trust Building Interactions |
| Under 10 min wait | 17 | Patient Flow Coordination |

### Chair
| Checkpoint | Pro Move ID | Competency |
|---|---|---|
| Tell, Show, Do | 22 | Patient Comfort and Communication During Procedures |
| Doctor asked parent priorities | 4035 | Values-First Discovery |
| Clear treatment plan before leaving | 4039 | Clear Options to Clear Plan |

### Chair to Checkout
No existing Pro Move connections. This is a content gap — the handoff behaviors (post-op instructions, walk-up, baton pass to front desk) don't have corresponding Pro Moves in the current library.

### Checkout
| Checkpoint | Pro Move ID | Competency |
|---|---|---|
| Asked about visit goals | 9 | Trust Building Interactions |

---

## Audit Report Structure

The report page (shown after completing the audit) includes:

1. **Header** — patient name, location, observer, date/time
2. **Overall score** — percentage ring (passed checkpoints / total checkpoints)
3. **Per-stage breakdown** — each stage shows a progress bar, percentage, list of missed items with connected Pro Moves, and observer notes
4. **Coaching Focus section** — aggregates all missed Pro Moves into a single list with the recommendation: "Consider prioritizing these in upcoming weekly queues"

Color coding:
- 100% = green
- 60-99% = amber
- Below 60% = red

---

## Existing Prototypes

Two working React (JSX) prototypes have been built:

1. **patient-journey.jsx** — the learning guide. Swipeable mobile-first experience with accordion sections for each content block. Media placeholder slots for video/image/audio.

2. **patient-journey-audit.jsx** — the audit tool POC. Binary scoring with expandable script references and Pro Move connections per checkpoint. Anti-pattern reminders collapsed under a flag icon. Notes field per stage. Summary report page with coaching focus section.

Both use DM Sans (body) and Fraunces (headings). Both are constrained to 480px max-width for mobile optimization. Navigation is via numbered dots with back/next buttons and swipe support.

---

## Known Gaps and Next Steps

1. **Content from clinical director:** The checkpoint language, scripts, and anti-patterns in the POC are educated approximations. The clinical director needs to sharpen and finalize all content.

2. **Transition stages (2 and 4) are thin on Pro Move connections.** May need new Pro Moves written for handoff moments.

3. **Checkout stage is thin overall.** Only 3 checkpoints. The clinical director may identify additional observable checkout behaviors.

4. **No backend yet.** The POC persists state in React state only. Future build will need persistent storage, likely Supabase, for audit records and reporting.

5. **No role-specific filtering.** Currently the audit covers all roles at every stage. A future version could allow filtering to "just watch the front desk" or "just watch the assistant."

6. **No staff identification.** The audit doesn't currently capture WHICH front desk person or WHICH assistant was observed. This matters for connecting audit results to individual Pro Move coaching.

7. **Brand tone:** Alcan's brand is warm, conversational, human. Calibrated to phrases like "we've got your back." Avoid corporate register. Avoid em dashes (Johno has flagged these as a detectable LLM signal — use periods, commas, or restructured phrasing instead).

---

## Source Data

The Pro Moves library is available as a CSV (promoveslibrary20260320.csv) with the following structure:
- action_id, role_name, domain, competency_name, text, description, resources_url, intervention_text, script, active
- 200 rows across 4 roles (Front Desk, Dental Assistant, Doctor, Office Manager)
- 4 domains per role (Clinical, Clerical, Cultural, Case Acceptance)
- The "text" field contains the "I always..." statement (the Pro Move itself)
- The "description" field contains a coaching-voice explanation
- The "script" field contains example dialogue where applicable

A platform summary document (ProMoves_Platform_Summary) describes the Skill Flow Pro platform architecture including weekly self-assessment cadence, quarterly evaluations, check-in/check-out meeting structure, and intended organizational impact.
