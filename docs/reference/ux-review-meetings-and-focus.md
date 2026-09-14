# UX review: Meetings and Focus tab

Reviewed at origin/main (efd676a4, post LRM-2 merge). Files: `MeetingsAndFocusTab.tsx`, `RecordMeetingDialog.tsx`, `IssueCandidateExtractor.tsx`, `TrainingHome.tsx`, `LeadFocusHomeCard.tsx`, the LRM spec, and the pure state helpers (`leadMeetingsAndFocus.ts`, `leadWeekBlasts.ts`).

## 1. Diagnosis: why it feels disjointed

The short version: **the page has a spine in the data but not in the pixels.** The three slot states are already computed in one place at the top of `MeetingsAndFocusTab` (`focusState`, `meetingState`, `blastState`, lines 138-142), but the rendering scatters that pipeline into three identical boxes under a small detached control, with a second archive bolted underneath.

### Structural causes

**S1. The three slots are visually equal siblings, so nothing reads as a sequence.** `SlotSection` gives every slot identical chrome: `rounded-xl border p-4`, a `h-6 w-6` number chip in `bg-muted text-muted-foreground`, a `text-sm font-bold` title, a right-aligned `StatusBadge`. The muted gray chips (1, 2, 3) are the only sequence signal, and they use the exact palette of the "Not started" badge, so they read as decoration. There is no connective tissue between the cards (plain `space-y-4` gaps, no line, no "then"). Nothing distinguishes "done," "do this next," and "later": a Monday page and a Friday page have the same visual weight distribution, and the current step is never emphasized.

**S2. The week navigator is the page's real subject but renders as a secondary control.** Everything below the toolbar is keyed to `selectedMonday`, yet the week label is a `min-w-[120px] text-sm` span, right-aligned in a `justify-between` toolbar row it shares with the Week/Month view toggle. Meanwhile the static `h1` ("Meetings and Focus") duplicates the already-active tab label from `TrainingHome`. So the biggest text on the page never changes when she navigates, and the thing that changes everything is one of the smallest. That inversion is, I believe, the single biggest source of the "disjointed" feeling: the page has no headline that answers "which week am I looking at, and where is it in the pipeline."

**S3. The transplanted focus Builder brings its own competing hierarchy.** When `builderOpen`, slot 1 swallows the page: the Builder renders its own `h3` header ("Set focus · Week of Aug 24") that restates the week the navigator already shows, a second `h3` ("Pull from your issues"), a two-column `md:grid-cols-[1.35fr_1fr]` grid, and three nesting levels of rounded borders (SlotSection border, item-card borders, issues-panel border). Even closed, `SelectedWeek` carries its own micro-header row ("Scheduled" / "What you covered" plus the "live on lead homes" indicator). These are all leftovers from when the Builder WAS the page. Inside a numbered slot they create header-inside-header noise. Related: the slot number chips (1-3, muted) sit directly above `FocusRow`'s item number chips (1-2, primary-filled), so the page runs two unrelated numbering systems within a few hundred pixels.

**S4. The past-weeks accordion is a second, partial time axis.** `RecordAccordion` (line 227) renders below the week view AND below the Month view, because it sits outside the `viewMode` ternary. So the page offers three ways to time-travel: week arrows, the Month view, and the accordion. Worse, the accordion and the Month view rows only know about focus ("✓ covered / ◦ not set" comes from `w.items.length`), so the "record" silently omits two thirds of the pipeline: a past week's meetings and blast are invisible everywhere except by navigating the spine to that week. In Month mode the redundancy is blatant: a month-grouped list of weeks, followed by a month-grouped accordion of the same weeks.

**S5. No aggregate state visibility.** From the top of the page, or from Month view, she cannot tell which step this week is on. The badges exist but are distributed one per card down the page, and the blast badge for an empty week says "Locked" with a lock icon (`blastSlotBadgeStatus('none') -> 'locked'`), which cuts against the locked principle "show the pipeline, never lock." The gating rule itself (blast needs a focus or a meeting) is real and fine; the vocabulary and the unexplained disabled "Draft blast" button (S8 below) are not.

### Cosmetic causes

**C1. Ad hoc micro-typography.** `text-[10.5px]`, `text-[11px]`, `text-[11.5px]`, `text-[12.5px]`, `text-[13.5px]` all appear in this one file; CLAUDE.md's convention is `text-2xs` for micro-labels. Five nearly identical sizes add fuzz without hierarchy.

