# Ask Alcan Assistant (RAG + Tools)

**Status:** v0.1 outline, 2026-08-13. Brainstorm output; not yet a build
plan. Open questions for John at the bottom. Companion doc:
`pwa-push-notifications.md` (the app shell this assistant lives in).

**The pitch in one line:** a chat surface inside Pro Moves where any staff
member can ask how Alcan works ("what's the hygiene setup procedure," "what
do I say to an upset parent about timing") and get a grounded, cited answer
drawn from a curated set of Alcan documents, with live-data questions
(Deputy, scores) handled by tools rather than documents.

Grounding facts: stack is Vite + React + Supabase. Supabase Postgres
supports the `pgvector` extension. Claude-calling edge functions already
exist and work (`extract-insights`, `format-reflection`,
`transcribe-audio`), so the secret handling and invocation pattern is
proven. Institutional knowledge lives today in Basecamp (which has an API).
Anthropic does not sell an embeddings API; Voyage AI (Anthropic's
recommendation) or OpenAI embeddings fill that slot. Chat generation uses
`claude-opus-5`.

---

## A. How RAG works here (plain-language model)

1. **Ingest:** each curated document is split into chunks (a few hundred
   words). Each chunk goes through an embedding model, which converts text
   to a vector where similar meanings land near each other. Chunks and
   vectors are stored in Postgres.
2. **Retrieve:** a staff question is embedded the same way; the closest 5-10
   chunks are fetched (combined with plain keyword search, see D).
3. **Generate:** Claude gets a system prompt (persona, guardrails,
   escalation rules), the retrieved chunks, and the question, and writes a
   cited answer.

Nothing is "trained." The model never memorizes Alcan content; it reads the
retrieved chunks fresh on every question. This is the key fact behind
versioning (next section).

## B. Versioning and freshness (John's question)

**Updating a changed policy is cheap, fast, and total.** Because answers are
generated from retrieved chunks at question time, there is no model to
retrain and no lag: the moment a document's chunks are replaced in the
database, every subsequent answer reflects the new text. Concretely:

- Chunks carry `document_id`. Re-ingesting a document is: delete its chunks,
  re-chunk the new text, re-embed, insert. One transaction, seconds of wall
  time, well under a cent of embedding cost per document.
- The hard part is not updating; it is **knowing something changed**. Two
  mechanisms:
  1. **Sync, don't copy.** Documents are pulled from their source of truth
     (Basecamp API for docs there; the Pro Moves DB for framework content)
     by a scheduled job. Each `knowledge_documents` row stores a
     `content_hash`; the nightly sync re-ingests only rows whose source hash
     changed. Hand-pasted copies are what rot; synced sources cannot drift.
  2. **Ownership.** Each document has an owner and the corpus is a curated
     allowlist, so "update the policy" means editing the canonical Basecamp
     doc like today, and the bot follows within a day (or immediately via a
     manual "re-sync now" button on the admin surface).
- Optional but cheap insurance, matching the `framework_history` ethos: an
  append-only `knowledge_document_versions` table capturing each ingested
  text + hash + timestamp. That gives an audit trail ("what did the bot
  believe on July 3rd") and pairs with the Q&A log so any past answer can be
  explained. Old versions are never retrieved; only current chunks live in
  the search index.
- Deletions work the same way: drop a document from the allowlist and its
  chunks are removed; the bot can no longer cite it. There is no residue.

The corollary risk is the opposite direction: the bot is only as current as
the corpus, and it will confidently cite a stale doc that nobody updated at
its source. That is a content-ownership problem, not a technical one, and it
argues for a small curated corpus over a scrape-everything corpus.

## C. Data model (new tables, additive only)

- `knowledge_documents`: id, source ('basecamp' | 'manual' | 'pro_moves'),
  source_ref (Basecamp doc id / URL), title, owner_staff_id, audience
  (role/scope tags for RLS), content_hash, active, created_at, updated_at.
- `knowledge_chunks`: id, document_id (FK, cascade delete), chunk_index,
  content, embedding vector(1024), tsv (generated tsvector for keyword
  search). HNSW index on embedding, GIN on tsv.
- `assistant_conversations` / `assistant_messages`: per-staff chat history,
  RLS-scoped to the owner. Messages log retrieved chunk ids and tool calls
  alongside the answer (the audit + improvement loop).
- Optional: `knowledge_document_versions` (append-only, see B).

RLS: audience tags on documents flow to chunks; the retrieval function runs
as the calling user so role-restricted content (manager-only docs) is
structurally invisible to the wrong audience, same discipline as the rest of
the platform.

## D. Retrieval

One SQL function `match_chunks(query_embedding, query_text, k)` doing
**hybrid search**: vector cosine similarity + keyword (tsvector) rank,
merged with reciprocal rank fusion. Hybrid is current best practice and
matters here specifically because dental/ops vocabulary ("pro fee",
"Deputy", "SSC") is exact-match territory where pure vector search
underperforms. Supabase documents this exact pattern.

## E. The assistant is tools-first, RAG is one tool

The example questions split into three species: policy/procedure (docs),
live operational data (Deputy, schedules, production), and coaching
(framework + docs). So the chat edge function (`ask-alcan`) runs Claude
(`claude-opus-5`) with tool use, and Claude picks per question:

1. `search_alcan_docs(query)` — the RAG retrieval above. **v1 ships with
   only this tool.**
2. `get_my_pro_moves()` — the user's current focus/assignments from the Pro
   Moves DB. Zero external friction; natural second tool.
3. `get_my_schedule()` — Deputy read-only API. Answers "why is that day
   blacked out" with the actual roster context plus the policy doc.
4. Later: production data views for doctors, eval score lookups.

Answers stream to the client (the edge function relays Claude's stream) and
cite sources as links to the underlying doc. Cost order-of-magnitude: one or
two cents per question; heavy org-wide use is dollars per month. Embedding
the whole corpus is cents.

## F. Guardrails

System prompt commitments, enforced by the curated corpus + logging:

- Answer only from retrieved material and tool results; when retrieval comes
  back thin, say "I don't have that documented" and point to the right human
  rather than guessing.
- HR-adjacent boundaries: policy questions get policy answers; anything
  drifting into individual personnel matters ("is this fair," "why was I
  scheduled less") gets a warm handoff to the office manager / HR contact,
  never speculation.
- Never reveal content the user's role should not see (structurally
  guaranteed by RLS, restated in the prompt as defense in depth).
- Every exchange is logged (assistant_messages) for safety review and,
  just as valuable, as a demand signal: unanswered questions are the
  backlog for which doc to write next.

## G. Corpus curation (the real work)

- Phase 0 is a content audit: pick 20-50 canonical documents from Basecamp,
  assign owners, tag audiences. Announcements, comment threads, and
  duplicates stay out. The bot's quality ceiling is set here, not in code.
- Basecamp sync via its API for the chosen docs (nightly + manual re-sync).
- Pro Move learning materials (`pro_move_resources`) can be ingested as a
  source too, giving the assistant the framework's own scripts and examples
  with zero copying.

## H. Rollout

1. **Spike (a day or two):** 5-10 docs hand-loaded, embeddings + hybrid
   search + a bare `ask-alcan` function, tested from a scratch page. Goal:
   John sees real answers with citations and gets a feel for chunking and
   retrieval quality before any corpus work.
2. **v1 pilot:** curated corpus, chat UI in Pro Moves (super-admin gated
   first, like Ask Alcan surveys was), pilot group = leads or one location.
   Watch the logs weekly; tune corpus.
3. **v2:** `get_my_pro_moves` tool, org-wide release, push notification
   integration ("your question from earlier now has a documented answer").
4. **v3:** Deputy read-only tool; doctor production views.

## I. Open questions for John

1. Corpus scope for v1: is 20-50 curated Basecamp docs realistic, and who
   besides you can own the audit (per-domain owners: clinical, clerical,
   HR/Deputy)?
2. Should chat history be visible to anyone besides the staff member (e.g.
   aggregate/anonymized themes for leadership, like survey anonymity
   handling)? Default assumption: private to the user + a service-level
   safety log, with aggregate reporting anonymized.
3. Escalation target for HR-adjacent handoffs: office manager, a named HR
   contact, or per-location?
4. Embeddings vendor: Voyage (Anthropic's recommendation) vs OpenAI. Either
   works; this adds one new API key to edge function secrets. Any
   preference?
5. Is Basecamp API access straightforward to provision (admin OAuth app on
   the Alcan account), or is doc export more practical to start?
6. Alcan-only feature for now (like surveys), or designed multi-tenant from
   day one (`owner_org_id` on knowledge tables)? Default assumption:
   schema is org-aware from the start since it is cheap, UI gated to Alcan.
