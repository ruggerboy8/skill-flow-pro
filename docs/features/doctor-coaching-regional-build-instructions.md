# Regional Clinical Coach: build instructions

**For the implementing model.** These are step-by-step build instructions for
the decided scope in `doctor-coaching-regional-prd.md` (all decisions made by
John on 2026-08-11; do not re-ask them). Work piece by piece, in order.
Commit and push after each piece with a clear message. A Fable review pass
happens after all pieces, so leave honest TODO comments where you make a
judgment call.

## Global guardrails (read first)

- **Typecheck after every piece:** `npx tsc --noEmit -p tsconfig.app.json`.
  Plain `npx tsc --noEmit` at repo root checks NOTHING.
- **DB changes:** all SQL here is additive or tightening; none is
  destructive. Apply via the Supabase MCP (`apply_migration` for DDL,
  project `yeypngaufuualdfzcjpk`), and also save each migration file in
  `supabase/migrations/` with format `YYYYMMDDHHMMSS_description.sql` so the
  repo stays the source of truth. Write everything idempotently
  (`if not exists` / `create or replace` / `drop policy if exists` then
  recreate). Never `DELETE` platform pro_moves. Do not drop anything.
- **Frontend ships via Lovable publish** (John triggers it). Your job ends
  at pushed code + applied additive DB.
- **Verify before referencing:** before writing any FK or RPC call, check
  the live column/PK names with a quick `information_schema` query (e.g.
  the `pro_moves` PK is believed to be `action_id` int; confirm).
- **Design system:** no hardcoded Tailwind semantic colors; use the CSS
  token helpers per CLAUDE.md (status colors via `--status-*`,
  `<StatusBadge />`). Icons: 16px `h-4 w-4` inline, 20px `h-5 w-5` buttons.
  Micro-labels use `text-2xs`.
- **Copy:** use the verbatim copy blocks below. House voice is warm and
  plain. **No em dashes anywhere in user-facing copy.**
- **Do not break live paths:** 8 live coaching_sessions, 3 meeting records,
  6 coach baselines. Build alongside, never rewrite working flows
  wholesale.
- **Out of scope today:** the coaching guide articles (PRD section H), the
  revision loop (decision: remove the promise instead, see 0.6), doctor
  re-assessment, any weekly-loop change.

---

## Piece 0: Audit fixes (everything obviously broken)

### 0.1 Fix the Edit Agenda wipe (G3a)
`src/components/clinical/DirectorPrepComposer.tsx:324` hydrates editor
state in a `useState(() => {...})` initializer that runs before
`existingSelections` and `session` resolve. Replace with a `useEffect` that
hydrates once when the data arrives:
- Track a `hydrated` ref. When `session` is loaded and the
  `existingSelections` query is no longer loading (success or empty),
  set `selectedActions` from `existingSelections` and `coachNote` from
  `session.coach_note`, then mark hydrated.
- Never hydrate after the user has typed (if `hydrated` is set, do
  nothing).
- While not hydrated, disable Save draft / Send buttons (prevents saving an
  empty editor over real data during load).
**Accept:** open an existing `director_prep_ready` session's Edit Agenda;
the saved agenda and selected topic appear; Save draft preserves them.

### 0.2 Meeting-record integrity (G3b)
DB (verified live 2026-08-11: no unique constraint, zero duplicates):
```sql
do $$
begin
  if exists (select 1 from coaching_meeting_records
             group by session_id having count(*) > 1) then
    raise exception 'dedupe coaching_meeting_records first';
  end if;
  if not exists (select 1 from pg_constraint
                 where conname = 'coaching_meeting_records_session_id_key') then
    alter table coaching_meeting_records
      add constraint coaching_meeting_records_session_id_key unique (session_id);
  end if;
end $$;
```
Frontend: `MeetingOutcomeCapture.tsx:165-173` change the unconditional
`.insert(...)` to `.upsert({...}, { onConflict: 'session_id' })`.
**Accept:** capture works on a fresh session; prep-composer's
prior_action_status upsert no longer 42P10s (it now has its constraint).

