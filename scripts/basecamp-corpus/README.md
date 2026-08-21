# ASK-1 / ASK-2: Basecamp corpus ingest + embedding scripts

Imports the sorted Basecamp harvest into the `corpus_documents` table so the
Ask Alcan spike has something to answer from while curation continues. See
`docs/specs/ask-1-corpus-backbone-and-spike.md` for the full spec.

These scripts run from John's machine against prod using the service role
key (same trust model as `scripts/demo-seed`). Nothing here is reachable
from the app. Python 3.10+, standard library only — nothing to install.

## Setup

```bash
cp scripts/basecamp-corpus/.env.example scripts/basecamp-corpus/.env
# Fill in SUPABASE_SERVICE_ROLE_KEY (Supabase dashboard -> Settings -> API).
```

The service role key bypasses Row Level Security. Local machine only, never
committed, never pasted into chat.

**The migration must be applied first** (via the SQL editor, per CLAUDE.md):
`supabase/migrations/20260821120000_ask1_corpus_backbone.sql`.

## ingest_corpus.py — ledger -> unreviewed documents

```bash
python3 scripts/basecamp-corpus/ingest_corpus.py --dry-run   # always first
python3 scripts/basecamp-corpus/ingest_corpus.py
```

- Reads `data/basecamp/ledger-full.csv` + extracted text in
  `data/basecamp/text/<project>/<item_id>.txt` (override with `--ledger` /
  `--text-dir`).
- Imports rows whose recommendation is keep/maybe as `unreviewed`.
- Videos are skipped entirely (they wait for transcripts). Items whose
  extracted text has no body (PDFs in this phase) import title + link only.
- Idempotent on the composite `(org_id, source_item_id)` key (matching the
  DB unique constraint): re-running inserts nothing twice; existing
  rows get their content fields refreshed, and **status / expert area /
  review fields are never touched**, so a re-run cannot clobber curation.
- Ends with a self-check (no duplicates, no missing ledger items) and fails
  loudly if it doesn't hold.

Expert areas are deliberately NOT assigned at ingest — ownership mapping is
a curation act and happens in-app (ASK-3) or via SQL.

## sync_decisions.py — Sheet decisions -> statuses

```bash
python3 scripts/basecamp-corpus/sync_decisions.py path/to/decisions.csv --dry-run
python3 scripts/basecamp-corpus/sync_decisions.py path/to/decisions.csv
```

- Input: any CSV with `item_id` and `decision` columns (a full ledger export
  from the Sheet works as-is).
- `keep` -> `kept`, `reject` -> `rejected`; blanks and anything else are
  ignored. Run manually per sorting batch.
- `canon` rows are never demoted (expert sign-off outranks the Sheet), and
  decisions for items missing from the corpus are warned about, not created.

## embed_corpus.py — corpus_documents -> corpus_chunks (ASK-2)

```bash
python3 scripts/basecamp-corpus/embed_corpus.py --dry-run   # always first
python3 scripts/basecamp-corpus/embed_corpus.py
```

- **The ASK-2 migration must be applied first:**
  `supabase/migrations/20260821140000_ask2_hybrid_search.sql`.
- Chunks every `kept`/`canon` document that is dirty (new, or changed since
  its last chunking — see `corpus_chunk_sync_state`, maintained by a trigger
  on `corpus_documents`) and embeds each chunk with OpenAI
  `text-embedding-3-small`.
- **Requires `OPENAI_API_KEY` in `scripts/basecamp-corpus/.env`** (see
  `.env.example`) to produce real vectors. Without it, the script still
  writes chunks with full-text-searchable content and `embedding = NULL`,
  and leaves those documents marked dirty — a future run with the key
  present finishes the job. It never pretends a chunk has an embedding it
  doesn't.
- Idempotent per document: re-running only touches documents still marked
  dirty; a document's old chunks are fully replaced (not merged) each time
  it's re-chunked, since edits can change chunk boundaries and counts.
- Safe to run after every `ingest_corpus.py` / `sync_decisions.py` batch.

## mirror_pro_moves.py — pro_moves + resources -> corpus_documents (ASK-5)

Mirrors every active, platform-owned pro move into `corpus_documents` as one
generated `canon` document (framework prose from `pro_moves` plus its active
`pro_move_resources` bodies, inlined as titled sections). See
`docs/specs/ask-5-pro-moves-corpus-mirror.md` for the full design.

```bash
python3 scripts/basecamp-corpus/mirror_pro_moves.py --dry-run   # always first
python3 scripts/basecamp-corpus/mirror_pro_moves.py             # writes + prints an embed reminder
python3 scripts/basecamp-corpus/mirror_pro_moves.py --chain      # writes, then runs embed_corpus.py
```

**⚠️ Attended-run rule (do not automate this script).** Every run should be
a human sitting at the keyboard, reading the `--dry-run` report before
running for real. Two reasons:

1. **Sequencing.** Do not run this for real before the ASK-2 hybrid-search
   cutover has shipped. The ~339 mirror docs (roughly 80k tokens once
   headers are included) would crowd the ask-alcan-v1 spike's 150k-token
   context-packing window and degrade Basecamp answers. After cutover this
   restriction no longer applies.
2. **Prod is prod.** This script writes to `corpus_documents` with the
   service-role key, same trust model as every other script here. Read the
   dry-run output before running for real, every time.

Mirror rows insert as `canon` (skip the review queue -- the framework is
already the most curated content in the product), `source_kind='authored'`,
`source_item_id` is `promove:<action_id>` (the idempotency key). Retiring a
pro move (`active = false`, the only removal path) flips its existing mirror
row's status to `rejected` on the next run -- same semantics as a Basecamp
reject: audit trail kept, row leaves the answer set.

**Refresh strategy.** Every run re-renders *all* active pro moves and
content-hashes each rendered doc against what's already in
`corpus_documents`, so it's self-healing: it can never miss an edit,
because it doesn't consume change events, it just compares current state to
current state (same principle as `embed_corpus.py`'s dirty tracking, applied
without needing a trigger/dirty-flag table of its own). A local watermark
(`max(framework_history.id)`, stored in the gitignored
`scripts/basecamp-corpus/.mirror_watermark.json`) is a pure performance
short-circuit for "nothing changed since I last looked," checked in one
query. It cannot cause a missed sync: a dry-run preview's watermark is never
trusted by a real (write) run, only a watermark that a prior real run itself
confirmed is. Pass `--force` to skip the short-circuit and always do a full
render+diff (harmless, just slower).

Expert-area mapping (which `corpus_expert_areas` a role's pro moves belong
to) lives in `mirror_lib.EXPERT_AREA_BY_ROLE`, a small dict keyed by role
name. A role with active pro moves but no entry there gets
`expert_area_id = NULL` and a printed warning rather than a guess.

**Out of scope (per spec):** org-owned pro moves (`owner_org_id` is not
null; filtered out -- none exist live yet), competency-overview docs
(Option C in the spec), non-Alcan orgs.

## Tests

Pure logic lives in modules with no database or network dependency, and is
tested directly:

```bash
cd scripts/basecamp-corpus
python3 -m unittest test_corpus_lib -v   # ASK-1: text parsing, ledger mapping, decisions
python3 -m unittest test_chunk_lib -v    # ASK-2: chunking, dirty-tracking, vector formatting
python3 -m unittest test_mirror_lib -v   # ASK-5: rendering, hashing, diff planning, watermark logic
```
