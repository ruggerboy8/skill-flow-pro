# ASK tranche run plan: prepped 2026-08-21 evening

**For the fresh session that launches this:** read this whole file first.
Five lanes, independent by design. Lanes A and B are code (worktrees +
branches + PRs); lanes C, D, and E are research/content (work in John's
checkout, no PRs). John merges nothing until morning.

## Environment facts (verified today, don't rediscover)

- The repo checkout at `~/Documents/projects/pro-moves` sits on branch
  `feature/demo-capture-environment` with uncommitted work. **Do not touch
  it for code lanes.** Use `git worktree add <scratchpad>/wt-<lane> -b
  <branch> origin/main`, run `npm ci` inside (do NOT symlink node_modules;
  quill versions differ across branches and poison typecheck), and
  `git worktree remove` when done. This exact pattern shipped PR #81 today.
- Edge function deploys: `npx supabase functions deploy <name>
  --project-ref yeypngaufuualdfzcjpk --use-api` from a directory whose
  `supabase/functions/<name>/` holds the code. The Supabase MCP
  `deploy_edge_function` tool is permission-blocked; the CLI path works.
- SQL against prod: Supabase MCP `apply_migration` / `execute_sql` worked
  today (additive DDL was approved by John for ASK-1; this run's allowance
  is defined per-lane below).
- Service-role scripts: `scripts/basecamp-corpus/.env` exists (gitignored)
  with SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