### 0.3 Close the session-creation RLS hole (G3c)
Live policy "Coach can manage own sessions" on `coaching_sessions` is FOR
ALL with null WITH CHECK. Replace (idempotent):
```sql
drop policy if exists "Coach can manage own sessions" on coaching_sessions;
create policy "Coach can manage own sessions" on coaching_sessions
for all
using (coach_staff_id in (select id from staff where user_id = auth.uid()))
with check (
  coach_staff_id in (select id from staff where user_id = auth.uid())
  and (
    is_super_admin(auth.uid())
    or (
      exists (select 1 from staff s
              where s.user_id = auth.uid() and s.is_clinical_director = true)
      and org_id_of_staff(doctor_staff_id) = current_user_org_id()
    )
    or is_assigned_doctor_coach(auth.uid(), doctor_staff_id)
  )
);
```
(`is_assigned_doctor_coach(uuid, uuid)`, `org_id_of_staff`,
`current_user_org_id` all exist live; they're used by neighboring policies.
Confirm signatures before applying.)
**Accept:** a CD can still create sessions in-org; an assigned coach can
create sessions for their mentee; a random staff row cannot insert a
session (test with execute_sql as a sanity check of the policy text, and
rely on the existing UI flows for functional confirmation).

### 0.4 `invite-to-schedule` hardening (G3d + G3j)
`supabase/functions/invite-to-schedule/index.ts`:
- When `session_id` is provided, fetch the session and require
  `session.doctor_staff_id === doctor_staff_id` (400 otherwise), and
  require current status in `('director_prep_ready',
  'scheduling_invite_sent')` before flipping to `scheduling_invite_sent`.
- Org-scope the CD check: a clinical director qualifies only if the target
  doctor is in their org (mirror how the RLS policies do it; the function
  runs service-role so do the join explicitly).
- Fix the create-session fallback's `session_type: "followup"` to
  `"follow_up"`.
- Default email copy says "Select 1-2 Pro Moves"; the UI enforces exactly
  one. Change default copy to "Select the 1 Pro Move you'd most like to
  discuss".
Redeploy the function via MCP `deploy_edge_function`.

### 0.5 `notify-meeting-summary` hardening (G3e)
Rewrite the auth gate: caller must be (a) super admin, (b) clinical
director in the same org as the session's doctor, or (c) an assigned
doctor coach for that session's doctor (`doctor_coach_assignments` row
matching caller's staff id + session.doctor_staff_id). Remove the
`staff.is_coach` path entirely (that flag is the RDA weekly-loop coach,
unrelated). Redeploy.

### 0.6 Remove the revision-loop promise (G3f, decided: confirm-only)
- `notify-meeting-summary/index.ts:132,141`: delete the "you can request a
  revision" sentences from the email. The email should say the summary and
  action steps are ready to review, and to reach out to the coach with any
  questions.
- `MeetingOutcomeCapture.tsx`: remove copy echoing the revision promise.
- Leave `doctor_revision_requested` handling code in place (dead status,
  nothing writes it); do NOT build revision UI. John's principle: minimize
  system-enforced loops, trust the conversation.

### 0.7 Meeting date integrity (G3g)
- `MeetingOutcomeCapture.tsx:178`: only set `scheduled_at = now()` if the
  session's `scheduled_at` is null; otherwise leave it.
- `MeetingConfirmationCard.tsx:108`: guard null `scheduled_at` (render
  "Date not set" instead of formatting `new Date(null)`).

### 0.8 Align prior-action lookback (G3h)
`DirectorPrepComposer.tsx:284-291` pulls prior sessions with
`status = 'doctor_confirmed'` only; `DoctorReviewPrep.tsx:165-172` also
includes `meeting_pending`. Align the composer to include both, so an
unconfirmed summary still surfaces its action steps to the coach.

### 0.9 Doctor history coherence (G3m)
`src/pages/doctor/DoctorCoachingHistory.tsx`:
- `meeting_pending` must not render as completed-with-checkmark; show it as
  "Summary ready to review" (status color pending, not complete).
- "View Full Record" on a `doctor_confirmed` session currently routes to
  the prep view, which shows less than the card. Point it at the meeting
  summary content instead (reuse the summary/action-step rendering from
  `MeetingConfirmationCard` for confirmed sessions, read-only), or if that
  is heavy, drop the button for confirmed sessions and expand the card
  inline. Your call; leave a TODO explaining the choice.

### 0.10 UX quick wins
- `DoctorDetailThread.tsx`: "Start Meeting" label becomes
  "Record Meeting Notes" for `scheduling_invite_sent` (it sits under
  "Awaiting doctor's response") and stays "Start Meeting" for
  `doctor_prep_submitted`.
