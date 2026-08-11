# Regional Clinical Coach: recommended platform adjustments

**Status:** pre-PRD recommendations, agreed in dialogue with John on 2026-08-11.
**Context:** ProMoves' doctor coaching track was built for two clinical directors
(Dr. Alex, Dr. Casey) who carry the coaching craft in their heads. Starting
2026-08-12, affiliate doctors from partner practices begin onboarding as
**Regional Clinical Coaches** who coach doctors in their region. The first is a
practice owner coaching an associate at their own practice. The system encodes
what a good coaching session produces (mutual prep, one focus pick, max 3
action steps, warm summary, doctor confirmation) but nothing teaches how to
produce it. These adjustments close that gap.

**Organizational requirement (decided):** a Regional Clinical Coach must have
chair-side observation of the doctors they coach. This is a people-policy rule,
not a system rule, but the product's language should assume it.

**Next step:** turn this into a PRD, carefully. Nothing below is built except
item 0.

---

## 0. Hardcoded coach name — DONE

The baseline gut-check toast said "You can discuss these with Alex in your
check-in." Fixed to coach-neutral copy in commit `d9fb8905` (2026-08-11).
Needs a Lovable publish. This was the only hardcoded director name in the
codebase; the baseline welcome letter already signs with the inviter's name.

## 1. Copy and terminology sweep

Small, high-trust-impact wording fixes:

- Introduce **"Regional Clinical Coach"** as the official title (decided).
- The coach baseline currently says "visible only to clinical directors" in
  two places (`CoachBaselineWizard`, `DoctorDetail` sheet). Assigned doctor
  coaches now read it too. Reword to be honest about who sees it.
- **Disclose the coach baseline to doctors (decided in principle).** The
  doctor should know their coach completes an observed baseline, and that its
  purpose is preparation for the coaching conversation, not evaluation. They
  do not see the scores. Exact copy is a PRD question.
- Welcome-letter fallback signature "Your Clinical Director" should account
  for regional coaches.

## 2. Coach baseline: make it a guided prep ritual

**Decided:** the private observed baseline is an important process the coach
goes through before their first coaching conversation. The wizard currently
gives ratings + optional voice notes and zero guidance.

Add in-flow instruction (short panel or first-run step) that states the why:

- Your read exists so the first conversation is grounded in observation, not
  the doctor's self-story.
