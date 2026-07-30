-- Pro Move versioning, Wave 2: capture triggers + delete guard (R1, R2, R3).
-- See docs/pro-move-versioning-implementation-plan.md.
-- Applied to live 2026-07-30 via MCP (as framework_versioning_wave2_capture_and_guard);
-- this file is the repo mirror. Idempotent: safe under Lovable re-apply.
-- Rollback (order-independent, one statement each):
--   drop trigger if exists trg_pro_moves_history on public.pro_moves;
--   drop trigger if exists trg_pmr_history on public.pro_move_resources;
--   drop trigger if exists trg_pro_moves_delete_guard on public.pro_moves;
--   drop trigger if exists trg_pro_moves_truncate_guard on public.pro_moves;
--   drop trigger if exists trg_pmr_truncate_guard on public.pro_move_resources;
--
-- Conventions for future migrations that edit pro_moves / pro_move_resources:
--   select set_config('app.change_reason', 'batch: <what and why>', true);
-- at the top gives every captured version an attribution instead of
-- 'unrecorded (SQL)'.

-- Generic capture: full to_jsonb snapshots, content-column diff filter on UPDATE
-- so that the generate-pro-move-weights job (curriculum_priority* upserts) and
-- timestamp churn produce no version rows.
create or replace function public.fn_framework_capture()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_excluded text[];
  v_old jsonb;
  v_new jsonb;
  v_old_f jsonb;
  v_new_f jsonb;
  v_changed text[];
  v_pk text;
  v_action bigint;
  v_claims jsonb;
  v_via text;
  v_reason text;
  v_ver int;
begin
  v_excluded := case tg_table_name
    when 'pro_moves' then array[
      'curriculum_priority','curriculum_priority_revenue','curriculum_priority_patient_exp',
      'curriculum_priority_foundational','curriculum_priority_rationale','curriculum_priority_generated_at',
      'updated_at','updated_by','status','version','date_added']
    else array['updated_at']
  end;

  if tg_op = 'DELETE' then
    v_old := to_jsonb(old);
    v_new := null;
  elsif tg_op = 'INSERT' then
    v_old := null;
    v_new := to_jsonb(new);
  else
    v_old := to_jsonb(old);
    v_new := to_jsonb(new);
    v_old_f := v_old - v_excluded;
    v_new_f := v_new - v_excluded;
    if v_old_f = v_new_f then
      return null; -- no content change, no version row
    end if;
    select coalesce(array_agg(t.k order by t.k), '{}'::text[]) into v_changed
    from jsonb_object_keys(v_old_f || v_new_f) as t(k)
    where v_old_f -> t.k is distinct from v_new_f -> t.k;
  end if;

  if tg_table_name = 'pro_moves' then
    v_pk := coalesce(v_new ->> 'action_id', v_old ->> 'action_id');
    v_action := v_pk::bigint;
  else
    v_pk := coalesce(v_new ->> 'id', v_old ->> 'id');
    v_action := coalesce(v_new ->> 'action_id', v_old ->> 'action_id')::bigint;
  end if;

  begin
    v_claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  exception when others then
    v_claims := null;
  end;
  if v_claims ->> 'sub' is not null then
    v_via := 'api';
  elsif v_claims ->> 'role' = 'service_role' then
    v_via := 'service';
  else
    v_via := 'sql';
  end if;

  v_reason := coalesce(
    nullif(current_setting('app.change_reason', true), ''),
    case v_via
      when 'api' then 'unrecorded (UI edit)'
      when 'service' then 'unrecorded (service job)'
      else 'unrecorded (SQL)'
    end);

  select coalesce(max(version_no), 0) + 1 into v_ver
  from public.framework_history
  where table_name = tg_table_name and record_pk = v_pk;

  insert into public.framework_history
    (table_name, record_pk, action_id, version_no, op, old_row, new_row,
     changed_fields, changed_by, changed_via, change_reason)
  values
    (tg_table_name, v_pk, v_action, v_ver, lower(tg_op), v_old, v_new,
     v_changed, auth.uid(), v_via, v_reason);
  return null;
end;
$$;

-- Delete guard: platform rows only (owner_org_id null). Org-owned rows pass
-- through so org teardown keeps working; they are still history-captured.
-- Deliberate compatibility shim: SQLSTATE 23503 and the FK wording keep both
-- existing UI delete handlers showing their "retire it instead" messaging.
create or replace function public.fn_pro_moves_delete_guard()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  raise exception 'update or delete on table "pro_moves" violates foreign key constraint "framework_history_guard" on table "framework_history"'
    using errcode = '23503',
      detail = format('Key (action_id)=(%s) is protected platform framework content: hard deletes are disabled (R3). Retire it instead: set active = false, retired_at = now().', old.action_id),
      hint = 'See docs/pro-move-versioning-implementation-plan.md. Org-owned rows (owner_org_id set) are exempt.';
  return null;
end;
$$;

drop trigger if exists trg_pro_moves_delete_guard on public.pro_moves;
create trigger trg_pro_moves_delete_guard
  before delete on public.pro_moves
  for each row
  when (old.owner_org_id is null)
  execute function public.fn_pro_moves_delete_guard();

drop trigger if exists trg_pro_moves_history on public.pro_moves;
create trigger trg_pro_moves_history
  after insert or update or delete on public.pro_moves
  for each row execute function public.fn_framework_capture();

drop trigger if exists trg_pmr_history on public.pro_move_resources;
create trigger trg_pmr_history
  after insert or update or delete on public.pro_move_resources
  for each row execute function public.fn_framework_capture();

-- TRUNCATE bypasses row triggers; block it outright on framework content.
drop trigger if exists trg_pro_moves_truncate_guard on public.pro_moves;
create trigger trg_pro_moves_truncate_guard
  before truncate on public.pro_moves
  execute function public.fn_framework_append_only();

drop trigger if exists trg_pmr_truncate_guard on public.pro_move_resources;
create trigger trg_pmr_truncate_guard
  before truncate on public.pro_move_resources
  execute function public.fn_framework_append_only();

-- Sanity check
do $$
declare v_n int;
begin
  select count(*) into v_n
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and not t.tgisinternal
    and t.tgname in ('trg_pro_moves_delete_guard','trg_pro_moves_history','trg_pmr_history',
                     'trg_pro_moves_truncate_guard','trg_pmr_truncate_guard');
  if v_n <> 5 then
    raise exception 'wave 2 sanity check failed: expected 5 triggers, found %', v_n;
  end if;
end;
$$;
