-- ASK-2: derived chunk store + hybrid search function.
--
-- Additive only, per the ASK-2 additivity contract: corpus_documents keeps
-- its exact shape (no new columns, no dropped columns). Everything here is
-- DERIVED from corpus_documents and safe to drop and rebuild at any time.
--
-- Embedding model: OpenAI text-embedding-3-small (1536 dims). Chosen because
-- OPENAI_API_KEY already exists as a Supabase function secret in this
-- project (see docs/specs/ask-2-hybrid-search-tool-loop.md, "Implementation
-- direction"). Embedding calls are made by the local embed_corpus.py script
-- via a small proxy edge function (corpus-embed) rather than directly,
-- because the local script's trust boundary (scripts/basecamp-corpus/.env)
-- only holds the Supabase service-role key, not the OpenAI key.
--
-- Idempotent: safe to re-run.

-- ─── Extension ───────────────────────────────────────────────────────────────
-- pgvector was not enabled anywhere in this DB before ASK-2.
create extension if not exists vector with schema extensions;

-- ─── corpus_chunks (derived from corpus_documents) ────────────────────────────
create table if not exists public.corpus_chunks (
  id            uuid primary key default gen_random_uuid(),
  document_id   uuid not null references public.corpus_documents(id) on delete cascade,
  chunk_index   int not null,
  content       text not null,
  embedding     extensions.vector(1536),
  -- Generated column: kept in sync automatically, never written directly.
  fts           tsvector generated always as (to_tsvector('english', content)) stored,
  created_at    timestamptz not null default now(),
  unique (document_id, chunk_index)
);

create index if not exists corpus_chunks_fts_idx
  on public.corpus_chunks using gin (fts);

-- HNSW is "free" at this corpus size (a few hundred chunks) but costs
-- nothing to have ready for when the corpus grows.
create index if not exists corpus_chunks_embedding_idx
  on public.corpus_chunks using hnsw (embedding extensions.vector_cosine_ops);

alter table public.corpus_chunks enable row level security;

drop policy if exists corpus_chunks_superadmin_all on public.corpus_chunks;
create policy corpus_chunks_superadmin_all on public.corpus_chunks
  for all using (public.is_superadmin()) with check (public.is_superadmin());

-- ─── corpus_chunk_sync_state (the "dirty flag", derived, not on corpus_documents) ──
-- One row per corpus_documents row that has ever been considered for
-- chunking. A trigger on corpus_documents marks a row dirty whenever a
-- content-affecting column changes; embed_corpus.py clears dirty=false once
-- it has re-chunked and re-embedded that document. This lets the backfill
-- script skip unchanged documents cheaply instead of re-hashing every
-- document's content on every run.
create table if not exists public.corpus_chunk_sync_state (
  document_id   uuid primary key references public.corpus_documents(id) on delete cascade,
  dirty         boolean not null default true,
  chunked_at    timestamptz,
  embedded_at   timestamptz,
  updated_at    timestamptz not null default now()
);

alter table public.corpus_chunk_sync_state enable row level security;

drop policy if exists corpus_chunk_sync_state_superadmin_all on public.corpus_chunk_sync_state;
create policy corpus_chunk_sync_state_superadmin_all on public.corpus_chunk_sync_state
  for all using (public.is_superadmin()) with check (public.is_superadmin());

create or replace function public.corpus_documents_mark_dirty()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  insert into public.corpus_chunk_sync_state (document_id, dirty, updated_at)
  values (new.id, true, now())
  on conflict (document_id) do update
    set dirty = true, updated_at = now();
  return new;
end;
$$;

drop trigger if exists corpus_documents_mark_dirty_trg on public.corpus_documents;
create trigger corpus_documents_mark_dirty_trg
  after insert or update of title, body, summary, status, source_url
  on public.corpus_documents
  for each row execute function public.corpus_documents_mark_dirty();

-- ─── search_corpus: hybrid FTS + vector, fused with reciprocal rank fusion ────
-- SECURITY INVOKER (not DEFINER): RLS on corpus_chunks/corpus_documents
-- governs visibility now (super-admin only) and whenever access widens
-- later, without this function needing to change. Kept + canon only.
--
-- Either query_text or query_embedding may be null/empty to run FTS-only or
-- vector-only; normal use passes both.
create or replace function public.search_corpus(
  query_text text,
  query_embedding extensions.vector(1536) default null,
  match_count int default 10
)
returns table (
  document_id uuid,
  title       text,
  source_url  text,
  status      text,
  snippet     text,
  rank        double precision
)
language sql stable security invoker set search_path to 'public', 'extensions' as $$
  with fts_ranked as (
    select cc.id as chunk_id, cc.document_id, cc.content,
           row_number() over (
             order by ts_rank_cd(cc.fts, websearch_to_tsquery('english', query_text)) desc
           ) as rnk
    from public.corpus_chunks cc
    join public.corpus_documents cd on cd.id = cc.document_id
    where cd.status in ('kept', 'canon')
      and query_text is not null and length(trim(query_text)) > 0
      and cc.fts @@ websearch_to_tsquery('english', query_text)
    limit 50
  ),
  vec_ranked as (
    select cc.id as chunk_id, cc.document_id, cc.content,
           row_number() over (order by cc.embedding <=> query_embedding) as rnk
    from public.corpus_chunks cc
    join public.corpus_documents cd on cd.id = cc.document_id
    where cd.status in ('kept', 'canon')
      and query_embedding is not null
      and cc.embedding is not null
    order by cc.embedding <=> query_embedding
    limit 50
  ),
  fused as (
    select chunk_id, document_id, content, 1.0 / (60 + rnk) as score from fts_ranked
    union all
    select chunk_id, document_id, content, 1.0 / (60 + rnk) as score from vec_ranked
  ),
  chunk_scores as (
    select chunk_id, document_id, content, sum(score) as score
    from fused
    group by chunk_id, document_id, content
  ),
  best_chunk as (
    select distinct on (document_id) document_id, content
    from chunk_scores
    order by document_id, score desc
  ),
  doc_scores as (
    select document_id, sum(score) as total_score
    from chunk_scores
    group by document_id
  )
  select cd.id as document_id, cd.title, cd.source_url, cd.status,
         left(bc.content, 600) as snippet, ds.total_score as rank
  from doc_scores ds
  join best_chunk bc using (document_id)
  join public.corpus_documents cd on cd.id = ds.document_id
  order by ds.total_score desc
  limit match_count;
$$;

grant execute on function public.search_corpus(text, extensions.vector, int) to authenticated;

-- ─── Sanity check ──────────────────────────────────────────────────────────
do $$
declare
  v_has_vector boolean;
begin
  select exists(select 1 from pg_extension where extname = 'vector') into v_has_vector;
  if not v_has_vector then
    raise exception 'ASK-2 migration sanity check failed: pgvector extension not installed';
  end if;
  if to_regclass('public.corpus_chunks') is null then
    raise exception 'ASK-2 migration sanity check failed: corpus_chunks table missing';
  end if;
  if to_regprocedure('public.search_corpus(text, extensions.vector, int)') is null then
    raise exception 'ASK-2 migration sanity check failed: search_corpus function missing';
  end if;
end $$;
