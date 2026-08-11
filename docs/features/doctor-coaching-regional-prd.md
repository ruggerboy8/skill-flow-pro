# Regional Clinical Coach PRD

**Status:** v0.1 draft, 2026-08-11. Companion to
`doctor-coaching-regional-adjustments.md` (the agreed recommendations; that
doc holds context and decisions, this one holds build specs).
**Working method:** piece by piece, in the sequence at the bottom. Each
section ends with numbered questions for John; a section is buildable once
its questions are answered. Follow conservative migration practice: build new
alongside old, never break the live paths (8 live sessions, 3 meeting
records, 6 coach baselines as of 2026-08-11).

Grounding facts used throughout: `coaching_sessions` already carries
`session_type` ('baseline_review' | 'follow_up'), `sequence_number`,
`scheduled_at`, `meeting_link`, `coach_note`, `doctor_note`. Meeting output
lives in `coaching_meeting_records` (`summary`, `experiments` jsonb max 3,
`prior_action_status` jsonb, `calibration_confirmed`, doctor confirmation
fields). Coach assignment is `doctor_coach_assignments` (derived role, no
flag). Frontend ships via Lovable publish; DB changes must lag deployed code.

---

## A. Copy and terminology sweep

**Purpose:** the product's language predates regional coaches. Fix the spots
where it is now wrong or trust-eroding.

