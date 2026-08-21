-- ASK-2 follow-up: fix document ranking in search_corpus().
--
-- QA found that doc_scores summed RRF scores across every chunk of a
-- document, so a document split into many chunks structurally outranked a
-- single precisely-relevant chunk (reproduced: a 5-chunk logistics doc beat
-- the ASL/interpreter docs on a "translation support for a deaf family"
-- probe despite the ASL chunks ranking #1-4 by cosine distance). A document
-- is as relevant as its best chunk: use max(score), not sum(score).
-- Everything else is unchanged from 20260821140000_ask2_hybrid_search.sql.

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
    select document_id, max(score) as total_score
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