- `doctorStatus.ts`: doctor-facing status pill must not reuse CD-voiced
  next-action strings ("Schedule next session" shown to the doctor about
  themselves). Give the doctor path its own short labels (e.g.
  `doctor_confirmed` → "Completed", `meeting_pending` → "Summary ready").
- Unify session naming on **"Check-in N"** everywhere the doctor sees
  "Follow-up N" (`DoctorCoachingHistory.tsx:75`,
  `MeetingConfirmationCard.tsx:111`).
- Delete dead components (zero importers, verify first):
  `DoctorNextActionPanel`, `MeetingScheduleDialog`, `NotifyDoctorDialog`,
  `DoctorGrowthTimeline`, `BaselineSummaryPanel`.
- `DoctorDetailThread.tsx:373`: only toggle expansion for `isExpandable`
  statuses (currently every row toggles, including ones with no content).
- Optional if quick: migrate `SESSION_STATUS_CONFIG` hardcoded Tailwind
  colors to status tokens.

---

## Piece 1: Copy sweep (PRD A, decided)

1. Coach-baseline visibility copy, both spots, exactly:
   **"This is visible only to clinical coaches."**
   - `CoachBaselineWizard.tsx` (replaces "…visible only to clinical
     directors.")
   - `DoctorDetail.tsx` baseline sheet: "Your read of where this doctor
     stands. This is visible only to clinical coaches."
2. Doctor-facing disclosure, appended as the second-to-last paragraph of
   the welcome letter in `BaselineWelcome.tsx`, exactly:
   > One more thing: I'll be completing my own version of this assessment
   > based on what I've observed working alongside you. That's not a report
   > card, it's how I prepare, so our first conversation starts from real
   > observations instead of guesses.
3. Welcome letter fallback signature: when the inviter is not a clinical
   director (regional coach invite), fall back to "Your Coach" instead of
   "Your Clinical Director". (Inviter name still wins when present.)
4. `DoctorManagement.tsx` header: "Clinical Director Portal" for
   CDs/super admins; **"Coaching Portal"** for mentees-only coaches. Also
   hide the Invite Doctor and Resend Invite actions from mentees-only
   coaches (CD-flavored actions that fail or mislead for them).
5. No "Regional Clinical Coach" label anywhere this round (decided).

---

## Piece 2: Cadence (PRD E, decided)

1. **Next-date capture:** in `MeetingOutcomeCapture`, after the summary and
   action steps, an optional date field: label **"When will you meet
   next?"**, helper: "Best case, you leave the meeting with the next one
   on the calendar. Skip if you're scheduling later." On submit with a
   date: create the next session row (`session_type: 'follow_up'`,
   `sequence_number` = max + 1 for that doctor, `status: 'scheduled'`,
   `scheduled_at` = the date, same coach/doctor). Skippable with no
   friction.
2. **Roster pulse:** `DoctorManagement.tsx` gains a "Last session" element
   per row: derived from max `coaching_meeting_records.submitted_at` for
   that doctor (join through sessions). Display:
   - No sessions ever: "Not started" (muted, no alarm).
   - Under 4 weeks: plain text, e.g. "2 weeks ago".
   - 4 to 6 weeks: amber status token + "5 weeks since last session".
   - Over 6 weeks: stronger weight (status-missing token), same format.
   Use status color tokens, not raw Tailwind colors.
3. Same chip on the `DoctorDetail.tsx` header.
4. Visible to CDs and assigned coaches (both already see these surfaces;
   no extra gating).
**Accept:** Ana Ibarra-Noriega's row shows drift (her last record is
2026-07-17); a doctor with no sessions shows "Not started".

---

## Piece 3: Coach baseline guidance (PRD B, decided)

1. **Intro step** in `CoachBaselineWizard.tsx`: shown before the rating
   grid the first time a coach opens a given doctor's baseline (dismiss
   state in localStorage keyed by assessment id; re-openable via a help
   icon in the wizard header). Title: **"Before you start"**. Body,
   verbatim, three short blocks:
   > **Why this matters.** Your read of this doctor is what grounds your
   > first conversation in observation instead of self-report. You're not
   > grading them. You're preparing yourself.
   >
   > **The gap runs both directions.** Experienced doctors often rate
   > themselves high on habits they've stopped noticing. Newer doctors
   > often rate themselves low on skills they already have. Your job
   > changes with the direction: sometimes you'll gently introduce
   > reality, sometimes you'll build confidence with evidence.
   >
   > **Rate only what you've seen.** If you haven't observed a Pro Move,
   > mark it N/A and plan to watch for it chairside. A guess helps no one.
   Primary button: "Start rating". Also render the same content in a
   collapsible "How to do this well" panel inside the wizard.
