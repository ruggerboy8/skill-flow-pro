# ASK-2: Hybrid search + tool loop for Ask Alcan

**Status:** ticketed 2026-08-21 (John, in-session). Architecture was locked in
`docs/features/ask-alcan-assistant.md` v0.2; this spec operationalizes it.

## Why now

- The spike packs the entire kept+canon corpus into every request, capped at
  ~150k tokens. Bulk-accepting the non-conflicted AI keeps (decision parked
  with John) pushes past that ceiling, and the 240+ Basecamp video
  transcripts arriving from the Studio pipeline blow it out entirely.
- John, 2026-08-21: with videos and documents to link, tool calling matters.
  A tool loop lets the bot *find* a video or PDF and hand back its link,
  instead of only answering from text bodies it happens to have inline.
- The `ask-alcan-packed` log line is the live gauge of how close the ceiling
  is.

## What (three parts, dependency order)

### 1. Derived chunk store (additivity guarantee honored)

- Enable `pgvector` (currently NOT enabled anywhere in this DB).
- New table `corpus_chunks`: id, document_id FK -> corpus_documents ON
  DELETE CASCADE, chunk_index, content, embedding vector, fts tsvector
  (generated column). **Derived data only**: `corpus_documents` keeps its
  exact shape (the ASK-2 additivity contract from the ASK-1 spec).
- Sync mechanism, phase-appropriate: today the ONLY writers of
  corpus_documents are John's local scripts (ingest, sync_decisions), so a
  local `embed_corpus.py` run after each sync (same trust model, same .env)
  is sufficient and avoids standing up queue/cron infra in prod overnight.
  A trigger-maintained dirty flag on corpus_chunks makes the script cheap
  (re-embed only changed docs). Graduate to the Supabase
  automatic-embeddings pattern (queue + edge worker) when the ASK-3 corpus
  manager makes in-app edits possible. Chunking: whole doc if small, split
  on headings/size otherwise. Documents with NULL body (link-only: videos
  pre-transcript, phase-1 PDFs) chunk their title+summary so they are
  findable and linkable.
- Embedding model: build-time decision. Leaning OpenAI
  `text-embedding-3-small` since `OPENAI_API_KEY` already exists as a
  function secret in this project; document the choice in the migration.
- RLS on corpus_chunks mirrors corpus_documents (super-admin in this phase).

### 2. Hybrid search function

- SQL function `search_corpus(query_text, query_embedding, ...)`:
  full-text + vector similarity fused with reciprocal rank fusion.
  **SECURITY INVOKER** so RLS governs visibility now and when access
  widens later. Returns document_id, title, source_url, status, snippet,
  rank. Kept + canon only.

### 3. ask-alcan edge function v2: tool loop

- Anthropic tool use (claude-sonnet-5) with two tools:
  - `search_corpus(query)` -> ranked snippets with document ids
  - `read_document(document_id)` -> full body (or title+link for bodyless
    docs)
- Loop until the model answers; cap tool calls per question (e.g. 8).
- System prompt keeps all current rules (answer only from corpus, cite,
  contradiction posture, venting posture, verbatim scripts, Alcan voice)
  plus: when the best source is a video or file without inline text, say
  so and cite it so the user gets the link.
- Prompt caching moves to system+tools prefix (the corpus no longer rides
  in the prompt). Conversation history handling unchanged (last 10).
- **FROZEN response contract unchanged**: `{ answer, citations:
  [{document_id, title, source_url}] }` — citations now derive from the
  documents actually read/used. The frontend needs zero changes (this is
  the additivity guarantee paying off).
- Keep the packed-size-style logging: tool calls made, documents read,
  tokens, cache stats.
- Graceful degradation: if search errors, return the friendly failure
  message; never fall back to answering from general knowledge.

## Deploy plan (conservative-migration pattern; set 2026-08-21 for the
## unattended run)

Build alongside, cut over attended:
1. The additive migration (pgvector + corpus_chunks + search function) MAY
   be applied to prod unattended: it touches no live path and
   corpus_documents keeps its exact shape.
2. Backfill embeddings for current kept+canon docs via the local script.
3. Deploy the v2 function as **`ask-alcan-v2`** (a SEPARATE function name,
   verify_jwt on). The live `ask-alcan` spike keeps serving /ask untouched.
4. Test end-to-end against ask-alcan-v2 with real questions (see
   acceptance).
5. **Cutover is attended**: with John, redeploy v2's code over the
   `ask-alcan` name, watch the logs, keep the spike code one `git revert`
   away. Frontend unchanged either way.

## Acceptance

1. A question answerable only from a document outside any 150k packing
   window gets a correct, cited answer.
2. A question whose best source is a link-only document (e.g. a video row)
   returns an answer that names it and cites its source_url.
3. Same-question-twice behaves (history + caching intact); consent model,
   super-admin gate, and response shape byte-identical in structure.
4. Editing a corpus document re-embeds it (automatic sync verified).
5. Existing /ask frontend works unmodified against v2.

## Out of scope

- Corpus manager UI, questions table (ASK-3 family)
- Contradiction detection batch (ASK-4)
- Coach-companion personal-data tools (answerer v1.1)
- Widening access beyond super-admins

## Notes

- Graph retrieval stays rejected at this corpus size (decision 2026-08-20).
- When video transcripts land, they enter as body updates to existing rows
  (or new rows for the 204 title-judged wrapper items); automatic sync
  embeds them with no extra pipeline work — that is the payoff of part 1.
