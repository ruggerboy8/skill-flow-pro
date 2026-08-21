# EVAL-4: Preserve transcript paragraph structure through the rich-text editor

Status: prepped 2026-08-21; approach recommendation pending John's one-line OK at launch
Lane: medium
Motion ticket: EVAL-4 on the MyProMoves Dev Board
Date: 2026-08-21

## What and why

`summary_raw_transcript` is stored as plain text with line breaks (the
`format-transcript` edge function explicitly outputs plain text). But
EvaluationHub edits it in an HTML rich-text editor (the CLN-2a
`RichTextEditor` wrapper around quill 2), and HTML normalization collapses
`\n` line breaks into spaces. So the first deliberate edit of a transcript
flattens its whole paragraph structure into a single paragraph, permanently.

CLN-2a already fixed the worse cousin of this bug (the editor silently
re-writing normalized HTML to the DB just from opening the panel). What
remains is: a real user edit still destroys paragraphs. Found during CLN-2a
QA; pre-existing behavior from the react-quill era, not a regression.

## Chosen approach (recommended; confirm before build)

**Convert plain text to paragraph HTML when seeding the editor.** When the
incoming value contains no HTML tags (heuristic: no `<` followed by a letter
or `/`), transform before handing it to Quill:

- Split on blank lines (`\n\n+`) into `<p>` blocks.
- Single `\n` within a block becomes `<br>`.
- Escape HTML entities in the source text first (`&`, `<`, `>`), since plain
  text may legitimately contain those characters.

After an edit, the stored value becomes HTML (as it already does for any
rich-text content). Values that are already HTML pass through untouched, so
previously edited transcripts and the composer/eval notes call sites see no
change.

Why this over the alternatives:

- *Storing HTML from the edge function* changes an LLM prompt contract and
  leaves every existing plain-text transcript still broken.
- *A plain-text editing surface for transcripts* forks the editing UI and
  loses the formatting coaches already use in the same panel.

## Where the code goes

A pure function (e.g. `src/lib/plainTextToHtml.ts`) with unit tests, called
from the transcript seeding path. Decide during build whether the call
belongs in EvaluationHub (transcript call site only, safest) or inside
RichTextEditor behind an opt-in prop; default to the call-site placement
unless a strong reason emerges. Do NOT apply it unconditionally inside
RichTextEditor: DirectorPrepComposer's values are already HTML and must not
be double-processed.

## Downstream consumers to verify

- `handleMapToNotes` (the AI mapping path in EvaluationHub) receives the
  transcript value. Verify it behaves sensibly with HTML input (it already
  can receive HTML today after any rich edit, so this should hold; prove it,
  don't assume it).
- The read-only transcript render path, if any renders `summary_raw_transcript`
  outside the editor.

## Acceptance script (for John)

1. As a coach, open an evaluation whose transcript has multiple paragraphs
   (plain text, never edited). The editor shows distinct paragraphs, not one
   wall of text.
2. Fix a typo in one paragraph and save. Reopen: all paragraphs still
   distinct, only the typo changed.
3. Open an evaluation transcript that was edited before this fix (already
   flattened or already HTML): renders as before, no error, no double-escaped
   text like `&amp;`.

## Personas to test as

Coach (desktop). Admin spot-check of one evaluation view.

## DB change

None. Stored shape drifts from plain text to HTML per transcript as each is
edited, which the column already tolerates.

## Out of scope

- Re-inflating transcripts that were already flattened by past edits (data
  fix, not code; not worth it unless John asks).
- Any change to format-transcript's output shape.
