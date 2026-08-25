-- ASK-6: corpus_glossary — per-org house-vocabulary the Ask assistant loads
-- to translate the words staff actually say into the terms the corpus uses.
--
-- Why this exists: the Pro Moves mirror labels the front-desk role "Front
-- Desk", but staff call it "DFI" (Director of First Impressions). A search
-- for "DFI" text-matched nothing and the bare acronym embedded closer to an
-- X-ray-refusal doc, so the assistant missed every Front Desk pro move. The
-- glossary lets the assistant expand "DFI" -> "Front Desk" (and RDA ->
-- Dental Assistant, OM -> Office Manager, ...) before it searches.
--
-- Shape is deliberately ORG-AGNOSTIC (multi-tenant): the table is generic
-- infrastructure; each org's terms are seeded as data (see the Alcan seed,
-- kept as a separate data file, not in this migration). Same gate + pattern
-- as corpus_expert_areas.

create table if not exists public.corpus_glossary (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id),
  -- The canonical term as it appears in the corpus / how the org wants it said.
  term        text not null,
  -- The words people actually say for it: acronyms, slang, common variants,
  -- frequent misspellings. This is what makes a search match.
  aliases     text[] not null default '{}',
  -- What kind of thing this is, so the assistant can reason about it.
  category    text not null default 'other'
                check (category in
                  ('role','team','program','tool','procedure','place',
                   'acronym','value','benefit','other')),
  -- One to three plain sentences an assistant (or a new hire) can rely on.
  definition  text not null,
  -- Optional: for a role/territory term, the expert area or canonical role it
  -- maps to. Kept as free text (not a hard FK) so seeding is portable.
  maps_to     text,
  -- Optional org-specific caveat, scope note, or "confirm this" flag.
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (org_id, term)
);

drop trigger if exists trg_corpus_glossary_updated_at on public.corpus_glossary;
create trigger trg_corpus_glossary_updated_at
  before update on public.corpus_glossary
  for each row execute function public.corpus_set_updated_at();

alter table public.corpus_glossary enable row level security;

-- Same phase-1 gate as the rest of the corpus surface: super-admin only.
drop policy if exists corpus_glossary_superadmin_all on public.corpus_glossary;
create policy corpus_glossary_superadmin_all on public.corpus_glossary
  for all
  using (public.is_superadmin())
  with check (public.is_superadmin());

grant select, insert, update, delete on public.corpus_glossary to authenticated, service_role;
