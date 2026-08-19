-- Recovered from production 2026-08-18 (GOV-1).
-- This migration was applied to production but never committed. Recovered from
-- supabase_migrations.schema_migrations so the repo matches production.
-- Applied version: 20260720220407

-- Review fixes for the coaching workspace (both review agents).

-- (A) LIMIT-1-safe caller staff id — staff.user_id has no unique constraint, so a
-- bare scalar subquery would 500 the day a user has 2 staff rows. SECURITY DEFINER
-- so it isn't re-filtered by staff RLS.
create or replace function public.current_user_staff_id()
returns uuid language sql stable security definer set search_path to 'public' as $$
  select s.id from public.staff s where s.user_id = auth.uid() order by s.created_at asc limit 1
$$;
grant execute on function public.current_user_staff_id() to authenticated;

-- (B) Rewrite the four policies to use the helper AND enforce the super-admin gate
-- in RLS (defense in depth; the surface was frontend-gated only). Ariyana is a super
-- admin, so this matches the intended "Ariyana + super admins" audience.
drop policy if exists "own coaching issues" on public.coaching_issues;
create policy "own coaching issues" on public.coaching_issues for all to authenticated
  using ( public.is_super_admin(auth.uid()) and created_by = public.current_user_staff_id() )
  with check ( public.is_super_admin(auth.uid()) and created_by = public.current_user_staff_id() );

drop policy if exists "own issue locations" on public.coaching_issue_locations;
create policy "own issue locations" on public.coaching_issue_locations for all to authenticated
  using ( exists (select 1 from public.coaching_issues i where i.id = issue_id and i.created_by = public.current_user_staff_id()) )
  with check ( exists (select 1 from public.coaching_issues i where i.id = issue_id and i.created_by = public.current_user_staff_id()) );

drop policy if exists "own issue sources" on public.coaching_issue_sources;
create policy "own issue sources" on public.coaching_issue_sources for all to authenticated
  using ( exists (select 1 from public.coaching_issues i where i.id = issue_id and i.created_by = public.current_user_staff_id()) )
  with check ( exists (select 1 from public.coaching_issues i where i.id = issue_id and i.created_by = public.current_user_staff_id()) );

drop policy if exists "own issue events" on public.coaching_issue_events;
create policy "own issue events" on public.coaching_issue_events for all to authenticated
  using ( exists (select 1 from public.coaching_issues i where i.id = issue_id and i.created_by = public.current_user_staff_id()) )
  with check ( exists (select 1 from public.coaching_issues i where i.id = issue_id and i.created_by = public.current_user_staff_id()) );

-- (C) Atomic create: one transaction, server-derives staff + org (so client can't
-- forge by_staff/organization_id), enforces the gate. Replaces the 4-write client path.
create or replace function public.create_coaching_issue(
  p_title text, p_detail text, p_is_global boolean, p_location_ids uuid[], p_sources text[]
) returns uuid language plpgsql security definer set search_path to 'public' as $$
declare v_staff uuid; v_org uuid; v_id uuid;
begin
  if not public.is_super_admin(auth.uid()) then raise exception 'not authorized'; end if;
  select s.id, s.organization_id into v_staff, v_org
    from public.staff s where s.user_id = auth.uid() order by s.created_at asc limit 1;
  if v_staff is null then raise exception 'no staff record for caller'; end if;
  insert into public.coaching_issues (created_by, organization_id, title, detail, is_global)
    values (v_staff, v_org, p_title, nullif(p_detail, ''), coalesce(p_is_global, false))
    returning id into v_id;
  if array_length(p_location_ids, 1) is not null then
    insert into public.coaching_issue_locations (issue_id, location_id) select v_id, unnest(p_location_ids);
  end if;
  if array_length(p_sources, 1) is not null then
    insert into public.coaching_issue_sources (issue_id, source_type) select v_id, unnest(p_sources);
  end if;
  insert into public.coaching_issue_events (issue_id, kind, body, by_staff)
    values (v_id, 'created', 'Added to workspace', v_staff);
  return v_id;
end $$;
grant execute on function public.create_coaching_issue(text, text, boolean, uuid[], text[]) to authenticated;

-- (D) Keep updated_at honest server-side instead of relying on the client.
create or replace function public.coaching_touch_updated_at()
returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end $$;
drop trigger if exists trg_coaching_issues_updated_at on public.coaching_issues;
create trigger trg_coaching_issues_updated_at before update on public.coaching_issues
  for each row execute function public.coaching_touch_updated_at();