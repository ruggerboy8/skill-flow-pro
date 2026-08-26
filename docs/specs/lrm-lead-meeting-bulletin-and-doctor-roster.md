# LRM: Lead RDA week pipeline (focus, meeting, doctor blast) and coaching roster split

Status: APPROVED by John 2026-08-25 (v2)
Date: 2026-08-25 (v2 same day, after shape correction)
Lane: cross-cutting (umbrella; individual tickets are medium)

## What and why

Conversations and expectations set in Ariyana's Lead RDA meetings are not
reaching doctors, because Lead RDAs do not reliably relay them. This spec turns
the Lead Focus tab on Ariyana's `/training` workspace into a week-centered
"Meetings and Focus" surface. The week is the atom. Inside each week, three
artifacts appear in pipeline order, matching how Ariyana actually operates:

1. **Focus** (already exists): she decides and publishes the week's focus
   first, because it is her facilitation plan for the meeting.
2. **Meeting** (new): she runs the Lead RDA meeting around that focus, then
   records it by pasting the raw transcript. One paste feeds three outputs:
   candidate issues for her issues board (existing pipeline), a private
   internal summary (new), and the doctor blast draft (new).
3. **Doctor blast** (new): an AI-drafted, fully editable email to every doctor
   in the org, covering the week's focus and any process-level clarifications
   from the meeting, so doctors know what was set with their Lead RDAs.

Each slot shows its state at a glance (focus published, meeting logged, blast
sent). Empty slots are visibly, quietly empty. The system shows the pipeline;
it does not enforce it or nag.

Because rolling this out means adding every doctor to the app, the coaching
roster also needs to separate "has a login" from "is being coached": an
explicit enrolled-in-coaching designation gates the roster, and the baseline
assessment stops auto-releasing at invite and becomes a separate release
action.

## Decisions locked with John (2026-08-25)

- The week is the organizing atom. Pipeline order within a week: focus is set
  BEFORE the meeting (it is the facilitation plan), then the meeting is held
  and recorded, then the blast goes out.
- Show the pipeline, do not lock it. No hard ordering enforcement. The one
  hard rule: a blast needs at least a published focus or a logged meeting to
  draft from.
- Quiet weeks stay quiet. If no meeting happens, the only consequence is that
  leads see no focus that week. No nagging, no reminder machinery, no
  carry-forward feature for v1. (Live data check 2026-08-25: Ariyana has
  published a focus every week since the feature shipped, 5 of 5, usually on
  Monday. The hoped-for weekly rhythm is real.)
- One blast per week, maximum. Content from a rare second meeting waits for
  next week's blast.
- A blast can go out on a meeting-less week from the focus alone, since email
  is doctors' only window into the focus.
- Delivery is email only (stop-gap until the comms rework owns announcements).
- Coaching designation is an explicit toggle on the roster, not derived from
  coach assignment.
- Baseline release is its own button, separate from the coached designation.
- The internal meeting summary is author-only. Even super admins cannot read
  it in-app.
- Blasts are org-wide for now; the schema keeps a nullable location scoping
  column as a door-open for future location-specific parsing (unused in v1).

## Current state (verified against codebase and live DB, 2026-08-25)

- The weekly lead focus exists (`lead_focus_weeks`, `lead_focus_items`, unique
  per author per week, published from the Lead Focus tab, shown only to Lead
  RDAs via an `is_lead` RLS gate, global with no location dimension). The tab
  already has week-to-week navigation, a Builder, and a month-grouped record
  of past weeks. No notification fires on publish.
- There is no record of the Lead RDA meeting itself anywhere. The doctor
  coaching track has the proven shape to mirror (`coaching_sessions` plus
  `coaching_meeting_records` with a `raw_transcript` column).
- The paste-a-transcript, AI-pass, human-review pattern is live in
  `MeetingOutcomeCapture.tsx` (format-transcript then extract-insights).
  `/training` also has an IngestDialog feeding `coaching-extract-issues`
  (transcript to candidate issues). Today those are separate pastes; this spec
  consolidates them into the meeting record.