- Corpus state: 785 basecamp docs (117 keep decisions synced as of the
  last sync; DB shows kept 95 + whatever the latest sync applied — check,
  don't assume). John's working ledger is the Google Sheet, fileId
  `1KvrQPLeaZVbFOojVeCyJC60msJHeRRFM-UjDjqtMBjs` (read-only to Claude;
  read via Drive MCP download_file_content, exportMimeType text/csv, first
  tab `ledger-full`; item_ids may arrive in scientific notation).
- ANTHROPIC_API_KEY is set as a Supabase function secret. OPENAI_API_KEY
  is also set (existing functions use it).
- Transcription status (verified 2026-08-21 evening): COMPLETE. 220 of 263
  Basecamp videos transcribed at
  `oberhauers@<studio>:~/archives/pro-moves/transcripts/` (Studio LAN IP
  moves; find it via `/Applications/Tailscale.app/Contents/MacOS/Tailscale
  ping oberhauerstudio`, key `~/.ssh/studio_ed25519`). The 43 failures are
  videos with NO audio stream (verified with ffprobe; mostly doctor
  treatment videos): permanently untranscribable, they remain title+link
  corpus rows. Nothing is still running.

## Prod-touch policy for this run (John, 2026-08-21)

ALLOWED unattended: additive ASK-2 migration (pgvector + corpus_chunks +
search function), embedding backfill writes to corpus_chunks, deploying a
NEW function named `ask-alcan-v2`, creating ONE new Google Sheet (lane D).
FORBIDDEN unattended: redeploying the live `ask-alcan` function, any
change to `corpus_documents` shape or contents (statuses included), any
edit to John's ledger Sheet, merging PRs, anything touching non-ASK tables.

## Lane A — ASK-2: hybrid search + tool loop (build + shadow deploy)

Spec: `docs/specs/ask-2-hybrid-search-tool-loop.md` (includes the deploy
plan: shadow `ask-alcan-v2`, attended cutover). Branch:
`feat/ask-2-hybrid-search`. Builder then fresh-eyes QA.

Order of work: migration → local `embed_corpus.py` backfill (script lives
with the other basecamp-corpus scripts; unit-test chunking logic) → SQL
search function (SECURITY INVOKER; test FTS+vector+RRF against real data
via MCP) → `ask-alcan-v2` function (tool loop per spec; the frozen
response contract is byte-shape identical) → deploy shadow → end-to-end
QA: at least 8 real questions including (a) one answerable only outside a
150k packing window, (b) one whose best source is a link-only/video row,
(c) a repeat question (history + caching), (d) a venting message, (e) a
contradiction probe. Record answers + tool-call logs in the PR body. PR
opened, not merged; Motion task commented.

## Lane B — ASK-1b: chat UI research + initial build (gate waived by John)

Spec: `docs/specs/ask-1b-chat-ui-adoption.md`. Branch:
`feat/ask-1b-chat-ui`. John explicitly allowed research → build in one run
without an approval stop. QA gate still applies (fresh-eyes kit-qa).

Phase 1 (research, ~30 min cap): WebFetch AI Elements and assistant-ui
docs; verify Vite (non-Next) compatibility, component inventory vs our
needs (thread list, message list, prompt input, sources display), and
Lovable-editability (code-in-repo beats package-locked). Append a short
decision note to the spec. Default is AI Elements unless research finds a
disqualifier.
Phase 2 (build): per spec. The PR #81 carry-over list is the regression
contract; `npm run check` green; screenshot artboards of mobile + desktop
states in the PR body. PR opened, not merged.

Boundary: lane B owns `src/` only. Lane A owns `supabase/` + scripts. No
file overlap exists; keep it that way.

## Lane C — Pro Moves corpus mirror: research + DRAFT spec (no build)

Output: `docs/specs/ask-5-pro-moves-corpus-mirror.md`, marked DRAFT for
John's review. No DB changes, no code.

Research in-repo + prod (read-only SQL): the real shape of `pro_moves`
(steps, description, intervention_text, doctor-track prose fields),
`pro_move_resources` (content_md, types, 309 with bodies, ~138k chars),
`framework_history` versioning, competency/role/domain joins. Then design:
granularity (one corpus doc per pro move vs per competency; where the 309
resources attach), what `source_url` should deep-link to in-app, how
`source_kind='authored'` rows carry a stable idempotency key, and the
refresh strategy (pro moves are versioned and change; propose sync
triggered off framework_history rather than snapshot-and-forget). Include
John's open question from 2026-08-21: whether the shape should differ
from Basecamp docs at all. 2-3 options with a recommendation, sized so
John can decide in five minutes.

## Lane D — Corpus questions consolidation (ASK-3a deliverable 1 + sync)

Spec: `docs/specs/ask-3a-corpus-questions-and-packets.md`. Content work in
John's checkout (like docs/corpus-draft), no PR.

1. Build the standing questions table as
   `docs/corpus-questions/questions.csv` (repo copy = system of record)
   with columns: id, type (confirm|adjudicate|generate), expert_area,
   source_ref, question, context, status, answer_ref. Seed from:
   - `docs/corpus-draft/gap-report.md` sections 1-5 (parse every ask incl.
     company basics B1-B15 and staff bios B15 policy questions)
   - `data/basecamp/official/conflict-groups.csv` (317 items, 79 groups):
     ONE adjudication question per group, competing claims summarized from
     the actual document bodies (read via service-role SQL or the text
     files in `data/basecamp/text/`); name dates and sources inline
   - stale_risk keeps from the ledger → confirm questions
2. Every question must pass the tape-recorder test (answerable out loud).
3. Create ONE new Google Sheet "Ask Corpus Questions" via Drive MCP
   create_file (CSV → native sheet). Keep it under ~200KB (the Drive MCP
   write limit bit at 255KB). Record its fileId in c0 and in a README
   next to the CSV, along with the read-merge-write rule (read the Sheet,
   merge human status/notes edits, replace whole file; never hand-format).
4. DRAFT Tim's pilot packet as `docs/corpus-questions/packet-tim-draft.md`
   (~30 min of talking, format per spec). Draft only; John sends it.

## Lane E — Video transcripts: pull + classification prep (NO corpus writes)

The transcripts are ready (see environment facts). This lane stages them
for John's attended review; it does NOT touch corpus_documents.

1. `rsync` the transcripts from the Studio to
   `data/basecamp/transcripts/` on the MacBook (~220 .txt files).
2. Match each transcript to its ledger row by item id where possible (the
   204 video wrapper rows were judged by title only; filenames carry item
   ids). Report matched / unmatched counts.
3. Produce a review artifact at
   `data/basecamp/official/video-classification-draft.csv`: item_id,
   filename, ledger title, John's existing decision (22 keeps are already
   marked), a 1-2 sentence transcript-based summary, and a suggested
   decision with a one-line reason. Suggestions only; nothing syncs.
   Make it IMPORT-READY for Google Sheets (plain header row, no formulas,
   item_id as text) — John imports it into his ledger Sheet himself as a
   new tab (File > Import > Insert new sheet), which is the only safe way
   in: Claude never writes to the ledger Sheet (file-level writes flatten
   his dashboard). Video decisions then happen in his ledger as normal and
   flow through the standard decisions sync.
4. Note which of John's 22 video keeps are among the 43 silent ones (those
   can be honestly represented by title+link only).
5. Morning: John skims the draft CSV, adjusts decisions in his ledger
   Sheet, and the normal "sync my decisions" + an attended transcript
   ingest (body updates to video rows) brings them into the corpus, ideally
   AFTER the ASK-2 cutover so they land straight into the searchable era.

## Suggested launch shape

Lanes A-E in parallel (A and B in worktrees, C, D, and E in the checkout).
A is the long pole. If anything in a lane goes sideways, stop that lane
and write up where it stopped; do not improvise outside the prod-touch
policy.

## Morning checklist (John + next session)

1. Review PRs: ASK-2 (with its logged Q&A evidence), ASK-1b (screenshots).
2. Decide the ASK-2 cutover moment (attended redeploy over `ask-alcan`).
3. Read the ASK-5 draft spec; approve/redirect the Pro Moves mirror shape.
4. Open the new "Ask Corpus Questions" Sheet; sanity-check 10 questions;
   green-light the Tim packet.
5. Import `video-classification-draft.csv` into the ledger Sheet as a new
   tab (File > Import > Insert new sheet), then decide videos there.
6. Ledger review continues in chunks (bulk-accept was declined 2026-08-21);
   new decisions sync with "sync my decisions".
