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

## Tests

Pure logic lives in modules with no database or network dependency, and is
tested directly:

```bash
cd scripts/basecamp-corpus
python3 -m unittest test_corpus_lib -v   # ASK-1: text parsing, ledger mapping, decisions
python3 -m unittest test_chunk_lib -v    # ASK-2: chunking, dirty-tracking, vector formatting
```
