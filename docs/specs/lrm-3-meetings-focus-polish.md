# LRM-3: Meetings and Focus polish (UX review easy wins + bug fixes)

Status: APPROVED by John 2026-08-26
Date: 2026-08-26
Lane: medium

## What and why

The Meetings and Focus tab shipped (LRM-1/LRM-2) with the pipeline correct in
the data but invisible in the layout. A UX architecture review
(docs/dev/ux-review-meetings-and-focus.md, 2026-08-26) diagnosed why the page
feels disjointed: the week (the page's real subject) renders as a small
side control while a static title holds the headline; the three slots are
visually equal siblings with no sequence or current-step signal; the
transplanted focus Builder carries a competing internal hierarchy; a
month-grouped focus accordion duplicates the Month view and hides meeting and
blast history; and an empty week's blast badge says "Locked" against the
show-do-not-lock principle. The review also found four live bugs. This ticket
bundles the review's easy wins and bug fixes. The bolder stepper-rail
composition (review section 4) is deliberately NOT this ticket.

## Scope (the review's items, referenced by its numbering)

Bug fixes:

- B1 (review win 3): the header subtitle still says "(soon) send doctors a
  weekly recap" above the live blast slot. Fix the copy to describe the page
  as it is, one sentence, no em dashes.
- B2 (review win 4): past empty weeks render a "Plan this week" CTA that
  would publish a focus into a finished week. Past empty weeks become quietly
  empty: dashed box, no CTA, and suppress the gray "Not started" and
  "Locked" badges on empty past-week slots (omit-absent-content rule).
- B3 (review win 6): the prev/next week arrows silently discard an open
  Builder with unsaved edits (setBuilderOpen(false) in the nav handlers).
  Add a plain confirm before navigation closes a Builder with edits. The
  confirm is the chosen fix; do not attempt to make the Builder travel
  across weeks.
- B4 (review win 5, wording half): the empty-week blast badge reads
  "Locked" with a lock icon. Use StatusBadge's label override to soften the
  word (e.g. "Waiting") while keeping the status token.

Layout and flow wins:

- W1 (review win 1): promote the week to the page headline. Demote or drop
  the static h1 (it duplicates the active tab label); render the week label
  as the dominant heading with the chevrons flanking it and the "This week"
  affordance beside it. The Week/Month toggle stays in the toolbar but no
  longer shares visual rank with the navigator.
- W2 (review win 2): add a three-chip pipeline summary row under the week
  headline, rendered from the three already-computed slot states
  (focusState, meetingState, blastState). Each chip names its step and
  state and scrolls to its card on click. Quiet styling, design tokens
  only; this is information, not nagging.
- W3 (review win 5, explanation half): in the blast slot's empty state,
  caption or replace the bare disabled "Draft blast" button with one quiet
  line: "Drafts from this week's focus and meeting."
- W4 (review win 7, full version): make the Month view the single archive
  and retire RecordAccordion. Extend Month rows with three tiny per-week
  state glyphs (focus / meeting / blast); all inputs are already
  client-side. Clicking a row already jumps to the week spine. If the
  builder hits unexpected trouble here, the accepted fallback is the
  interim cut: render the accordion only in Week view (move it inside the
  viewMode ternary) and leave glyphs for a follow-up. State clearly in the
  PR which version shipped.
- W5 (review win 8): cosmetic sweep. Normalize the file's five ad hoc
  micro-label sizes (text-[10.5px] through text-[13.5px]) to text-2xs /
  text-xs per CLAUDE.md; make "Save draft" outline so "Send to doctors" is
  the only filled button in the draft toolbar; fix the h-5 w-5 X icon inside
  the h-8 w-8 ghost button to h-4 w-4.

## Hard constraints (review section 5, non-negotiable)

- Do not rewrite the focus Builder's internals, the publish flow, or
  anything the lead home card consumes. Re-house and restyle only. Focus
  publishing is the standing regression target.
- Do not touch the QA-hardened blast guards: recipient-count confirm,
  zero-recipient short-circuit, partial-failure surfacing, regenerate
  edits-would-be-lost confirm.
- Do not surface internal summary CONTENT anywhere new (states yes, content
  no); the privacy model stays exactly as is.
- No new gating, ordering enforcement, or reminder/nagging copy anywhere.
  The only hard gate remains the blast's needs-focus-or-meeting rule.
- Keep the typeable date field and the lands-in-other-week notice.
- No em dashes in any copy.

## Acceptance script (for John, as super admin on desktop)

1. Open /training, Meetings and Focus. Expect the week ("Week of ...") to be
   the biggest text on the page, with arrows beside it, and it changes as
   you navigate. The old static title no longer dominates.
2. Under the headline, expect a small three-chip row (Focus / Meeting /
   Blast) showing each step's state; click a chip, expect the page to
   scroll to that card.
3. Expect the "(soon)" sentence gone from the header.
4. Navigate to a past week with nothing in it. Expect quiet empty slots:
   no "Plan this week" button, no gray "Not started" pills, no "Locked".
5. On the current week with no focus and no meeting, expect the blast slot
   to say what drafting draws from, instead of only a dead disabled button,
   and any badge wording to avoid "Locked".
6. Open the focus Builder, type something without saving, click a week
   arrow. Expect a plain confirm instead of silent loss; cancel keeps your
   edits.
7. Switch to Month view. Expect each week row to show three small state
   glyphs (focus / meeting / blast), and expect the old duplicate accordion
   to be gone from Month view (and gone entirely if the full W4 shipped).
8. In a week with a blast draft, expect "Send to doctors" to be the only
   filled button on the draft toolbar.
9. Regression walk: publish a focus and confirm it still appears on a lead's
   home card; record a meeting end to end; draft a blast. All flows behave
   exactly as before.

## Personas to test as

- Super admin on desktop (Ariyana's surface, the whole script)
- Lead (focus still lands on home, item 9)
- Participant spot-check (nothing changed for them)

## Out of scope

- The stepper-rail composition (review section 4); future ticket if wanted
- Any data model, hook logic, RLS, or edge function change
- RecordMeetingDialog and IssueCandidateExtractor internals
- The blast email template or send behavior
- Reminders, notifications, carry-forward, or any new mechanism

## Lane

Medium (single page family, UI-only, needs QA because the focus publish flow
is embedded in the surface being restyled).

## DB impact

None.

## Docs the builder must read

- docs/dev/ux-review-meetings-and-focus.md (the review; the builder's
  primary brief, especially sections 3 and 5)
- docs/specs/lrm-lead-meeting-bulletin-and-doctor-roster.md ("Decisions
  locked": quiet weeks, show-do-not-lock, privacy)
- CLAUDE.md design conventions (tokens, text-2xs, icon sizes, no em dashes)
- docs/system-overview.md
- Code: src/pages/training/MeetingsAndFocusTab.tsx (the file this ticket
  lives in), src/components/ui/StatusBadge.tsx (label override),
  src/lib/leadMeetingsAndFocus.ts and src/lib/leadWeekBlasts.ts (state
  helpers feeding W2/W4)
