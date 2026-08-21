# Spec: ASK-1, corpus backbone + gated "Ask Alcan" spike surface

**Status:** draft, awaiting John's approval
**Lane:** new feature, additive only (new tables, one new edge function, one
new super-admin route; no changes to live paths)
**Ticket:** ASK-1 (Motion, MyProMoves Dev Board)
**Branch:** feat/ask-1-corpus-backbone

## What and why

The Ask assistant plan (docs/features/ask-alcan-assistant.md v0.2) locked the
architecture: one contextual backbone, multiple surfaces, starting with a
pull-only chatbot that answers from a curated corpus with citations. The
Basecamp harvest is done: 1,320 items are catalogued in a sorting ledger
(681 recommended keeps), John is batch-sorting them now, and expert sign-off
will happen in the in-app corpus manager. That creates the dependency this
spec resolves: **the corpus tables and a testable Ask surface need to exist
while curation is happening, not after.** Curation state is data (a status
column), so building and cleaning proceed in parallel; the bot's answerable
territory grows as decisions land.

Phase 1 is deliberately the long-context spike from the plan: stuff the
eligible corpus into a Claude call with citations, no retrieval
infrastructure. The v1 tool loop (hybrid search under RLS, Supabase automatic
embeddings) is ASK-2, and nothing in this phase forecloses it.

## Verified constraints this spec is built on

- The repo has **zero Anthropic usage** today; 18 edge functions call LLMs via
  OpenAI direct or the Lovable gateway. This adds the first Anthropic call, so
  `ANTHROPIC_API_KEY` becomes a new function secret (never in the repo).
- pgvector is not enabled and no embedding columns exist. Phase 1 needs
  neither; do not enable extensions in this ticket.
- Auth template: `pro-move-suggest` (Bearer + getClaims + org-membership
  check). RLS template: `coach_session_reflections` (private by design).
- Gating pattern: super-admin + Alcan org, same as surveys and the coaching
  workspace.
- Corpus ownership must be **data** (an expert-areas table mapped to people),
  never an enum of names: the experts list will grow.

## Data model (migration batch 1)

New tables, all RLS-enabled, super-admin-only access in this phase:

- `corpus_expert_areas`: id, org_id, area_name (e.g. "RDA practice",
  "clinical", "operations"), owner_staff_id (nullable FK to staff). Seeded
  with the three current areas; ownership editable as data.
- `corpus_documents`: id, org_id, title, body (markdown), summary,
  status (`unreviewed` | `kept` | `canon` | `rejected`), tier (1/2/3),
  expert_area_id FK, audience, source_kind (`basecamp` | `authored` |
  `external`), source_url (the Basecamp deep link), source_item_id,
  posted_at (original date), stale_risk bool, location_scope, created_by,
  reviewed_by, reviewed_at, timestamps.
- `ask_conversations` + `ask_messages`: minimal chat log for the spike,
  owned by the asking user, **no coach/admin read path** (consent decision:
  coaches never see conversations). Includes per-message cited document ids.

Status semantics: ledger import lands everything as `unreviewed`; John's
Sheet decision "keep" promotes to `kept`; expert sign-off in the corpus
manager (ASK-3) promotes to `canon`; "reject" marks `rejected` (retained for
audit, excluded from everything). The spike answers from `kept` + `canon`
only; flip to canon-only later by changing one constant.

## Ingestion (batch 1, script not migration)

`scripts/basecamp-corpus/ingest_corpus.py`:

- Reads ledger-full.csv + the extracted text in data/basecamp/text/.
- Imports rows whose recommendation is keep/maybe as `unreviewed`
  corpus_documents (body = extracted text; PDFs import title + link only in
  this phase, body extraction is a follow-up; videos wait for transcripts).
- Idempotent on source_item_id: re-running updates rather than duplicates.
- A companion `sync_decisions.py` reads John's exported Sheet decisions and
  updates statuses (keep → kept, reject → rejected). Run manually per batch.
- Runs against prod via the service role from John's machine (same pattern as
  the demo-seed scripts); nothing here is reachable from the app.

## The spike surface (batch 2)

- New route `/ask`, visible only to super-admins in the Alcan org (reuse the
  surveys gate). As built, the gate deliberately follows the surveys gate's
  current semantics: super-admin from any org gets in (so Tim isn't locked
  out), while the corpus data itself is Alcan-scoped; revisit for
  multi-tenant. Simple chat UI: question box, streaming optional (fine to be
  request/response like every other function), answer with citation chips
  that deep-link to source_url, conversation history in the sidebar.
- New edge function `ask-alcan` (verify_jwt = true):
  1. Auth per pro-move-suggest template; reject non-super-admin.
  2. Load eligible corpus (status in kept/canon), pack as documents into one
     Claude call using the citations feature; model `claude-sonnet-5`.
  3. System prompt encodes the locked behavior: answer ONLY from provided
     documents with citations; if sources don't cover it or contradict each
     other, say so plainly and name the owning expert area instead of
     guessing; deflect venting kindly; never fabricate policy.
  4. Log messages + cited doc ids to ask_messages.
- Cost/latency guard: cap packed corpus at ~150k tokens, newest-first within
  status priority (canon > kept). Log the packed-size so we learn when the
  spike stops scaling — that's the trigger for ASK-2, not a failure.

## The ASK-2 additivity guarantee (design constraint, per John 2026-08-21)

Moving to hybrid retrieval must be additive, never transformative. Two rules
in this build enforce that:

1. **Frozen response contract.** `ask-alcan` returns
   `{ answer, citations: [{ document_id, title, source_url }] }`. ASK-2
   changes how documents are found, not this shape; the frontend must not
   know or care which retrieval engine produced an answer.
2. **Curation data vs derived data.** `corpus_documents` (what humans curate)
   is the only source of truth. ASK-2's chunks/embeddings live in a new
   `corpus_chunks` table generated FROM documents and rebuildable at any
   time. No column of `corpus_documents` changes in ASK-2.

## Out of scope (explicitly)

- Embeddings, hybrid search, the tool loop (ASK-2).
- The corpus manager UI for expert sign-off (ASK-3); until then canon
  promotion happens via sync script.
- Contradiction detection job + corpus_conflicts (ASK-4).
- Any non-super-admin visibility, push, or mobile surface.
- The coach companion's personal-data tools.

## Acceptance script

1. Run ingest: corpus_documents row count matches ledger keep+maybe count
   (minus PDFs/videos deferred); re-run produces zero duplicates.
2. As John (super-admin): /ask loads; ask "what is the nitrous oxide
   monitoring requirement for new RDAs?" → answer cites the nitrous document
   and links to Basecamp.
3. Ask something the corpus can't answer ("what's our 401k match?") → bot
   declines and names where the question should go; no fabrication.
4. As a non-super-admin: /ask self-redirects home for non-super-admins;
   data protected server-side (RLS + ask-alcan 403).
5. Anon: both new tables unreadable (RLS check), function 401s.
6. Sheet round-trip: mark one row reject in the Sheet, run sync_decisions,
   confirm the document leaves the bot's answer set.

## Risks

- **Sensitive content in unreviewed rows.** Mitigated: spike answers only
  from kept/canon, surface is super-admin-only, and conversations have no
  read path for anyone but the asker.
- **Anthropic key is a new secret**: set in Supabase function secrets only;
  document in the deploy notes, never commit.
- **Long-context cost**: each question rereads the packed corpus. Fine for a
  three-person test; the packed-size log tells us when to build ASK-2.
