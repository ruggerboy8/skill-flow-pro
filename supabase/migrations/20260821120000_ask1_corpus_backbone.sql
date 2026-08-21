-- ASK-1: corpus backbone for the Ask Alcan assistant.
-- New tables only (additive, no live paths touched):
--   corpus_expert_areas  — ownership-as-data for corpus territories
--   corpus_documents     — the curated corpus (single source of truth; ASK-2's
--                          chunks/embeddings will be DERIVED from this table,
--                          never change its columns)
--   ask_conversations    — chat log header, owned by the asking user
--   ask_messages         — chat log body + per-message cited document ids
--
-- Access model in this phase (per spec docs/specs/ask-1-corpus-backbone-and-spike.md):
--   corpus_* tables:            super-admin-only, both directions.
--   ask_conversations/messages: asker-only. HARD CONSENT REQUIREMENT — no
--     coach/admin/anyone-else read path. Do not add one in a later migration
--     without an explicit product decision (consent decision, 2026-08-20).
--
-- Idempotent: safe to re-run.

-- ─── Tables ──────────────────────────────────────────────────────────────────

create table if not exists public.corpus_expert_areas (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations(id),
  area_name      text not null,
  -- Ownership is data, set later in-app. Never hardcode people here.
  owner_staff_id uuid references public.staff(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (org_id, area_name)
);

create table if not exists public.corpus_documents (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations(id),
  title          text not null,
  body           text,             -- markdown; NULL for deferred bodies (PDFs, phase 1)
  summary        text,
  -- Curation state machine: ingest lands 'unreviewed'; John's Sheet "keep"
  -- promotes to 'kept'; expert sign-off (ASK-3) promotes to 'canon';
  -- 'rejected' is retained for audit, excluded from everything.
  status         text not null default 'unreviewed'
                   check (status in ('unreviewed','kept','canon','rejected')),
  tier           smallint check (tier in (1,2,3)),
  expert_area_id uuid references public.corpus_expert_areas(id) on delete set null,
  audience       text,
  source_kind    text not null default 'basecamp'
                   check (source_kind in ('basecamp','authored','external')),
  source_url     text,             -- Basecamp deep link
  source_item_id text,             -- ingest idempotency key (NULL for authored docs)
  posted_at      timestamptz,      -- original posting date
  stale_risk     boolean not null default false,
  location_scope text,
  created_by     uuid references public.staff(id) on delete set null,
  reviewed_by    uuid references public.staff(id) on delete set null,
  reviewed_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  -- Idempotency key is per-org: a future second org's Basecamp item ids
  -- must not collide with Alcan's. (Rows with NULL source_item_id — authored
  -- docs — are unconstrained; Postgres unique treats NULLs as distinct.)
  unique (org_id, source_item_id)
);

create index if not exists idx_corpus_documents_status
  on public.corpus_documents(org_id, status);
create index if not exists idx_corpus_documents_expert_area
  on public.corpus_documents(expert_area_id);