- Email via Resend is the only shipped delivery channel. `coach-remind` is the
  fan-out primitive: loops recipients, personalizes, sends, logs each send to
  `reminder_log`. No recipient-cohort query exists yet; callers pass
  recipients in.
- The entire training workspace (issues, focus weeks) is author-scoped RLS.
  Consequence John hit on 2026-08-25: masquerade is client-side (SimProvider
  swaps which staff profile the UI loads, but DB queries still run as the real
  logged-in user), so masquerading as Ariyana can never show her training
  data, and John's own view of the tab is empty because he has authored
  nothing. Not a bug in masquerade; a structural limit of client-side
  masquerade against author-scoped RLS. A possible follow-up (NOT in this
  spec): a super-admin read policy on published focus weeks, which are already
  visible to every lead and carry no privacy weight.
- Doctor identity is `staff.is_doctor = true` (privilege-locked column,
  SEC-3). The `/clinical` roster (`DoctorManagement.tsx`) lists every doctor
  in the org with no enrollment filter. `doctor_coach_assignments` only scopes
  an individual coach's view; CDs and super admins see everyone.
- "Baseline auto-deploy" is `InviteDoctorDialog.tsx` hardcoding
  `release_baseline: true`, which stamps `staff.baseline_released_at` and
  `baseline_released_by` in `admin-users` (`invite_doctor`, ~line 1249). No
  assessment row is created until the doctor clicks Start. Doctors invited
  without the stamp get a graceful "your clinical director will let you know
  when it's time" home screen.
- Known latent bug: `baseline_released_by` stores an auth uid but
  `BaselineWizard.tsx` looks it up as a staff id, so the releaser name never
  resolves and doctors see "Your Coach".
- Invited doctors always get `organization_id` (the edge function hard-fails
  without one); `primary_location_id` may be null ("Roaming"). The
  `EditUserDrawer` path that flips `is_doctor` on an existing staff row skips
  the org guarantee, so bulk-adding doctors must use the real invite flow.

## Ticket breakdown, order, and dependencies

Build order: DR-1 then DR-2 (independent of LRM). LRM-1 then LRM-2. The two
tracks can run in parallel. LRM-2 depends on LRM-1. DR-2 depends on DR-1.

### DR-1 (medium): coaching enrollment designation on the doctor roster

- Add a nullable `staff.coaching_enrolled_at timestamptz` (and
  `coaching_enrolled_by`). Null means not enrolled. A timestamp beats a
  boolean because it records when enrollment happened.
- Writes go through the `admin-users` edge function (new action or extension
  of `update_user`), gated to clinical directors and super admins. Do not
  weaken the SEC-3 staff privilege-column locks; if the columns are added to
  the locked list, the edge function is the only writer.
- `/clinical` roster defaults to enrolled doctors only, with an "All doctors"
  view for finding and enrolling someone. Enrollment is a toggle on the
  roster row or doctor detail, with plain-language confirm copy.
- Backfill: every existing doctor with any coaching activity (a baseline
  release, an assessment row, or a coaching session) is backfilled as
  enrolled so nobody vanishes from the roster on deploy.
- Migration is additive; apply migration first, deploy code after.

Acceptance script (test as clinical director on desktop, then super admin):
open /clinical, expect the roster to show only enrolled doctors; switch to
All doctors, expect the full list including never-coached doctors; enroll
one, expect them to appear on the default roster; un-enroll, expect them to
drop back to All doctors only, with their history intact.

### DR-2 (medium): decouple baseline release from doctor invite

- `InviteDoctorDialog.tsx` stops sending `release_baseline: true`; remove the
  dialog copy promising the baseline opens on invite. `admin-users`
  `invite_doctor` treats the flag as false by default (keep the parameter for
  compatibility, default off).
- New "Release baseline" action on an enrolled doctor's roster row or detail
  view, calling `admin-users` to stamp `baseline_released_at` and
  `baseline_released_by`. Only offered for enrolled doctors. Idempotent;
  shows released state once stamped.