2. **Coaching tip** (appears in the intro step footer AND later in the
   Piece 4 comparison view), verbatim:
   > In the conversation itself, name the Pro Move you want to talk about,
   > not the number you gave it. The number invites debate. The behavior
   > invites conversation.
3. **Pre-session callout** in `DirectorPrepComposer` when the session is
   `baseline_review` and the coach's own baseline for this doctor is not
   completed: a prominent card (not the current one-line tip):
   > **Your baseline isn't done.** Your observed baseline is what makes
   > the first conversation concrete. Finish it before you build this
   > agenda.
   Buttons: "Open baseline" (routes to the wizard) / "Continue anyway".
4. **Invite-send confirm:** in `SchedulingInviteComposer`, if sending a
   baseline_review invite while the coach baseline is incomplete, one
   confirm dialog: "Send without your baseline? You're scheduling the
   baseline review before finishing your own assessment of {doctor}."
   Buttons: "Finish baseline first" / "Send anyway". (Decided: strong and
   clear but skippable, not a hard gate.)

---

## Piece 4: Focus tables + baseline comparison (PRD C + D data, decided)

### 4a. Tables (apply first; additive)
Verify `pro_moves` PK name/type live before writing FKs, then:
```sql
create table if not exists doctor_focus_items (
  id uuid primary key default gen_random_uuid(),
  doctor_staff_id uuid not null references staff(id) on delete cascade,
  coach_staff_id uuid not null references staff(id) on delete cascade,
  pro_move_id integer not null references pro_moves(action_id),
  statement text not null default '',
  status text not null default 'draft'
    check (status in ('draft','parked','active','retired')),
  retired_outcome text
    check (retired_outcome in ('landed','set_aside')),
  origin_session_id uuid references coaching_sessions(id) on delete set null,
  activated_at timestamptz,
  retired_at timestamptz,
  created_by uuid references staff(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists doctor_focus_item_updates (
  id uuid primary key default gen_random_uuid(),
  focus_item_id uuid not null references doctor_focus_items(id) on delete cascade,
  session_id uuid references coaching_sessions(id) on delete set null,
  progress text not null
    check (progress in ('going_well','working_on_it','not_started')),
  note text,
  created_by uuid references staff(id),
  created_at timestamptz not null default now()
);
```
RLS (enable on both): mirror the coaching_sessions pattern exactly:
- Doctor: SELECT own (`doctor_staff_id` in own staff ids); INSERT on
  `doctor_focus_item_updates` for own items (progress reporting from prep).
- Coach: ALL where `coach_staff_id` = self, WITH CHECK self AND
  (super admin OR CD-in-org OR `is_assigned_doctor_coach`), same shape as
  the 0.3 policy.
- CD-in-org and super admin: SELECT (and UPDATE for CDs) org-wide, same
  expressions as the neighboring coaching_sessions policies.
Add an `updated_at` trigger if the house pattern exists (check how
`coaching_issues` does it and mirror).
Naming in UI copy (decided default, easily swappable): the container is a
**"Focus Move"**, the statement field label is **"Our starting point"**.

### 4b. Baseline Review Prep view (one-time comparison)
New coach-facing component reachable from `DoctorDetail` (button near the
Assessments section: "Baseline review prep") and linked from the prep
composer when session_type is `baseline_review`:
- Requires doctor self-baseline completed. If coach baseline incomplete:
  show self-only with a callout back to the wizard (reuse Piece 3 copy).
- Per domain: side-by-side self vs observed per Pro Move.
- Ranked gap list: largest |self − observed| first. Label direction
  honestly and kindly: over-rating gaps as "They see this stronger than
  you do", under-rating as "You see this stronger than they do".
- Show the doctor's gut-check flagged domains and their free-text
  reflection.
- Per Pro Move row actions: **"Make it a Focus Move"** (creates a
  `doctor_focus_items` row, status `draft`, statement empty) and **"Park
  for later"** (status `parked`).
- Include the coaching tip from Piece 3 at the top.
- Coach-eyes-only: never render observed scores on any doctor-facing
  surface.
