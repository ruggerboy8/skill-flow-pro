# ASK-3a: Standing corpus questions table + expert packet pilot

**Status:** approved 2026-08-21 (John, in-session). First slice of the ASK-3
review-tooling territory; artifact-first, no in-app build in this slice.

## The epistemology (John, 2026-08-21)

Three buckets, three treatments:

| Bucket | Contents | Expert treatment |
|---|---|---|
| Know we know | kept corpus + framework | Exception-based confirmation, prioritized by usage (bot citation logs) and stakes. Never tape-recorder work. |
| Think we know | conflict groups, stale_risk flags | **Adjudication**: closed questions, competing claims quoted inline, answerable out loud in a sentence. |
| Know we don't know | gap report (~40 asks + company basics B1-B15) | **Generation**: open capture prompts, ~10 min of talking each. |

Design constraints from John:
- No fixed cadence (no promised weekly meetings). Packets on demand.
- The artifact handed to an expert must pass the **tape recorder test**:
  they could sit down with a recorder and talk through it to fill gaps.
  Understandable and directive over concise.
- The ledger is never shown to experts (too dense).
- Transcription is the expert's choice (voice memo, meeting transcript
  tool, whatever). The Studio whisper pipeline stays for the Basecamp
  video backlog only.

## Deliverables (this slice)

1. **Standing questions table** (single system of record; a NEW dedicated
   Google Sheet, decided 2026-08-21). Claude manages it via read-merge-write:
   read the current file, merge human edits (statuses, notes), replace the
   whole file. Constraint: Drive tooling is file-level, so this sheet stays
   utilitarian — no hand-built formatting (writes flatten it). John's ledger
   sheet remains read-only to Claude so its dashboard/formatting survive. One row
   per question: id, type (confirm | adjudicate | generate), owner expert
   area, source (gap id / conflict_group slug / stale flag), question text,
   status (open / asked / answered / drafted / confirmed), answer link.
   Seeded from:
   - Gap report sections 1-5 (incl. company basics + bios)
   - The 79 conflict groups, each auto-drafted into ONE adjudication
     question with the competing claims summarized inline (Claude drafts,
     from the actual kept/undecided docs in each group)
   - stale_risk keeps → confirm questions
2. **One sample packet (Tim)**: rendered doc of his open questions, sized
   to ~30 min of talking, tape-recorder format: context sentence → the
   question → "what good looks like" hints. Pressure-test with a real
   human before scaling to other experts.
3. **The return loop, documented**: transcript comes back → Claude drafts
   corpus document(s) (`source_kind='authored'`) → expert confirms their
   own formalized words (two-minute read) → status canon.

## Open decisions (John)

- ~~Bulk-accept the undecided AI-recommended keeps?~~ **DECIDED NO
  (2026-08-21)**: John continues row-by-row in chunks, because even existing
  keeps may be out of date and those become Tim/Alex questions. Consequence
  for this spec: John's chunked review is a fourth ongoing SOURCE of
  confirm/adjudicate questions — the table must make adding a question from
  a ledger row cheap.
- Packet format sign-off after Tim tries the sample.

## Explicitly out of scope

- In-app corpus manager UI (rest of ASK-3)
- corpus_questions DB table (comes with ASK-3 proper; the Sheet is the
  interim system of record)
- Contradiction detection batch job (ASK-4)