- Fix the releaser-name bug: store or resolve the releaser so
  `BaselineWizard.tsx` shows the actual director's name instead of the "Your
  Coach" fallback.
- Existing doctors keep their stamps; no data change.

Acceptance script (clinical director on desktop, plus a doctor account):
invite a new doctor, log in as that doctor, expect the "welcome, your
clinical director will let you know" home with no baseline CTA; enroll the
doctor and click Release baseline; as the doctor, expect "Your Baseline Is
Ready" naming the releasing director; complete flow unchanged from there.

### LRM-1 (medium): week-spine "Meetings and Focus" tab with meeting records

- Rename/restructure the Lead Focus tab on `/training` into "Meetings and
  Focus": one week on screen at a time with the existing week navigation,
  showing three slots in pipeline order: Focus, Meeting, Doctor blast (blast
  slot ships as a visible placeholder in LRM-1; it goes live in LRM-2).
- The Focus slot embeds the EXISTING focus Builder and published view,
  behavior unchanged (publish still pushes to lead home screens exactly as
  today). This is a re-housing, not a rewrite; regression risk on focus
  publishing is the main QA target. The month-grouped past-weeks record stays
  reachable (kept below the week view or behind a History control).
- New table `lead_meetings`: id, organization_id, created_by (staff id),
  meeting_date date, week_start_date date (set on save from meeting_date, org
  week convention), raw_transcript text, internal_summary text, created_at,
  updated_at. Author-only RLS mirroring `coaching_issues` policies. No read
  path for anyone else, including super admins. Multiple meetings per week
  are allowed but not expected.
- "Record meeting" in the Meeting slot opens a dialog: date field (typeable,
  not a native mobile picker; defaults inside the displayed week) and a
  paste-transcript textarea. One paste, three outputs:
  1. internal summary drafted by an edge function (follow the
     format-transcript then summarize chain; OpenAI via established
     secrets), editable before save and after;
  2. candidate issues via the EXISTING `coaching-extract-issues` keep/drop
     flow, folded into this dialog; the standalone IngestDialog entry point
     can then retire from the workspace (the code path is reused, not
     duplicated);
  3. the stored raw transcript, available to LRM-2's blast drafter.
- Slot states: Focus = not set / published (with items); Meeting = none /
  logged (date, summary preview). Neutral, quiet empty states per John's
  omit-absent-content rule: empty means empty, no scolding copy.

