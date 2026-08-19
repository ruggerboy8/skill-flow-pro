# Spec: BUG-1, Create Evaluation opens the legacy form

**Status:** approved by John 2026-08-19 (verbal, in session); QA pass 2 after fixes
**Lane:** bug
**Ticket:** BUG-1 (Motion, MyProMoves Dev Board)
**Branch:** fix/bug-1-create-eval-opens-legacy-form

## What and why

On a staff member's page, Quarterly Evals tab, clicking Create Evaluation made
the draft and then opened the classic EvaluationHub form instead of the new
per-domain capture flow. The Open and Edit buttons on existing rows already went
to the capture flow; only the create path was stale. A coach completed several
evals in the classic form by accident before this was noticed.

Both forms write the same `evaluations` and `evaluation_items` rows. The only
shape difference is the notes: the classic form saves one combined
`observer_note` per competency; the capture flow saves `observer_glow` and
`observer_grow` (and mirrors a combined copy into `observer_note`). The staff
review screens already fall back to `observer_note`, so nothing was lost for
staff. The capture flow, though, only reads glow/grow, so those classic notes
came up blank for the coach.

## The fix

1. After Create, navigate to `/coach/:staffId/eval/:id/capture`.
2. When the capture flow opens an eval that has legacy notes (a note with no
   glow and no grow), split each note into Glow/Grow with the existing
   `separate-feedback` helper and save glow/grow. `observer_note` is left
   untouched, so the original wording is never lost and the conversion is
   idempotent (a second open converts nothing).
3. If a split fails for a competency, the legacy note is placed in that
   competency's feedback box so the coach can Polish it by hand. A toast says
   what happened either way. Failed items are retried on the next open.
4. Only drafts are auto-converted. For an eval that is already submitted, the
   capture flow makes no write on open; it just shows the legacy note in the
   feedback box so it is readable. (QA 2026-08-19 pointed out that opening a
   submitted eval should not silently write to it.)
5. If the coach navigates to a different eval before the conversion finishes,
   the late results are not painted onto the new screen (QA finding, fixed).
6. The save itself is conditional (Codex review finding, fixed): a split is
   written only if the eval is still a draft and the row still has the exact
   same note with no Glow/Grow. If anything changed meanwhile (submitted,
   edited in the classic editor, converted in another tab), nothing is written
   and the screen resyncs from the row.

Live data check on 2026-08-19: two recent drafts by one evaluator with 12 and 5
legacy notes, plus two July submitted evals in the same shape. The drafts
convert the first time the capture flow opens them; the July ones stay as they
are and simply show their notes.

## Acceptance script (as a coach)

1. Open a staff member, Quarterly Evals tab, click New Evaluation, fill the
   dialog, click Create Evaluation. Expect: the new capture screen (domain pills
   on the left, score and feedback on the right), not the classic hub.
2. Open one of the Aug 17 drafts via Edit. Expect: a short "Converted N notes
   from the classic form" message; every competency that had a note shows a Glow
   and/or Grow in the left list; scores unchanged.
3. Reload that eval. Expect: the split persists and no conversion message.
4. Open a brand new eval. Expect: no conversion message.

## Out of scope

- Removing the classic hub route or its "Classic editor" link (it still hosts
  the recording and interview tools).
- Changing how submitted evals render for staff.

## DB impact

None. No schema change. Data writes are limited to `observer_glow` and
`observer_grow` on rows that had neither, made by the signed-in coach through
the same save path the capture flow already uses.

## Docs the builder must read

`docs/features/evaluation-*.md`, the hollow-evals guard note (memory), CLAUDE.md
design conventions.
