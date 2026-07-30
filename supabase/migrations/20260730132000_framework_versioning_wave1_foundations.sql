-- Pro Move versioning, Wave 1: foundations (R1, R5, R6).
-- Additive only. See docs/pro-move-versioning-implementation-plan.md.
-- Applied to live 2026-07-30 via MCP (as framework_versioning_wave1_foundations);
-- this file is the repo mirror. Idempotent: safe under Lovable re-apply.
-- Rollback: drop table framework_release_items, framework_releases, framework_history;
--           alter table pro_moves drop the four metadata columns.

-- R6 metadata columns (nullable; they ride into history snapshots automatically)
alter table public.pro_moves add column if not exists evidence_label text
  check (evidence_label in ('evidence-based','expert-consensus','practice-derived'));
alter table public.pro_moves add column if not exists source_citation text;
alter table public.pro_moves add column if not exists license_note text;
alter table public.pro_moves add column if not exists authored_by text;

-- Append-only version history for framework content (pro_moves + pro_move_resources)
create table if not exists public.framework_history (
  id bigint generated always as identity primary key,
  table_name text not null,
  record_pk text not null,
  action_id bigint,
  version_no int not null,
  op text not null check (op in ('insert','update','delete','backfill','retro-seed')),
  old_row jsonb,
  new_row jsonb,
  changed_fields text[],
  changed_by uuid,
  changed_via text not null default 'sql' check (changed_via in ('api','service','sql')),
  change_reason text not null default 'unrecorded',
  changed_at timestamptz not null default now(),
  unique (table_name, record_pk, version_no)
);
create index if not exists idx_fh_action on public.framework_history (action_id);
create index if not exists idx_fh_record on public.framework_history (table_name, record_pk, changed_at desc);
create index if not exists idx_fh_changed_at on public.framework_history (changed_at desc);

-- Named immutable snapshots of one role's framework (R5)
create table if not exists public.framework_releases (
  release_id bigint generated always as identity primary key,
  name text not null unique,
  role_id bigint not null references public.roles(role_id),
  kind text not null default 'live' check (kind in ('live','retro')),
  notes text,
  gap_note text,
  created_by uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.framework_release_items (
  release_id bigint not null references public.framework_releases(release_id),
  history_id bigint not null references public.framework_history(id),
  table_name text not null,
  record_pk text not null,
  action_id bigint,
  primary key (release_id, table_name, record_pk)
);
create index if not exists idx_fri_history on public.framework_release_items (history_id);

-- Append-only enforcement: even dashboard SQL cannot rewrite history without
-- consciously dropping these triggers first.
create or replace function public.fn_framework_append_only()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  raise exception 'framework versioning table % is append-only: % blocked', tg_table_name, tg_op
    using hint = 'History and releases are immutable (R1). Corrections are appended as new versions or new releases.';
end;
$$;

drop trigger if exists trg_fh_append_only on public.framework_history;
create trigger trg_fh_append_only before update or delete on public.framework_history
  for each row execute function public.fn_framework_append_only();
drop trigger if exists trg_fr_append_only on public.framework_releases;
create trigger trg_fr_append_only before update or delete on public.framework_releases
  for each row execute function public.fn_framework_append_only();
drop trigger if exists trg_fri_append_only on public.framework_release_items;
create trigger trg_fri_append_only before update or delete on public.framework_release_items
  for each row execute function public.fn_framework_append_only();

-- RLS: read for authenticated; no write policies. Writes happen only inside
-- SECURITY DEFINER functions owned by postgres (RLS does not bind the owner).
alter table public.framework_history enable row level security;
alter table public.framework_releases enable row level security;
alter table public.framework_release_items enable row level security;

drop policy if exists fh_read on public.framework_history;
create policy fh_read on public.framework_history for select to authenticated using (true);
drop policy if exists fr_read on public.framework_releases;
create policy fr_read on public.framework_releases for select to authenticated using (true);
drop policy if exists fri_read on public.framework_release_items;
create policy fri_read on public.framework_release_items for select to authenticated using (true);

-- Supabase default privileges grant broadly on new tables; revoke DML explicitly.
revoke insert, update, delete on public.framework_history from authenticated, anon, service_role;
revoke insert, update, delete on public.framework_releases from authenticated, anon, service_role;
revoke insert, update, delete on public.framework_release_items from authenticated, anon, service_role;

-- Sanity check
do $$
begin
  if to_regclass('public.framework_history') is null
     or to_regclass('public.framework_releases') is null
     or to_regclass('public.framework_release_items') is null then
    raise exception 'wave 1 sanity check failed: versioning tables missing';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'pro_moves' and column_name = 'evidence_label'
  ) then
    raise exception 'wave 1 sanity check failed: pro_moves.evidence_label missing';
  end if;
end;
$$;