**Spec:**
1. Coach baseline visibility copy. `CoachBaselineWizard` ("This is visible
   only to clinical directors.") and the `DoctorDetail` sheet ("Your read of
   where this doctor stands. Visible only to clinical directors.") become:
   "Visible only to you, the clinical directors, and this doctor's assigned
   coaches. Never visible to the doctor."
2. `DoctorCoachesCard` empty state ("the clinical directors coach
   {doctorName}") stays, it is still accurate when no coach is assigned.
3. Welcome letter fallback signature "Your Clinical Director" becomes "Your
   Coach" when the inviter is a regional coach (we know the inviter; this is
   conditional copy, not a schema change).
4. Doctor-facing disclosure of the coach baseline. One added paragraph in
   the doctor's baseline welcome letter, draft:
   > "One more thing: I'll be completing my own version of this assessment
   > based on what I've observed working alongside you. That's not a report
   > card, it's how I prepare, so our first conversation starts from real
   > observations instead of guesses."
5. Roster header "Clinical Director Portal" (`DoctorManagement`) becomes
   role-aware: "Clinical Director Portal" for CDs/super admins, "Coaching
   Portal" for regional coaches.

**Data:** none. **Risk:** none, copy only.

**Questions for John:**
- **Q1.** Approve or edit the disclosure paragraph above (item 4). It rides
  in the inviter-signed welcome letter, so it reads as the coach's voice.
- **Q2.** Does "Regional Clinical Coach" need to appear as a visible label
  anywhere in-app right now (badges, roster), or is it organizational
  vocabulary only for this round?

## B. Coach baseline: guided prep ritual

**Purpose:** turn the wizard from a rating instrument into a taught process,
so a first-time coach does it the way Alex and Casey would.

**Spec:**
1. A "Before you start" intro step, first time a coach opens the wizard for
   a doctor (dismissable, re-openable from a help icon). Content, three
   short beats:
   - Why: your read grounds the first conversation in observation, not the
     doctor's self-story.
   - The gap runs both directions: experienced doctors tend to overrate
     (they've stopped seeing their habits); newer doctors tend to underrate
     (they haven't calibrated to how good they are). Your job differs
     accordingly: sometimes gently introduce reality, sometimes build
     confidence with evidence.
   - Rate only what you've observed. If you haven't seen it, mark N/A and
     plan to watch for it chairside. Don't rate from reputation.
2. Same guidance available as a collapsible panel inside the wizard.
3. Strengthen the existing soft nudge for the FIRST session only: if a
   baseline_review session is being prepped and the coach's baseline is not
   started, the prep composer shows a prominent (but skippable) callout
   rather than the current one-line tip. No hard gate (R1.3 removed the
   gate deliberately; we keep that).

**Data:** none required if the intro is per-device dismissal; a
`coach_baseline_assessments.intro_acknowledged_at` column if we want it
per-coach-per-doctor. Default: per-device, no schema change.

**Questions for John:**
- **Q3.** Approve the three-beat guidance content (I'll write full copy for
  your edit before build).
- **Q4.** Confirm: strong skippable callout before the first session, no
  hard gate. Yes/no.

## C. One-time baseline comparison artifact

**Purpose:** the self baseline and observed baseline exist to be compared,
once, to seed the first coaching conversation and the initial focus items.

**Spec:**
1. New coach-facing view "Baseline Review Prep," reachable from
   `DoctorDetail` and from the prep composer of a `baseline_review` session.
   Available when the doctor's self-baseline is completed; richer when the
   coach baseline is also complete (until then it shows self-only with a
   nudge back to item B).
2. Content: per-domain side-by-side (self vs observed), ranked gap list
   (largest |self − observed| first, both directions labeled: "sees it
   differently than you do" covers over- AND under-raters), the doctor's
   flagged domains from the gut check, and the doctor's free-text
   reflection.
3. Coach-facing only. The doctor never sees observed scores (per the
   disclosure stance in A: they know it exists, they don't see numbers).
4. From this view the coach can seed initial focus items (section D): pick
   2-3 Pro Moves, which pre-populate as DRAFT focus items to be confirmed
   with the doctor in the meeting.
5. After the baseline review session is confirmed, this view is not part of
   the recurring loop. Later prep composers instead show a compact "From
   your baseline review" panel: the focus items born there plus any gaps
   the coach starred as "revisit later."
6. Computed live from the two baselines; no snapshot table. The durable
   outputs ARE the focus items and starred gaps.

**Data:** `doctor_focus_items` covers seeded picks (section D). Starred
"revisit later" gaps need a tiny table:
`baseline_review_stars (id, doctor_staff_id, coach_staff_id, pro_move_id,
created_at)`, or fold into focus items as status='parked'. Preference:
fold into focus items as 'parked' (one concept, not two).

**Questions for John:**
- **Q5.** Comparison is coach-eyes-only, doctor never sees observed scores,
  the conversation carries the substance verbally. Confirm.
- **Q6.** OK to fold "revisit later" gaps into focus items as a 'parked'
  status rather than a separate mechanism?

## D. Focus items: longitudinal growth containers

**Purpose:** replace session-scoped picks-and-action-steps with containers
that persist across sessions and carry the arc of the coaching.

**Spec (lifecycle):**
- **Draft** (proposed, e.g. seeded from baseline review, not yet discussed)
  → **Active** (confirmed together in a session) → **Retired** (outcome:
  "Landed" when what-good-looks-like is consistently observed, or "Set
  aside" when jointly deprioritized). Plus **Parked** (per C, identified
  but not yet worked). Simpler than Ariyana's four-stage pipeline because
  the communication step happens in the meeting itself.
- Each item: one Pro Move + a short plain-language statement (the friendly
  "what we're seeing / why this one" text, working name pending Q7), author,
  origin session.
- Interventions: the existing `experiments` (max 3 per meeting) gain an
  optional link to a focus item. Experiments remain the unit of "what to
  try before next time"; focus items are the unit of "what we're working
  on."
- Narrative status only: at each prep, the doctor marks each Active item
  going-well / working-on-it / not-started with an optional note (extends
  the existing prior-action mechanic, which stays for unlinked
  experiments). No re-rating.
- Advisory soft cap: opening a 4th Active item shows "More than three focus
  items is hard to focus on." Never blocks.
- Session-open ritual: `DirectorPrepComposer` renders Active items (with
  the doctor's latest statuses) as the standing first agenda block;
  `MeetingOutcomeCapture` offers per-item actions: keep, retire, add
  experiment.

**Data (new tables, additive, no changes to live ones):**
- `doctor_focus_items`: id, doctor_staff_id, coach_staff_id, pro_move_id,
  statement text, status ('draft'|'parked'|'active'|'retired'),
  retired_outcome ('landed'|'set_aside') null, origin_session_id null,
  activated_at, retired_at, created_by, timestamps.
- `doctor_focus_item_updates`: id, focus_item_id, session_id null,
  progress ('going_well'|'working_on_it'|'not_started'), note text null,
  created_by, created_at.
- `coaching_meeting_records.experiments` jsonb entries gain optional
  `focus_item_id` key (jsonb, no migration needed; writer change only).
- RLS mirrors coaching_sessions: doctor reads own; CDs org-wide; assigned
  coaches via `is_assigned_doctor_coach()`.
- No backfill of the 3 existing sessions' experiments; history stays as-is.

**Doctor visibility:** Active focus items and their statements appear on the
doctor's side (DoctorHome or Coaching History) since they are co-owned by
design.

**Questions for John:**
- **Q7.** Naming, the big one. The container ("Focus Item"? "Growth Focus"?
  "Working On"?) and the statement field's label ("Starting point"? "What
  we're seeing"? "Why this one"?). I can propose a short list with copy
  mockups if useful.
- **Q8.** Statement authorship: coach drafts before/during the meeting and
  the doctor sees the final text (no formal doctor confirmation step), or
  do you want an explicit doctor acknowledgment on each item?
- **Q9.** Can items exist without a Pro Move (free text, like Ariyana's lay
  items), or is a Pro Move always required? My lean: always a Pro Move for
  doctors, since the library defines the track.
- **Q10.** Doctor-side visibility as specced (active items + statements
  visible to the doctor): confirm.

## E. Cadence: close the loop, surface drift

**Purpose:** gentle consistent pressure needs a pulse. Today a pair can
silently drift for months.

**Spec:**
1. At `MeetingOutcomeCapture` submit, an optional "When will you meet next?"
  date field. If set, it creates the next `follow_up` session row with
  `scheduled_at` (and `sequence_number` incremented). Skippable with one
  tap ("We'll schedule later").
2. Roster (`DoctorManagement`) gains a "Last session" column (max meeting
  record submitted_at per doctor) with a quiet indicator:
  - fresh: within 4 weeks (healthy = 2-3 weeks ideal, monthly minimum)
  - drifting: 4-6 weeks, amber dot + "5 weeks since last session"
  - stale: over 6 weeks, stronger visual weight, still just informational
3. Same chip on `DoctorDetail` header. No emails, no notifications in this
  round.
4. Doctors with zero sessions show "Not started" rather than an alarm.

**Data:** none new; derived from existing tables. (The Ana case, a
doctor_prep_submitted session sitting 3+ weeks with scheduled_at null, is
exactly what the indicator will catch.)

**Questions for John:**
- **Q11.** Threshold check: fresh under 4 weeks, drifting 4-6, stale past 6.
  Adjust?
- **Q12.** Who sees the drift indicators: just the assigned coach, or also
  CDs on their org-wide roster (light-touch oversight without a workflow)?

## F. Coach self-rating after each session

**Purpose:** the cheapest deliberate-practice mechanism for the coaching
skill itself.

**Spec:**
1. After outcome capture submits, a 30-second reflection card: five 1-5
  scales plus one optional free-text line ("Anything you'd try differently
  next time?"). Skippable, one tap.
2. Starter scales (generic positive-coaching behaviors, house dimensions
  come later):
  1. Talk balance: "Who did most of the talking?" (mostly me → mostly them)
  2. Ask vs tell: "Was I more directive or more curious?" (telling → asking)
  3. Candor: "How honest was I about what I'm seeing?" (guarded → candid)
  4. Specificity: "How concrete were the next steps we left with?" (vague →
     could picture them)
  5. Continuity: "How well did we build on last session?" (started fresh →
     picked up the thread)
3. Private to the coach by default (pending Q14). A simple personal trends
  sparkline on their portal later, not this round.

**Data:** `coach_session_reflections`: id, session_id (unique),
coach_staff_id, r_talk, r_ask, r_candor, r_specificity, r_continuity
(smallint 1-5, all nullable so partial submits save), note text null,
created_at. RLS: owner-only read/write (widen later if Q14 says so).

**Questions for John:**
- **Q13.** React to the five starter scales and their anchor wordings.
- **Q14.** Privacy: coach-private (my default), or CD-visible? Coach-private
  maximizes honesty; CD-visible gives Alex and Casey passive signal. Could
  also start private and revisit.

## G. Plumbing and tightenings

**Spec:**
1. `coaching_meeting_records.raw_transcript` (text null): when a coach
  pastes a transcript into outcome capture's AI generator, persist it.
  Backfills nothing (0 transcripts exist). Display: collapsed "Transcript
  on file" section on the record, coach/CD-visible only, not doctor-visible.
2. `notify-meeting-summary` edge function: require the caller to be an
  assigned coach FOR THAT DOCTOR (mirror invite-to-schedule's check).
3. Findings from the 2026-08-11 flow re-audit, triaged. Verified against the
  live DB and code on 2026-08-11 unless marked otherwise.

  **Blockers (verified):**
  - **G3a. Edit Agenda silently wipes the existing agenda.**
    `DirectorPrepComposer.tsx:324` hydrates `selectedActions`/`coachNote` in
    a `useState` initializer, which runs once before the session and
    existing-selections queries resolve and never re-runs. Opening a
    published agenda shows an empty editor; Save draft or Send then deletes
    the prior selections and overwrites `coach_note`. Fix: proper effect
    hydration keyed on data arrival, plus don't-clobber guards.
  - **G3b. Meeting-record write paths contradict each other.** Live DB has
    NO unique constraint on `coaching_meeting_records.session_id` (verified;
    0 duplicate rows so far). `DirectorPrepComposer` upserts with
    `onConflict: 'session_id'`, which errors 42P10 without the constraint
    (after the session status update has already succeeded: half-published
    session). `MeetingOutcomeCapture` INSERTs unconditionally, so duplicates
    are possible, which would break every `.maybeSingle()` reader. Fix: add
    the unique constraint (safe now, zero duplicates) and make capture an
    upsert.
  - **G3c. RLS: any authenticated staff can create and manage a coaching
    session for any doctor, cross-org**, by naming themselves coach.
    Verified live: "Coach can manage own sessions" is FOR ALL with
    `with_check` null, so WITH CHECK defaults to the USING clause
    (`coach_staff_id` = self), which any staff row satisfies on INSERT.
    Fix: WITH CHECK requiring self AND (clinical director in-org, assigned
    doctor coach for that doctor, or super admin).
  - **G3d. `invite-to-schedule` doesn't validate the session belongs to the
    doctor** (it flips whatever `session_id` is passed, via service role,
    no status guard), and its CD check has no org scope. Fix: verify
    session.doctor_staff_id matches, and org-scope the CD check.
  - **G3e. `notify-meeting-summary`** (the known gap, worse than thought):
    qualifies any caller who coaches anyone, and also anyone with
    `staff.is_coach` (RDA-line coaches). Fix: require CD-in-org, assigned
    coach for that session's doctor, or super admin.

  **Design decision needed (verified unreachable):**
  - **G3f. The revision loop is a promise with no implementation.** The
    summary email and capture copy tell doctors they can request a
    revision; no UI writes `doctor_revision_requested` or
    `doctor_revision_note`, and if the status ever occurred both sides
    dead-end (doctor gets an editable prep form whose resubmit is blocked
    by RLS status lists; coach gets "Start Meeting"). Either build the
    small revision loop (doctor: "request a change" with a note; coach:
    respond and re-notify) or remove the promise from the email. See Q17.

  **Smaller confirmed defects (fix opportunistically or alongside D/E):**
  - **G3g.** Capture overwrites `scheduled_at` with now-at-writeup, so "Met
    on" dates are wrong; and `MeetingConfirmationCard` formats a null
    `scheduled_at` as Jan 1 1970. Fixing this properly merges into E
    (cadence), which makes dates first-class.
  - **G3h.** Prior-action resurfacing asymmetry: CD prep pulls only
    `doctor_confirmed` prior sessions; doctor prep also includes
    `meeting_pending`. An unconfirmed summary hides its action steps from
    the coach's next agenda while the doctor is asked to report on them.
    Align both on confirmed + meeting_pending. (Supersedes nothing; D's
    focus items will replace this mechanic longer-term.)
  - **G3i.** `prior_action_status` is written at prep but displayed nowhere
    (only reader is the orphaned `DoctorGrowthTimeline`). Resolved by D.
  - **G3j.** `invite-to-schedule`'s create-session fallback writes
    `session_type: 'followup'` while all client checks use `'follow_up'`.
    Path appears uncalled today; fix the string.
  - **G3k.** Experiments max-3 is client-side only; add a DB CHECK when
    convenient.
  - **G3l.** DoctorHome "Current Focus" merges experiments from ALL
    confirmed and pending sessions, accumulating superseded action steps.
    Largely resolved by D (focus items become the doctor's current-focus
    source); interim fix: latest session only.
  - **G3m.** Doctor history counts `meeting_pending` as completed with a
    checkmark; and "View Full Record" on a confirmed session routes to a
    prep view that shows less than the history card itself.

  **UX quick wins (batch with A):** "Start Meeting" label shows while
  status is "Awaiting doctor's response"; CD-voiced next-action strings
  reused in the doctor's own status pill ("Schedule next session" shown to
  the doctor about themselves); invite email default says "Select 1-2 Pro
  Moves" while the UI enforces exactly 1; coach side says "Check-in N",
  doctor side "Follow-up N" for the same session; status config hardcodes
  Tailwind colors against the token rule; dead components to delete
  (`DoctorNextActionPanel`, `MeetingScheduleDialog`, `NotifyDoctorDialog`,
  `DoctorGrowthTimeline`); chevron-less rows still expand.

**Questions for John:**
- **Q15.** Transcripts may name patients. Comfortable storing them in the
  DB under the same RLS as meeting records (UK org makes this a GDPR
  question eventually), or would you rather we not persist them until
  there's a retention policy? Middle option: persist for Alcan orgs only.
- **Q17.** The revision loop (G3f): build the small honest version (doctor
  can request a change with a note, coach responds and re-notifies), or
  strip the promise from the email and keep confirm-only?

## H. Self-directed coach learning resources

**Purpose:** the self-accessed shelf behind the just-in-time guidance.

**Spec (MVP):**
1. A "Coaching Guide" page in the clinical portal nav, visible to CDs and
  regional coaches. Six short in-app articles (markdown, no CMS):
  - Your first coaching conversation
  - Reading the baseline comparison (both directions of the gap)
  - Asking before telling
  - Saying the hard thing kindly
  - Building experiments that actually happen
  - Keeping the thread between sessions
2. Contextual links from the surfaces built in B-F ("More on this" links
  into the relevant article).
3. I draft all six from established coaching practice in the platform's
  voice; John (and optionally Alex/Casey) review before publish.
4. Static content in the repo this round; a CMS or the resources system
  later if it earns it.

**Questions for John:**
- **Q16.** Approve the six-article list (add/cut topics?), and who reviews
  drafts: just you, or Alex and Casey too?

---

## Build sequence (piece by piece)

Each piece ships independently; DB changes land after the Lovable publish of
the code that reads them, per house rule.

1. **G2** notify-meeting-summary tightening (no questions needed, pure fix)
2. **A** copy sweep (needs Q1-Q2)
3. **E** cadence (needs Q11-Q12; small, high visibility for Wednesday+)
4. **B** coach baseline guidance (needs Q3-Q4 + copy review)
5. **C** baseline comparison artifact (needs Q5-Q6; depends on D's table
   for seeding, so D's migration may land first even if D's UI comes later)
6. **D** focus items (needs Q7-Q10; the big one)
7. **F** coach self-rating (needs Q13-Q14)
8. **G1** transcript persistence (needs Q15)
9. **H** coaching guide (needs Q16; content can be drafted in parallel any
   time)

## Out of scope (restated from the adjustments doc)

Doctor re-assessment cycle, re-rating as impact measurement, coach-the-coach
review workflows, independent doctor Pro Moves experience, any change to the
weekly participant loop.
