# Corpus questions (ASK-3a)

The standing table of questions we need experts to answer before their knowledge
can enter the Ask corpus. Built 2026-08-21 by the overnight Lane D run, per
`docs/specs/ask-3a-corpus-questions-and-packets.md`.

## Files

- `questions.csv` (this folder) is the **system of record**. 149 questions.
- **"Ask Corpus Questions" Google Sheet** is the working copy humans edit
  (statuses, notes):
  - fileId: `1h4hT9Zf9meTV9mHObkJEgnUsro6SpoE3G5U9fFhBylw`
  - URL: https://docs.google.com/spreadsheets/d/1h4hT9Zf9meTV9mHObkJEgnUsro6SpoE3G5U9fFhBylw/edit
- `packet-tim-draft.md` is the first expert packet (DRAFT; John sends it
  himself after review).

## The read-merge-write rule (for Claude, every future update)

Drive tooling is file-level, so this Sheet must stay utilitarian:

1. **Read** the Sheet first (`download_file_content`, exportMimeType text/csv).
2. **Merge** any human edits (status, answer_ref, notes columns humans may add)
   into the repo CSV. Human edits win on status and notes; the repo wins on
   question text and structure.
3. **Replace** the whole Sheet file with the merged CSV (create a new file only
   if the old one is gone; otherwise update in place so the fileId is stable).
4. **Never hand-format** the Sheet (colors, formulas, frozen rows added by
   Claude): a file-level write flattens all formatting, so anything fancy will
   be destroyed on the next sync. If John adds formatting by hand, expect it to
   be lost on the next Claude write; that is the accepted trade.
5. John's ledger Sheet (`1KvrQPLeaZVbFOojVeCyJC60msJHeRRFM-UjDjqtMBjs`) stays
   **read-only to Claude**, always.
6. Keep the Sheet under ~200KB (the Drive MCP write limit bit at 255KB). If the
   table outgrows that, trim the context column in the Sheet copy only; never
   trim the repo CSV.

## Columns

| column | meaning |
|---|---|
| id | stable key: `gap-*` (gap report), `adj-<conflict-group>` (one per conflict group), `chk-<item_id>` (stale-risk keeps from the ledger) |
| type | `confirm` / `adjudicate` / `generate` (the three-bucket epistemology from the spec) |
| expert_area | who answers: Ariyana, Dr. Alex, Tim, John, or a pairing |
| source_ref | `gap-report#<section>`, `conflict-group:<slug>`, or `ledger:<item_id>` |
| question | the tape-recorder ask: an expert can answer it out loud |
| context | why it exists, competing claims with dates and Basecamp item ids |
| status | open / asked / answered / drafted / confirmed |
| answer_ref | link to the transcript or drafted corpus doc once one exists |

## Counts (2026-08-21 seed)

- 149 total: 79 adjudicate (one per conflict group), 59 generate, 11 confirm.
- By seed source: 79 conflict groups, 60 gap-report asks, 10 stale-risk keeps.
- By expert (primary): Tim 76, Dr. Alex 33, Ariyana 18, John 8, pairings 14.

## Coverage notes from the seed run

- Gap report sections 1-5 are fully parsed: A1-A8 (A8 split into 6), D1-D7,
  T1-T10 (T10 split into 10), the section 4 shelves with unique content (S1,
  S2, S3, S7, S8-family-policies), and B1-B15 (B15 split into policy sign-off
  and template). Section 4 shelves S4, S5, S6 got no separate rows because
  their content asks are already gap-t2, gap-t9, and gap-t4; the S8 glossary is
  gap-b14; the escalation directory is gap-b6.
- 7 of the 10 stale-risk `chk-*` rows overlap a conflict-group adjudication;
  each cross-references it, so answering the `adj-*` row resolves them.
- John's ongoing chunked ledger review is a fourth source: when a kept row
  raises doubt, add a `chk-<item_id>` row here (repo CSV first, then sync the
  Sheet with read-merge-write).
