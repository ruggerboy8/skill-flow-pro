# Lovable Instructions: Clinical Director Coaching Flow — Clarity & Layout Pass

This is a focused cleanup of the **clinical director (CD)** experience for coaching a
doctor, from invite through the first review. The doctor-facing flow is in good shape and
is left mostly alone. The goal is to remove redundant status messaging, drop one hidden
gate, collapse a two-step publish into one, fix terminology drift, and reorder the doctor
detail page around the CD's actual order of work.

Design-system reminders (from `CLAUDE.md`): use `getDomainColor()` for domain colors and
the semantic CSS custom properties / `<StatusBadge />` for status — never hardcode Tailwind
color classes for semantic states. Use `text-2xs` for micro-labels. Icon sizes per the
table in `CLAUDE.md` (16px inline, 20px interactive, 24px section headers).

Send these in order; items 1–3 are the highest impact. Group at most a couple per Lovable
prompt.

---

## The intended CD flow (for context)

1. CD invites a doctor, optionally releasing the baseline at the same time.
2. Doctor takes their baseline self-assessment; CD reviews the results on the doctor's page.
3. CD optionally fills out their **own private baseline about the doctor** (internal, not shared).
4. CD **prepares** the first coaching session → **delivers** the prep to the doctor → doctor
   **reviews** → the session (scheduled review) happens → CD logs the outcome.

The build does all of this, but the CD currently sees the same state described three
different ways, hits a mandatory full-assessment gate before they can create the first
session, and has to publish then separately send. These changes fix that.

---

## 1. One status vocabulary, shown once per session (highest priority)

**Problem.** A single coaching session is currently described three ways on one screen,
each with different wording:
- the **journey pill** at the top of the doctor detail page (`src/lib/doctorStatus.ts`),
- the **session badge** on the session card (`src/lib/coachingSessionStatus.ts`),
- the **time/subtitle line** inside the card (`DoctorDetailThread.tsx` `SessionCard`).

And in the `/clinical` list table, one row shows the **Stage** column, a prose **Next Step**
column, and an **Action** button — three phrasings of the same state ("Ready for Prep" /
"Build your meeting agenda before inviting to schedule" / "Build Prep →").

**Fix.**

a) Make `SESSION_STATUS_CONFIG` in `src/lib/coachingSessionStatus.ts` the single source of
truth for the label of a given `session.status`. In `src/lib/doctorStatus.ts`, when the
journey status is derived from the latest session, reuse that exact label string rather than
introducing a second one. For example `session.status === 'scheduled'` should read as
**"Draft"** in both the pill and the badge — not "Session Draft" in one place and "Draft" in
another. Do the same for every session-derived state (`director_prep_ready`,
`scheduling_invite_sent`, `doctor_prep_submitted`, `meeting_pending`, `doctor_confirmed`,
`doctor_revision_requested`).

b) In `DoctorDetailThread.tsx` `SessionCard`, demote the time/subtitle line to a true
sub-detail. Keep at most **one** short line of context (e.g. "Awaiting doctor's response",
"Met on …") and remove the restated-status phrasings like
`'Draft — build agenda to proceed'`, `'Send invite to schedule'`, `'Awaiting scheduling'`.
The badge already says the status; the line under it should add information, not repeat it.

c) In the `/clinical` list table (`src/pages/clinical/DoctorManagement.tsx`), let the
**Action button be the next step**. Either drop the prose "Next Step" column and keep a
single clear action button per row, or keep "Next Step" and make the button a neutral
"Open →". Do not show Stage + Next Step + a differently-worded Action button all at once.

The CD should be able to read "where is this" in exactly one place, worded one way.

---

## 2. Make the CD's private baseline optional, not a hidden gate

**Problem.** `DoctorDetailThread.tsx:164` hides the "Add Baseline Review" button until the
coach baseline assessment is `completed`. But `doctorStatus.ts` was already softened (see the
`R1.3` comment) to tell the CD they are **"Ready for Prep — open the coaching thread to build
your meeting agenda."** So the status says "go ahead" while the thread refuses to let them
create a session until they've rated every Pro Move privately. The private assessment is, per
the product intent, *internal and optional context* — gating the entire first session behind
100% completion of it is too heavy.

**Fix.**

a) In `DoctorDetailThread.tsx`, show the "Add Baseline Review" button as soon as the
**doctor's** baseline is complete (`doctorBaselineComplete`), regardless of whether the coach
baseline is done. Change the guard on the add-session button from
`(sessions.length > 0 || coachAssessment?.status === 'completed')` to
`(sessions.length > 0 || doctorBaselineComplete)`.

b) Keep the "Start/Continue Coach Baseline Assessment" CTA as an **encouraged, optional**
action above it (it already renders). Keep the existing soft nudge from `doctorStatus.ts`
("Tip: Complete your private baseline assessment before the meeting for better prep.").

c) The private assessment's "Complete" button should not require all Pro Moves rated to be
*usable as prep input*. Leave the "Complete Assessment" gate as-is for marking it done, but
nothing downstream should be blocked on it.

After this change, the button layer and the status copy finally agree: when the CD is told
they're ready to prep, they can.

---

## 3. Collapse "prepare" and "deliver" into one motion

**Problem.** Building the agenda lands the session at `director_prep_ready` ("Agenda Ready"),
and sending is a *separate* "Invite to Schedule" action. If the CD closes the email composer
or saves a draft, the session parks at "Agenda Ready" and they must return later and click
again. The intended flow treats delivering the prep as the natural continuation of preparing
it.

