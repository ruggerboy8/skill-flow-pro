# LRM-4: blast recipient review, subject editing, and test copy

Status: APPROVED by John 2026-08-26
Date: 2026-08-26
Lane: medium

## What and why

The weekly doctor blast (LRM-2) currently shows Ariyana only a recipient
count before sending, uses a fixed subject line baked into the backend, and
offers no way to adjust who receives it. Before this feature sees real weekly
use, she needs to see exactly who a blast is slated to go to, edit the
subject, and trim recipients individually or by location. This ticket turns
the send confirm into a proper review step and adds a send-myself-a-test-copy
button, while preserving every safety property LRM-2's QA hardened.

Decisions locked with John on 2026-08-26:

- Recipient review groups doctors BY LOCATION, with a select-all toggle per
  location and one top-level everyone toggle. Doctors with no home location
  appear under a "Roaming" group. (No practice-group tier in v1.)
- Exclusions are per-blast and start fresh every week. A new week's blast
  always begins from the full doctor list; nothing carries over.
- The audience stays doctors only, and her choices can only ever NARROW the
  server-computed list, never add to it. The one addition: a "Send a test to
  me" button that emails only her own address a preview copy.

## Current state (verified in the shipped LRM-2 code)

- `lead_week_blasts` row: body, status draft/sent, sent_at/by,
  recipient_count, failed_count, nullable location_id (future door, unused).
  Author-only RLS; insert/update additionally require training-workspace
  authority.
- Edge function `lead-week-blast` actions: draft (AI), recipient_count
  (count only), send (atomic claim-before-fan-out, zero-recipient block,
  partial-failure counts, per-org Resend branding, reminder_log logging).
  Cohort = is_doctor in the sender's org (org-or-location OR logic), minus
  the author, minus null/blank emails. Subject is a fixed string in the
  function.
- UI (MeetingsAndFocusTab blast slot, post LRM-3): editable body, Save
  draft (outline), Send to doctors (filled) behind an AlertDialog showing
  only "This emails N doctors".

## Scope

DB (one additive migration; timestamp must be unique against main and all
open branches; use 20260826230000_lrm4_blast_subject_recipients.sql; note
20260826190000 is taken by SEC-9a):

- `lead_week_blasts.subject text not null default ''` and
  `lead_week_blasts.excluded_staff_ids uuid[] not null default '{}'`.
  Idempotent adds, no other schema change. Exclusions are stored for the
  record of what was sent; they are never read when creating a NEW week's
  blast (fresh-list rule).

Edge function `lead-week-blast`:

- New action `recipients`: returns the resolved cohort as
  [{ staff_id, name, location_name }] (location_name null for roaming),
  same authority gate and cohort derivation as send. This is the review
  list's source of truth.
- `send` accepts `excluded_staff_ids: uuid[]`. The server re-derives the
  cohort itself and applies the exclusions as a filter; any id not in the
  server's cohort is ignored. Narrow-only is a server-enforced invariant,
  not a UI convention. Persist subject and excluded_staff_ids on the claimed
  row; recipient_count/failed_count reflect the post-exclusion send. The
  zero-recipient block now also covers "she excluded everyone": 400, no
  status flip, with a plain message.
- Subject: `draft` proposes a default subject ("This week with your Lead
  RDAs: Week of {date}" or similar, no em dashes) stored on the row; `send`
  uses the stored subject; empty subject falls back to the default rather
  than sending blank.
- New action `test_send`: emails ONLY the caller's own address the current
  draft (stored subject prefixed "[Test] "), requires a draft with a
  non-empty body, does NOT flip status, does NOT touch counts, logs to
  reminder_log with a distinct template key. Usable repeatedly.

UI (blast slot):

- Draft state gains a subject input above the body, pre-filled with the
  default; plain text field, design tokens.
- A quiet "Send a test to me" outline button beside Save draft; toast
  confirms where it went.
- "Send to doctors" opens a review step (Dialog or Sheet, builder's call)
  showing: the subject (read-only here, edit happens in the draft), the
  recipient list grouped by location with per-doctor checkboxes,
  per-location select all/none, a top-level everyone toggle, a Roaming
  group for location-less doctors, and a live "Sending to N of M doctors"
  line. Confirm sends with the current exclusions. Cancel changes nothing.
- Sent state shows "Sent to N of M doctors" with "(X excluded)" appended
  only when X > 0 (omit-absent-content rule), alongside the existing
  partial-failure honesty from LRM-2/LRM-3.

## Hard constraints

- Every LRM-2 QA-hardened guard survives intact: atomic claim-before-send,
  one blast per week, partial-failure surfacing, regenerate confirm, per-org
  branding, authority gates at both the edge function and RLS layers.
- Narrow-only is enforced server-side. The client never supplies an
  inclusion list, only exclusions, and the server ignores unknown ids.
- No standing opt-outs, no persistence of exclusions across weeks.
- The internal summary and meeting content appear nowhere new.
- No em dashes anywhere, including the default subject and email.
- Design tokens, icon sizes, text-2xs per CLAUDE.md.

## Acceptance script (for John, as super admin on desktop)

1. In a week with a draft blast, expect a subject field above the body,
   pre-filled; change it and save; reopen and expect your wording kept.
2. Click "Send a test to me"; expect a toast naming your email, and the
   test email arrives with "[Test] " in front of your subject; the blast
   still shows as a draft afterward.
3. Click "Send to doctors"; expect a review screen listing every doctor
   grouped by location (roaming doctors under Roaming), all checked, with
   a live "Sending to N of M" line.
4. Uncheck one doctor and one whole location via its toggle; expect the N
   count to drop accordingly; cancel; reopen and expect everyone checked
   again (fresh each open).
5. Uncheck everyone; expect send to be blocked with a plain message, and
   the week still open (no lock-in).
6. Send with two doctors excluded; expect the sent state to read "Sent to
   N of M doctors (2 excluded)" and the excluded doctors' inboxes to stay
   empty while the others receive the email with your subject.
7. Next week's blast: expect the review list to start from everyone again.

## Personas to test as

- Super admin on desktop (Ariyana's surface, whole script)
- Doctor (email receipt, and non-receipt when excluded)
- Spot-check a lead and participant: nothing changed for them

## Out of scope

- Standing per-doctor opt-outs or preferences
- Audiences beyond the doctor roster (comms rework owns general messaging)
- Practice-group filter tier (add later only if location grouping proves
  insufficient)
- Location-scoped blast GENERATION (the location_id door stays untouched)
- Any change to draft generation, meeting, or focus behavior

## Lane

Medium (touches the send path of an outbound email feature; needs
adversarial QA on the narrow-only invariant and the preserved guards).

## DB impact

One additive migration, `20260826230000_lrm4_blast_subject_recipients.sql`
(two columns with defaults, idempotent). Apply before the edge function
redeploy and frontend publish. Claude applies it via Supabase MCP per the
standing arrangement.

## Docs the builder must read

- This spec, then docs/specs/lrm-lead-meeting-bulletin-and-doctor-roster.md
  ("Decisions locked") and docs/dev/ux-review-meetings-and-focus.md section 5
  (what must not change)
- CLAUDE.md design conventions; docs/system-overview.md
- Code: supabase/functions/lead-week-blast/index.ts (all guards),
  src/pages/training/MeetingsAndFocusTab.tsx blast slot,
  src/lib/leadWeekBlasts.ts (+ tests), src/hooks/useLeadWeekBlasts.tsx,
  supabase/functions/coach-remind/index.ts (branding pattern),
  src/lib/clinicalDoctorScope.ts (cohort logic the recipients action mirrors)