create table if not exists public.ask_conversations (
  id         uuid primary key default gen_random_uuid(),
  staff_id   uuid not null references public.staff(id) on delete cascade,
  title      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_ask_conversations_staff
  on public.ask_conversations(staff_id, updated_at desc);

create table if not exists public.ask_messages (
  id                 uuid primary key default gen_random_uuid(),
  conversation_id    uuid not null references public.ask_conversations(id) on delete cascade,
  role               text not null check (role in ('user','assistant')),
  content            text not null,
  cited_document_ids uuid[] not null default '{}',
  created_at         timestamptz not null default now()
);

create index if not exists idx_ask_messages_conversation
  on public.ask_messages(conversation_id, created_at);

-- ─── updated_at triggers ─────────────────────────────────────────────────────

create or replace function public.corpus_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_corpus_expert_areas_updated_at on public.corpus_expert_areas;
create trigger trg_corpus_expert_areas_updated_at
  before update on public.corpus_expert_areas
  for each row execute function public.corpus_set_updated_at();

drop trigger if exists trg_corpus_documents_updated_at on public.corpus_documents;
create trigger trg_corpus_documents_updated_at
  before update on public.corpus_documents
  for each row execute function public.corpus_set_updated_at();

drop trigger if exists trg_ask_conversations_updated_at on public.ask_conversations;
create trigger trg_ask_conversations_updated_at
  before update on public.ask_conversations
  for each row execute function public.corpus_set_updated_at();

-- ─── RLS ─────────────────────────────────────────────────────────────────────

alter table public.corpus_expert_areas enable row level security;
alter table public.corpus_documents    enable row level security;
alter table public.ask_conversations   enable row level security;
alter table public.ask_messages        enable row level security;

-- corpus_expert_areas / corpus_documents: super-admin-only in this phase
-- (same gate as the surveys surface). Anon and ordinary staff see nothing.
drop policy if exists corpus_expert_areas_superadmin_all on public.corpus_expert_areas;
create policy corpus_expert_areas_superadmin_all on public.corpus_expert_areas
  for all
  using (public.is_superadmin())
  with check (public.is_superadmin());

drop policy if exists corpus_documents_superadmin_all on public.corpus_documents;
create policy corpus_documents_superadmin_all on public.corpus_documents
  for all
  using (public.is_superadmin())
  with check (public.is_superadmin());

-- ask_conversations: ASKER-ONLY. Deliberately no coach/admin/super-admin read
-- path — coaches never see conversations (consent decision). Mirrors the
-- coach_session_reflections private-by-design pattern.
drop policy if exists ask_conversations_owner_all on public.ask_conversations;
create policy ask_conversations_owner_all on public.ask_conversations
  for all
  using (staff_id = public.get_current_staff_id())
  with check (staff_id = public.get_current_staff_id());

-- ask_messages: reachable only through a conversation the caller owns.
drop policy if exists ask_messages_owner_all on public.ask_messages;
create policy ask_messages_owner_all on public.ask_messages
  for all
  using (exists (
    select 1 from public.ask_conversations c
    where c.id = ask_messages.conversation_id
      and c.staff_id = public.get_current_staff_id()
  ))
  with check (exists (
    select 1 from public.ask_conversations c
    where c.id = ask_messages.conversation_id
      and c.staff_id = public.get_current_staff_id()
  ));

-- ─── Grants ──────────────────────────────────────────────────────────────────
-- Local Supabase doesn't auto-grant table privileges to API roles the way
-- hosted does; grant explicitly. RLS still governs what authenticated can see.
-- anon gets nothing (acceptance: both tables unreadable to anon).

grant select, insert, update, delete on public.corpus_expert_areas to authenticated, service_role;
grant select, insert, update, delete on public.corpus_documents    to authenticated, service_role;
grant select, insert, update, delete on public.ask_conversations   to authenticated, service_role;
grant select, insert, update, delete on public.ask_messages        to authenticated, service_role;

-- ─── Seed: the three current expert areas ────────────────────────────────────
-- owner_staff_id stays NULL: ownership is data, assigned later in-app.
-- Guarded so the migration also succeeds on a database without the Alcan org.

insert into public.corpus_expert_areas (org_id, area_name)
select o.id, a.area_name
from (values ('RDA practice'), ('clinical'), ('operations')) as a(area_name)
join public.organizations o
  on o.id = 'a1ca0000-0000-0000-0000-000000000001'::uuid
on conflict (org_id, area_name) do nothing;

-- ─── Sanity check ────────────────────────────────────────────────────────────

do $$
declare
  v_areas int;
begin
  if exists (
    select 1 from public.organizations
    where id = 'a1ca0000-0000-0000-0000-000000000001'::uuid
  ) then
    select count(*) into v_areas
    from public.corpus_expert_areas
    where org_id = 'a1ca0000-0000-0000-0000-000000000001'::uuid;
    if v_areas < 3 then
      raise exception 'ASK-1 seed check failed: expected 3 expert areas, found %', v_areas;
    end if;
  end if;
end;
$$;