**C2. Stale header copy.** The subtitle still says "(soon) send doctors a weekly recap" (line 149). LRM-2 shipped; the blast slot is live directly below the sentence claiming it does not exist yet.

**C3. Two filled primary buttons in the draft toolbar.** "Save draft" and "Send to doctors" are both default-variant filled buttons on one row; only "Regenerate" is outline. Send is the consequential action and should be the only filled one.

**C4. Icon size drift.** The Builder's remove button uses `<X className="h-5 w-5" />` inside an `h-8 w-8` ghost icon button while every sibling inline icon is `h-4 w-4`.

## 2. The flow test: Ariyana's week against the current UI

**Monday (set the focus).** She opens the tab. Slot 1 is at the top with a clear "Set this week's focus" CTA; the Builder opens inline; publish gives a good toast ("live on lead homes"). This moment mostly works, which makes sense: the page inherits the old Lead Focus tab's layout, and Monday is the old tab's only job. Two small frictions: she has to confirm from a small right-aligned label that she is on the current week, and once the Builder opens, the page balloons and the toolbar's meaning (it still governs the whole page) gets lost above the two-column grid. One real hazard: the prev/next week arrows call `setBuilderOpen(false)` (lines 165-167), so a mid-edit misclick on an arrow silently discards her unsaved Builder edits with no confirm.

**Mid-week (record the meeting).** She opens the tab and must scroll past slot 1, which now shows the published focus. That scan is actually useful (it is her facilitation plan), but nothing tells her slot 2 is her current step; she knows the routine, the page does not. The dialog itself is good: one paste, one "Generate summary & find issues" button, editable summary, familiar keep/drop candidates, and the `landsInOtherWeek` notice is a thoughtful touch. After "Save meeting" the dialog closes and she is dropped back mid-page with no pointer to the now-unlocked blast step below the fold. The badge on slot 3 changed from Locked to Not started, but she would have to scroll to notice, and that pill transition is nearly invisible (both are gray).

**Post-meeting (the blast).** She scrolls to slot 3 and clicks "Draft blast." The 10-row textarea, regenerate-with-confirm (only when her edits would be lost, via `shouldConfirmRegenerate`), recipient-count confirm, and partial-failure surfacing are all solid. Guess points: nothing says what the draft drew from (focus only? which meetings?), so on a two-meeting week she has to trust it; and before any focus or meeting exists, the slot shows a disabled "Draft blast" button with no stated reason, so a new user (or Ariyana on an odd week) must infer the one hard rule.

**Any day (looking something up).** "What did I cover in mid-July, and did the blast go out?" has no good answer. The accordion and Month view only show focus; she must arrow or navigate week by week to see meeting and blast history.

## 3. Easy wins (this week, low regression risk, no data model changes)

Ordered by leverage. None touch the Builder's internals, the dialog, or any hook.

1. **Promote the week to the page headline. (S)** Drop or demote the static `h1` (it duplicates the active tab label) and render `fmtWeek(selectedMonday)` as the dominant heading with the chevrons flanking it and the "This week" affordance beside it. Keep the Week/Month toggle in the toolbar but stop making it share visual rank with the navigator. This alone fixes most of S2: the page finally has a subject line that changes when she navigates.

2. **Add a three-chip pipeline summary under the week headline. (S)** One row: `Focus ✓ · Meeting ✓ · Blast: draft`, rendered from the three states already computed at lines 138-142, each chip scrolling to its card. This is the at-a-glance answer to "which step is this week on," gives the slots their missing connective tissue, and costs a small presentational component. It also makes the post-save "what next" moment self-answering. Fixes most of S1 and S5.

3. **Fix the stale "(soon)" subtitle. (S)** Line 149. One string.

4. **Stop offering "Plan this week" on past empty weeks. (S)** `SelectedWeek`'s empty state renders the build CTA unconditionally; for `when === 'past'` the button reads "Plan this week" and would publish a focus into a finished week. Past empty weeks should be quietly empty (per the omit-absent-content rule): the dashed box, no CTA, no "Nothing set... yet" (there is no "yet" about the past). Same treatment for past-week badges: two gray "Not started" pills plus a "Locked" on a legitimately quiet past week reads as reproach; omit the badges (or the pills entirely) when `when === 'past'` and the slot is empty.

5. **Explain the blast gate instead of a bare disabled button. (S)** In the `'none'` state, replace or caption the disabled "Draft blast" with one quiet line: "Drafts from this week's focus and meeting." That is showing the pipeline, which the spec explicitly wants. Also use `StatusBadge`'s `label` override to soften the `'locked'` pill's wording (keep the status token, change the word, e.g. "Waiting").