### 4c. Compact recap for later sessions
In `DirectorPrepComposer` for `follow_up` sessions: a small "From your
baseline review" panel listing draft/parked/active Focus Moves (name +
status). No scores.

---

## Piece 5: Focus Moves UI (PRD D, decided)

1. **DoctorDetail card "Focus Moves":** lists items by status (Active
   first, then Draft/Parked, Retired collapsed). Actions: activate a
   draft/parked item (prompts for "Our starting point" text if empty),
   edit statement, retire (choose "Landed" or "Set aside"). Advisory when
   activating a 4th active item (toast or inline, not blocking):
   > More than three Focus Moves is hard to focus on.
2. **No doctor confirmation step** (decided). The statement is the coach's
   words, written to be read by the doctor.
3. **Doctor prep** (`DoctorReviewPrep`): for each Active item, the doctor
   marks going-well / working-on-it / not-started (reuse the existing
   3-option pattern) plus optional note → writes
   `doctor_focus_item_updates` rows (session_id = the prep session). Keep
   the existing prior-action mechanic for unlinked experiments.
4. **Prep composer first block:** Active Focus Moves with the doctor's
   latest progress + note per item, rendered above the agenda editor
   ("Review these first. Pick up where you left off.").
5. **Outcome capture:** per Active item quick actions: keep / retire
   (landed | set aside) / add action step. When adding an action step from
   an item, tag the experiment jsonb entry with `focus_item_id`.
6. **Doctor-side visibility (decided):** Active Focus Moves (Pro Move name
   + "Our starting point" text) render on the doctor's side. Refactor
   DoctorHome's CurrentFocusCard to source from Active Focus Moves when
   any exist, falling back to the latest session's experiments only
   (fixes the accumulation bug G3l); keep it simple.
7. **Pro Move required always** (decided). No free-text items. (Future
  consideration, not now: recommending new Pro Moves when an issue does
  not fit an existing one.)

---

## Piece 6: Coach self-rating (PRD F, decided)

Table:
```sql
create table if not exists coach_session_reflections (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null unique references coaching_sessions(id) on delete cascade,
  coach_staff_id uuid not null references staff(id) on delete cascade,
  r_talk smallint check (r_talk between 1 and 5),
  r_ask smallint check (r_ask between 1 and 5),
  r_candor smallint check (r_candor between 1 and 5),
  r_specificity smallint check (r_specificity between 1 and 5),
  r_continuity smallint check (r_continuity between 1 and 5),
  note text,
  created_at timestamptz not null default now()
);
```
RLS: owner-only, both directions (`coach_staff_id` in own staff ids for
USING and WITH CHECK). Nobody else reads it, including CDs (decided).

UI: after `MeetingOutcomeCapture` submits successfully, show a card
(skippable with one tap, never blocks navigation):
- Title: **"Thirty seconds for you"**
- Subtitle: "How did that go, for you as the coach? This is private to
  you."
- Five 1-5 scales with anchor labels at the ends:
  1. "Who did most of the talking?" (Mostly me → Mostly them)
  2. "Was I more directive or more curious?" (Telling → Asking)
  3. "How honest was I about what I'm seeing?" (Guarded → Candid)
  4. "How concrete were the next steps we left with?" (Vague → Could
     picture them)
  5. "How well did we build on last session?" (Started fresh → Picked up
     the thread)
- Optional one-line text: "Anything you'd try differently next time?"
- Buttons: "Skip" / "Save". Partial submits save (all rating columns
  nullable).
No trends view this round.

---

## Piece 7: Transcript persistence (PRD G1, decided)

```sql
alter table coaching_meeting_records
  add column if not exists raw_transcript text;
```
In `MeetingOutcomeCapture`, when a transcript is pasted into the AI
generate panel, include it in the record write (`raw_transcript`).
Display: on the coach-side record view, a collapsed "Transcript on file"
section (coach/CD-visible surfaces only; never render on doctor-facing
surfaces). Persist everywhere, all orgs (decided).

---

## Definition of done (per piece)

1. `npx tsc --noEmit -p tsconfig.app.json` clean.
2. Additive SQL applied via MCP AND committed to `supabase/migrations/`.
3. Edge functions redeployed if touched.
4. Commit pushed with a message naming the piece.
5. Anything you were unsure about: TODO comment + one line in the commit
   body, for the Fable review pass.
