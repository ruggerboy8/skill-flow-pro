-- ASK-6 follow-up: provenance on glossary entries.
--
-- A glossary that asserts facts with no source silently becomes wrong (the
-- first seed claimed "Thinkific" is in use; it is retired). Every entry now
-- carries where its claim came from, so a wrong entry is traceable and the
-- unbacked ones are visibly flagged.
--
--   provenance = 'corpus'           -> grounded in Alcan corpus documents
--                                      (ids in source_document_ids; also
--                                      searchable by the term itself)
--                'domain_knowledge' -> standard dental/business knowledge,
--                                      NOT an Alcan-specific claim, no source
--                'assumption'       -> an Alcan-specific claim asserted with
--                                      NO confirming source; VERIFY before trust
--
-- Default is 'assumption': an entry is unproven until it is classified.

alter table public.corpus_glossary
  add column if not exists provenance text not null default 'assumption'
    check (provenance in ('corpus','domain_knowledge','assumption')),
  add column if not exists source_document_ids uuid[] not null default '{}';

comment on column public.corpus_glossary.provenance is
  'Where this entry''s claim comes from: corpus (backed by source_document_ids), domain_knowledge (general, no Alcan source), or assumption (unverified Alcan claim).';
comment on column public.corpus_glossary.source_document_ids is
  'corpus_documents ids that back this entry (representative, not exhaustive). Empty for domain_knowledge / assumption.';