6. **Guard the Builder against navigation data loss. (S/M)** Either confirm before the week arrows discard an open Builder with edits, or simply do not reset `builderOpen` and let the Builder's own week label (which it already renders) travel with the navigation. The confirm is the smaller, safer change.

7. **Make the Month view the single archive, retire `RecordAccordion`. (M)** Extend Month rows with three tiny per-week state glyphs (focus/meeting/blast); all inputs are already client-side (`weeksByDate`, `meetingsHook.meetings` + `meetingsInWeek`, `blastsHook.blasts` + `deriveBlastSlotState`). Clicking a row already jumps to that week's spine, which shows full detail, so the accordion's content is strictly a subset. This removes the second time axis (S4) and finally makes meeting/blast history findable. If retiring it feels bold, an interim S-sized cut: render the accordion only in Week view (move line 227 inside the ternary), which removes the worst redundancy.

8. **Cosmetic sweep. (S)** Normalize the five ad hoc micro-label sizes to `text-2xs`/`text-xs`; make "Save draft" outline so "Send to doctors" is the only filled action; fix the `h-5 w-5` X.

## 4. A bolder composition (future ticket): the week as a stepper spine

Concept: one "week masthead" owns time and state; the three steps hang off a single visible rail; the current step is expanded, the others are one-line summaries that expand on click. History lives entirely in the Month view.

```
+----------------------------------------------------------+
|  <  WEEK OF AUG 24  >   [This week]        [Month view]  |
|  Focus ✓ ── Meeting ✓ ── Blast (draft)                   |
+----------------------------------------------------------+
   |
   o  1 FOCUS · published · live on lead homes        [v]
   |     (collapsed: the 1-2 focus lines, one row each)
   |
   o  2 MEETING · Tue Aug 26 · "Discussed eye pro..." [v]
   |
   O  3 DOCTOR BLAST · draft                       [open]
   |     +--------------------------------------------+
   |     | textarea (10 rows)                         |
   |     | [Regenerate]        [Save draft] [Send...] |
   |     +--------------------------------------------+
```

Mechanics: keep `SlotSection`'s children exactly as they are (the Builder, `MeetingSlot`, `BlastSlot` mount unchanged inside the expanded step), but replace the card chrome with rail nodes whose fill encodes state (muted = empty, primary = current, check = done). "Current" = first non-completed slot, computed from the three existing state values; expansion defaults to current but any step opens on click, so nothing is enforced. The masthead chips and the rail are the same data rendered twice, at two zoom levels.

Cost: a new `SlotSection` replacement plus expand/collapse state, masthead component, Month-view glyph upgrade, and a QA pass on focus publishing (the standing regression target). Roughly a medium ticket.

Risks: collapsed-by-default hides the published focus text mid-week (mitigate: the collapsed focus row shows the item texts, not just a count); "current step" emphasis must stay visual, never textual nagging, or it violates the quiet-weeks principle; the Builder's two-column grid needs the expanded step to span full width on desktop; mobile behavior of the rail needs care. If the collapse behavior feels risky, the rail-plus-masthead alone (all steps always expanded) still delivers most of the value.

## 5. What NOT to change

- **The quiet empty states.** Dashed boxes with a single CTA and zero scolding copy are exactly right (`MeetingSlot` empty, focus empty, month "◦ not set"). Any redesign that adds "You haven't..." copy or reminder affordances breaks a locked principle.
- **The privacy model.** `internal_summary` renders only in her author-scoped list and dialog; the truncated preview in `MeetingSlot` is safe because only she can load the row. Do not surface summaries anywhere shared (including a future masthead or Month glyphs; states yes, content no).
- **The focus publish flow.** Builder internals, the polish loop, issue promotion to Communicated, the publish toast, and the downstream `LeadFocusHomeCard` contract are live and verified; the redesign should re-house, never rewrite (the spec says this explicitly and it held).
- **The QA-hardened blast guards.** Recipient-count confirm, zero-recipient short-circuit (`canConfirmSend`), partial-failure toast, and edits-would-be-lost regenerate confirm (`shouldConfirmRegenerate`) are correctness features wearing UI clothes. Keep them intact through any restyle.
- **The soft pipeline.** The only hard gate stays the blast's needs-focus-or-meeting rule. A stepper must not grow ordering enforcement, disabled steps, or completion pressure.
- **The typeable date field** and the `landsInOtherWeek` notice in `RecordMeetingDialog` (John's no-native-date-picker rule, plus honest week-filing feedback).
