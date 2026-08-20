-- SEC-2d: defensively qualify the unqualified user_id / is_super_admin in the
-- SEC-2b authorization guards.
--
-- APPLIED TO PRODUCTION 2026-08-20 (via tracked migration) and execution-tested:
-- all 8 functions were called live afterward and none threw an ambiguity error.
--
-- Background: SEC-2b added an authorization guard of the form
--   NOT EXISTS (SELECT 1 FROM public.staff WHERE user_id = auth.uid() AND is_super_admin = true)
-- with UNQUALIFIED column references. In get_staff_weekly_scores that collided
-- with the function's user_id OUTPUT column and threw "column reference user_id
-- is ambiguous" on every call, breaking the coach dashboard + command center
-- (hotfixed in supabase/migrations/20260820160000_hotfix_get_staff_weekly_scores_ambiguous_user_id.sql).
-- These 8 remaining functions carry the same unqualified guard. They do NOT
-- throw today only because none of them has a colliding OUT column, but that is
-- luck. Qualifying the columns removes the latent trap.
--
-- Idempotent + self-targeting: re-creates each function that still contains the
-- exact unqualified guard, with the staff columns qualified (s.user_id,
-- s.is_super_admin). Only the guard changes; the rest of each body is preserved
-- verbatim via pg_get_functiondef. No-op once qualified.
--
-- Process note (the real lesson): this class of bug is a RUNTIME error invisible
-- to static review; it passed both kit QA and Codex because nobody executed the
-- function. Migrations touching function bodies must be execution-tested.

do $$
declare
  r record;
  new_def text;
begin
  for r in
    select p.oid, pg_get_functiondef(p.oid) as def
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.prosecdef = true
      and position('FROM public.staff WHERE user_id = auth.uid() AND is_super_admin = true' in pg_get_functiondef(p.oid)) > 0
  loop
    new_def := replace(
      r.def,
      'FROM public.staff WHERE user_id = auth.uid() AND is_super_admin = true',
      'FROM public.staff s WHERE s.user_id = auth.uid() AND s.is_super_admin = true'
    );
    if new_def <> r.def then
      execute new_def;
    end if;
  end loop;
end $$;

-- Verify: zero functions should still carry the unqualified pattern.
do $$
declare
  v_remaining int;
begin
  select count(*) into v_remaining
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace
    and position('FROM public.staff WHERE user_id = auth.uid() AND is_super_admin = true' in pg_get_functiondef(p.oid)) > 0;
  if v_remaining > 0 then
    raise exception 'SEC-2d failed: % function(s) still carry the unqualified guard', v_remaining;
  end if;
end $$;