- The gap runs both directions: experienced doctors tend to overrate
  themselves (they've stopped seeing their habits); new doctors tend to
  underrate (they haven't calibrated to how good they are). Sometimes the
  coach's job is to gently introduce reality, sometimes to build confidence
  with evidence.
- If you haven't observed a Pro Move, mark N/A and plan to watch for it.
  Don't rate from memory or reputation.

## 3. Baseline comparison as a first-class prep artifact

The system's best data asset for seeding a session (self baseline vs observed
baseline over the same Pro Move set) is currently buried. Surface a
side-by-side comparison with the biggest gaps highlighted, feeding directly
into agenda building in `DirectorPrepComposer`. This also helps a new coach
identify the first several Pro Move priorities for their doctor.

## 4. Focus items: longitudinal growth containers

The biggest structural change. Today's primitives are session-scoped: the
doctor's one pick and the 3 action steps live inside one session and then
evaporate into history. What we want is a container that persists across
sessions, philosophically modeled on Ariyana's issues workspace
(`coaching_issues` pipeline), not necessarily the same build.

Shape of a focus item:

- A Pro Move the coach and doctor **choose together**.
- A plain-language statement of what we're seeing today and why we're
  focusing here. **Naming is open:** NOT "deficiency statement"; needs
  friendlier, more explicit language (candidates for the PRD: "starting
  point," "what we're seeing," "why this one").
- Interventions (the action steps constructed in coaching conversations)
  attach to it over time.
- **Impact tracking is narrative status only for now (decided):** the
  going-well / working-on-it style, not re-rating the Pro Move. Re-rating
  comes later (see item 7).
- Retirement: `doctor_good_looks_like` on each doctor Pro Move already
  defines observable mastery. A focus item closes when what good looks like
  is what you consistently see.
- **Soft limit (decided):** no hard cap. Advisory nudge when opening a 4th:
  more than three focus items is hard to focus on.
- **Session-open ritual:** reviewing open focus items becomes the standing
  first agenda block of every session. Discuss what you talked about last
  time before you pick up anything new.

## 5. Cadence: close the loop, surface drift

**Decided rhythm:** healthy is at least once a month; ideal is every 2 to 3
weeks; twice a month at max. Roughly 1 to 2 sessions per month.

- Best case: closing a session captures the next session date. Won't always
  be possible, so it's encouraged, not required.
- Track and surface **time since last check-in** per coach-doctor pair (on
  the roster, visible to the coach). Gentle indicator when a pair drifts past
  about a month; no punitive mechanics. Gentle consistent pressure applies to
  coaches too.

## 6. Coach self-rating after each session

**Decided in principle.** A tiny reflective instrument at the end of outcome
capture. Free-text reflection alone won't work; coaches won't know what to
say. Instead, roughly five scale ratings on how they facilitated.

John is not ready to define the house coaching dimensions yet. Start with
broadly useful scales aligned with generally positive coaching behavior.
Candidates to react to in the PRD round:

1. **Talk balance** — who did most of the talking, me or them?
2. **Ask vs tell** — was I more open (questions) or more directive (answers)?
3. **Candor** — was I authentic about what I'm seeing, or guarded?
4. **Specificity** — did we leave with actions concrete enough to picture?
5. **Continuity** — did we start from last time's commitments?

Long-term frame: once the house dimensions are articulated, they become three
things at once: the self-rating instrument, the organizing spine of the coach
learning resources, and the vocabulary of just-in-time nudges. Effectively
Pro Moves for coaching. The dimensions should be distilled from how Alex and
Casey actually coach, which requires transcripts (see item 8).

Open question for PRD: are self-ratings private to the coach, or visible to
clinical directors? (Coach oversight is deliberately light touch; Alex and
Casey can't monitor coach quality actively.)

## 7. Doctor re-assessment cycle (roadmap, not now)

After roughly a quarter to half a year of coaching (give or take, at 1 to 2
sessions/month), the doctor retakes the self-assessment. That becomes the
first real growth measurement. Not in scope for this round; noted so the PRD
doesn't design against it. Related open area, explicitly unconsidered so far:
what the ongoing independent Pro Moves experience looks like for doctors
outside the coaching relationship.

## 8. Plumbing and tightenings

- **Persist meeting transcripts.** `coaching_meeting_records` has no
  transcript column; the paste-a-transcript feature feeds the AI summarizer
  and discards the raw text. Verified live 2026-08-11: 0 transcripts exist
  anywhere (3 meeting records, none with raw text;
  `coach_baseline_assessments.recording_transcript` empty on all 6 rows).
  Add a column and keep what's pasted. This is the raw material for
  distilling the house coaching model later.
- **`notify-meeting-summary` gate:** checks that the caller is *a* doctor
  coach but not that they're assigned to *that* doctor.
  `invite-to-schedule` checks correctly; mirror it.

## 9. Self-directed coach learning resources

A small, self-accessed library on coaching best practices for regional
coaches. General best practices are fine as a starting point; reorganize
around the house dimensions once they exist. Primary vehicle for pedagogy
remains just-in-time guidance in the flow (items 2, 3, 4), not a handbook.

---

## Explicitly out of scope for the PRD

- Coach-the-coaches review workflows (light touch is the decision).
- Re-rating Pro Moves as impact measurement (item 7 is the future shape).
- Independent doctor Pro Moves experience outside coaching.
- Any change to the weekly participant loop; the doctor track stays
  session-based.

## Open questions carried into the PRD

1. Naming: the focus item itself, and its "what we're seeing" statement.
2. Who drafts the focus item statement: written together in the meeting, or
   coach-drafted and doctor-confirmed?
3. Disclosure copy for the coach baseline (doctor-facing).
4. Coach self-ratings: private vs visible to clinical directors.
5. Where focus items live relative to today's `coaching_session_selections`
   and `experiments` (extend vs new tables), and migration of the 3 existing
   sessions' action steps.
