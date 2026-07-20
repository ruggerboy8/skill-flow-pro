# Ariyana's Coaching Workspace (Training Director surface)

> **Status:** Design synthesis v0.1 — 2026-07-20. Source: the John ↔ Ariyana
> working conversation (transcript 2026-07-20). This is the concrete form of the
> "operating surface for Ariyana / signal-routing organ" identified in
> `docs/management-model.md` (gaps G1 + G2).
>
> **One line:** a private, location-organized workspace where Ariyana collects the
> scattered signals she already juggles, filters them, and uses them to plan her
> lead conversations — lowering the "sticky-note cortisol," not adding a task app.

## Why (in her words)

Ariyana is pulling together disparate inputs today with no home: doctor/clinical-
director verbal feedback ("you gotta talk to them about no-charge, X-rays, pulp"),
her own visit observations, lead-meeting takeaways, and scheduling asks — all landing
in phone Notes and sticky notes ("I have so many random notes"). John: "it's time to
build you a dedicated surface inside the app because you're having to pull together a
bunch of disparate things and they all need to live in a place." She's the guinea pig;
it must feel like relief, not a second job.

## The load-bearing design decision: organize by LOCATION, not person

Staff roam — "nobody has a home office in Texas; they're all at different locations
almost every day." Issues are location-based: "everything in [Dr. Alex's] email is
only at South Austin." So the primary unit is the **location**, with issues optionally
tagged to a lead or (privately) a person. This also matches the same roaming reality
that made Dr. Ayah invisible to clinical directors — location can't be the rigid
container; the location is a *workspace/report unit*, not a roster.

## The core loop

1. **Collect issues** into a private "issues" surface, each attached to a location.
   Sources (Ariyana is the **sole filter** at first — "I don't want this to feel like a
   dumping ground"):
   - Her own observations from visits ("I saw it at McKinney").
   - Doctor / clinical-director feedback (Dr. Alex, Dr. Casey) — verbal today.
   - Lead-meeting takeaways.
   - **Aggregated low-confidence signals** — surfaced as a menu item ("looks like lots
     of low scores on case acceptance / this Pro Move"), NOT a per-person task list.
     John was explicit: individual low scores are "too granular… I don't want you to
     log in and see a laundry list of garbage."
2. **Ingest large things.** Paste/upload a transcript (a lead-meeting AI-notetaker
   transcript, or a visit recording) → AI extracts candidate issues → Ariyana picks
   which ones become issues. Reuses the existing eval AI pipeline
   (transcribe/format/extract). "If you have a whole transcript… search this for issues,
   and then you choose the ones that go in."
3. **Plan the lead conversation.** The surface is "a menu for Ariyana… like a crazy-
   person map with red twine." She reviews the issues, sees corroboration/weight ("two
   leads said it, Dr. Alex said it, and I saw it at McKinney"), and picks what to bring
   to that week's lead meeting — or decides "I need to talk to *this* lead specifically."

### Issue anatomy
- **Location** (primary), optional **lead**, optional **private person tag**.
- **Source(s)** with corroboration count (self-visit / doctor / lead / low-confidence).
- Framed as an **opportunity for growth** ("grow"), not a gotcha.
- Optional lightweight **action** ("give Raul a heads-up," "contact X") — action items,
  not a full task manager (she wants organization + better presentation, not "a
  shittier version of existing software").
- **Status:** open / discussed / done ("if I'm writing it down but *putting it
  somewhere that I did talk to them about it* — that's nice").

## Longitudinal state-of-location report
Give her the McKinney-style report natively, per location, over time — "a record that
is going to be gold… every time you go, see the changes and shifts… last quarter here's
what I saw, here's the stuff." Voice/paste brain-dump → structured report she edits.

## Private per-staff notes
"Is there a way to do individual notes on people where they don't see it?" She keeps
per-person context (e.g., "Dr. Britta removes caries if the assistant pre-tricks").
Private to her, never staff-visible.

## Scope boundary (explicit)
**Coaching and organizational health, NOT HR/discipline.** The Misha write-up prompted
this — John: "let's focus on the coaching and organizational-health side more than HR."
HR record-keeping is out of scope for now.

## The lead-facing half
1. **This week's focus on the lead's homepage.** The one big lead focus surfaced in
   their Pro Moves so leads can "grade themselves on it for the week." Ariyana: "I like
   that." Doubles as the recap for anyone who missed the meeting (no more sending 10
   emails).
2. **"Ariyana wants to chat" button** → her booking link (Google appointment schedule),
   with an **email notification**, shown first thing on their next Pro Moves login.
   Uses: missed-meeting follow-up, or a targeted 1:1. Removes all back-and-forth
   scheduling.

## Suggested MVP vs. later
- **MVP (she's the guinea pig):** private, location-organized issues workspace — add
  issues manually + transcript-ingest with AI extract-and-select; plan a lead
  conversation from the menu; longitudinal location report; private per-staff notes.
  Only Ariyana can add issues.
- **Later:** an inbox so Dr. Alex/Casey can *send* issues to her (still her filter);
  the lead-facing weekly focus + scheduling button; optional org-wide rollout to other
  training directors.

## Dependencies / prereqs (from the meeting)
- Ariyana creates a Google appointment **booking link** (Lead 1:1) → send to attach to
  her Pro Moves profile (needed for the scheduling button).
- Promote all current leads to **"lead"** in the admin so the lead-facing pieces know
  who's a lead.
- Give Ariyana **access to her meeting transcripts** (John has them in Motion).

## Open questions
- After the 12-week lead program, cadence settles to ~1 day/week of lead meetings +
  ad-hoc 1:1s (Ariyana's read). The surface should support both the recurring focus and
  one-off scheduled conversations.
- Strategic framing (parallel, not blocking): make Ariyana **Director of all Training**
  (RDA + DFI) with support staff, rather than hiring a separate Director of DFIs — which
  would make this surface span both lines. Also a small DFI coaching experiment (Ariyana
  takes one DFI).

## Related
- `docs/management-model.md` — G1 (Ariyana's fragmented surface), G2 (the low-confidence
  signal has no intervention path). This surface is the answer to both.
- `docs/features/facilitator-presentation.md` — the existing facilitation surface this
  sits beside.