**Fix.** In `DirectorPrepComposer.tsx`, make the primary publish action a single
**"Send to doctor"** that (1) publishes the prep/selections (status →
`scheduling_invite_sent`) and (2) sends the scheduling invite, opening `SchedulingInviteComposer`
inline with a sensible default email so editing is optional. Keep a secondary **"Save draft"**
for the not-ready case (no status change). Remove the intermediate stop from the happy path so
the common flow is: build agenda → Send to doctor → done.

Keep "Edit Agenda" available afterward (CDs may revise before the meeting), but it should no
longer be a *required* second step.

---

## 4. One word per concept (and fix the follow-up bug)

**a) Terminology.** Use one verb for the agenda task everywhere. Today it's "Build Prep"
(table), "Build Agenda" (card), "Discussion Topics"/"Meeting Agenda" (composer). Pick
**"Build agenda"** and use it consistently.

**b) Rename "Start Meeting."** The "Start Meeting" button in `DoctorDetailThread.tsx`
`SessionCard` actually opens a *post-meeting* summary capture form whose submit is "Submit
Meeting Summary." Rename the button to **"Log meeting"** (or "Record outcome") so it reads as
recording what happened, not launching a call.

**c) One name for the private assessment.** It's currently "Start Coach Baseline Assessment"
(thread CTA) and "Your Baseline Assessment (Private)" / "Coach Baseline Assessment (Private)"
(baseline card). Pick one — suggest **"Private baseline (your view)"** — and use it in both
places.

**d) Concrete bug — follow-up sessions are never recognized.** The DB constraint is
`session_type IN ('baseline_review', 'follow_up')` and the app inserts `'follow_up'`
(`DoctorDetailThread.tsx:99`), but `src/lib/doctorStatus.ts:57` checks:

```ts
const isFollowup = latest.session_type === 'followup';   // ← wrong string
```

Change `'followup'` to `'follow_up'`. As-is, `isFollowup` is always false, so the
post-session next-action always says "Schedule a follow-up to check on progress" even after a
follow-up, and the `followup_completed` stage is unreachable.

---

## 5. Reorder the doctor detail page around the CD's job; one home for the private assessment

**Problem.** On `src/pages/clinical/DoctorDetail.tsx` the order is: header → release-baseline
card → **Coaching Thread** (actions) → **Baseline Assessment** (collapsible, at the bottom).
So the **doctor's baseline results** — the primary thing a CD references while prepping — sit
below the action hub. And the private assessment has **two entry points**: a CTA inside the
Coaching Thread *and* a card inside the Baseline Assessment collapsible
(`DoctorDetailBaseline.tsx`), both calling `onStartCoachWizard`.

**Fix.**

a) Reorder the detail page to follow the CD's actual sequence:
   1. **Header** — doctor name + the single journey status (from item 1) + the one current
      next-action line.
   2. **Release baseline** card (only while `stage === 'invited'`, as today).
   3. **Doctor's baseline results** (`ClinicalBaselineResults`) — promoted up, since this is
      the reference the CD reads before prepping. Keep it collapsible, default open once the
      doctor's baseline is complete.
   4. **Coaching Thread** — the action hub.
   5. **Private baseline** — as a single, clearly-labeled item.

b) Give the private assessment **one** entry point. Remove the duplicate: keep the card in the
baseline section (which shows status + Start/Continue/View) **or** the thread CTA, not both.
Recommend keeping the status-bearing card (it shows "Not Started / In Progress / Complete" and
last-updated) and removing the separate dashed CTA button from `DoctorDetailThread.tsx`.

c) Minor: the release-baseline flow has a dedicated "Ready to release baseline?" card that
most CDs never see because the invite dialog's "Release baseline immediately" toggle defaults
ON. That's fine to leave, but ensure the card only appears when the baseline truly hasn't been
released.

---

## 6. Wire the new resume path for the private baseline (pairs with the DB migration)

A migration (`supabase/migrations/20260612180000_coach_baseline_resume_fix.sql`) adds an
atomic `get_or_create_coach_baseline_assessment(_doctor_staff_id)` RPC and enforces one
assessment per doctor. The frontend must stop creating the assessment as a mount side effect
and call the RPC instead.

In `src/components/clinical/CoachBaselineWizard.tsx`:

a) **Remove the auto-create effect** (the `useEffect` around lines 460–472 that calls
`createMutation.mutate()` when `existingAssessment === null`) and the `createMutation` insert.
These are the source of the duplicate-key / RLS errors.

b) On entry (or when the user clicks Start/Continue), resolve the assessment via the RPC:

```ts
const { data, error } = await supabase
  .rpc('get_or_create_coach_baseline_assessment', { _doctor_staff_id: doctorStaffId });
if (error) { /* toast */ } else { setAssessmentId(data.id); if (data.status === 'completed') setIsComplete(true); }
```

c) After resolving (and after `completeMutation`), invalidate the shared query so the detail
page updates immediately:

```ts
queryClient.invalidateQueries({ queryKey: ['coach-baseline-assessment', doctorStaffId] });
```

This is what currently makes the button keep saying "Start" — the create path never
invalidates `['coach-baseline-assessment', staffId]`, so `DoctorDetail` serves a stale null.

d) In `src/pages/clinical/DoctorDetail.tsx`, the `coachAssessment` query is unchanged, but it
will now reliably reflect the RPC result once the invalidation in (c) is in place.

---

## Priority

1. **Highest:** items 1, 2, 3 (the redundant status, the hidden gate, the split publish) — these
   are the core of the "too many steps / confusing messages" feedback.
2. **High:** item 6 (resume wiring — pairs with the migration; fixes the "always Start" bug) and
   item 4d (the follow-up string bug).
3. **Polish:** items 4a–c (terminology) and item 5 (layout reorder + single entry point).