Acceptance script (super admin, as Ariyana): open /training, Meetings and
Focus; expect the current week with the focus slot working exactly as the old
tab did (publish a focus, confirm it appears on a lead's home). Click Record
meeting, pick a date, paste a transcript; expect an editable internal
summary, the familiar keep/drop issue candidates, and a saved meeting showing
in the week. Scroll to a past week, expect its published focus record intact.
Log in as any other role, expect no way to reach or read the meeting.

### LRM-2 (medium): doctor blast draft and email send

- New table `lead_week_blasts`: id, organization_id, created_by (staff id),
  week_start_date date, body text, status ('draft' or 'sent'), sent_at,
  sent_by, recipient_count, location_id uuid nullable (future-scoping door,
  always null for now), created_at, updated_at, unique (created_by,
  week_start_date). Author-only RLS. Anchored to the WEEK, not the meeting:
  the drafter draws on everything the week contains.
- "Draft blast" is enabled when the week has a published focus or at least
  one logged meeting (the one hard rule). The edge function receives the
  week's published `lead_focus_weeks` and `lead_focus_items` as structured
  context plus the raw transcript(s) of the week's logged meetings, so the
  blast's "focus this week" matches word for word what leads saw. On a
  meeting-less week it drafts a focus-only announcement. The prompt must
  exclude anything about named individuals or personnel matters and keep
  process-level clarifications and expectations.
- The draft is fully reviewed and editable by Ariyana before sending. Send
  shows the recipient count and a plain confirm ("This emails N doctors")
  before anything goes out.
- Send fans out via Resend following the `coach-remind` pattern, logging each
  send to `reminder_log`. Recipient cohort: staff with `is_doctor = true`
  scoped to the sender's org using the same org-or-location logic as the
  roster (`buildOrganizationStaffScopeFilter`), excluding rows with no email.
- One blast per week, enforced by the unique key and the UI: once sent, the
  slot shows sent state with a timestamp and recipient count; no resend, no
  second blast. Content from a later meeting that week waits for next week.
- Email template: subject and body per the Alcan voice (warm, plain, no em
  dashes), org branding consistent with existing Resend emails.

Acceptance script (super admin, as Ariyana, plus a doctor inbox): in a week
with a published focus and a logged meeting, click Draft blast; expect a
draft that leads with the week's focus verbatim, includes process
clarifications, and says nothing about named staff; edit it, click Send,
confirm the recipient count; expect the slot to show Sent with a timestamp
and the doctor test account to receive the email; expect no way to send a
second blast that week. In a week with a focus but no meeting, expect Draft
blast still enabled and the draft to be a focus-only announcement. In an
empty week, expect Draft blast disabled.

## Personas to test as

- Super admin on desktop (Ariyana's workspace, both LRM tickets)
- Lead (focus still appears on lead home after the tab restructure, LRM-1)
- Clinical director on desktop (DR tickets)
- Doctor (DR-2 home-screen states, LRM-2 email receipt)
- Spot-check a participant to confirm nothing changed for them

## Out of scope

- Reminders, nudges, or any "you have not had a meeting" messaging; quiet
  weeks stay quiet
- Focus carry-forward machinery
- Super-admin visibility into the training workspace (possible small
  follow-up: read policy on published focus weeks; internal summaries stay
  author-only by decision)
- In-app blast surface, feed, or push notification (comms rework owns this)
- Location- or org-specific blast parsing and targeting (schema door open,
  nothing built)
- Auto-ingest of transcripts from Google Meet (manual paste only)
- Any change to what leads see (focus publishing behavior is preserved
  exactly)
- Resending or revising a sent blast
- Bulk-importing the doctor roster (John invites doctors through the existing
  dialog; this spec only makes that safe for non-coached doctors)

## DB impact

Three additive migrations, in this order, applied via the SQL editor path per
CLAUDE.md (idempotent, IF NOT EXISTS):

1. DR-1: `staff.coaching_enrolled_at`, `staff.coaching_enrolled_by`, plus the
   activity-based backfill. Apply before the DR-1 deploy.
2. LRM-1: `lead_meetings` with author-only RLS.
3. LRM-2: `lead_week_blasts` with author-only RLS.

No drops, no renames, no changes to existing tables beyond the two staff
columns, so the DDL-must-lag rule is satisfied by being additive.
`lead_focus_*` tables are untouched.

## Docs the builder must read

- Schema / DB: `docs/data-model.md`; CLAUDE.md "Applying migrations"
- Coaching / leads: `docs/management-model.md`
- Everything: `docs/system-overview.md`; CLAUDE.md design system conventions
  (tokens, icon sizes, no hardcoded colors); no em dashes anywhere, including
  the email template; omit-absent-content rule for empty slot states
- Patterns to mirror in code: `src/pages/training/LeadFocusTab.tsx` (week nav
  and Builder to re-house), `src/pages/training/TrainingWorkspace.tsx`
  IngestDialog + `coaching-extract-issues` (issue mining to fold in),
  `src/components/clinical/MeetingOutcomeCapture.tsx` (transcript to AI to
  editable fields), `supabase/functions/coach-remind` (email fan-out and
  reminder_log), `supabase/migrations/20260720190000_coaching_workspace_slice1.sql`
  (author-only RLS shape), `supabase/migrations/20260721190000_lead_focus_slice2.sql`
  (week keying convention), `src/lib/clinicalDoctorScope.ts` (org cohort
  query)
