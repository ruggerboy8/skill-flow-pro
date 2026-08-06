-- Lets a lead's browser resolve the training director's booking link without
-- reading another staff member's row directly (RLS-safe). Returns just the link.
--
-- Resolution: prefer the person actually running the lead cascade in the caller's
-- org (author of a lead focus week or a meeting request), so it tracks the real
-- RDA director rather than any super admin who happens to have a link set. Falls
-- back to a super admin with a link for the cold-start case (no focus/nudges yet).
create or replace function public.director_booking_link()
returns text
language sql
security definer
set search_path = public
as $$
  select scheduling_link from (
    select s.scheduling_link, 0 as pri, s.updated_at
    from public.lead_focus_weeks w
    join public.staff s on s.id = w.created_by
    where w.organization_id = public.current_user_org_id()
      and coalesce(s.scheduling_link, '') <> ''
    union all
    select s.scheduling_link, 0 as pri, s.updated_at
    from public.lead_meeting_requests r
    join public.staff s on s.id = r.created_by
    where r.organization_id = public.current_user_org_id()
      and coalesce(s.scheduling_link, '') <> ''
    union all
    select s.scheduling_link, 1 as pri, s.updated_at
    from public.staff s
    where s.organization_id = public.current_user_org_id()
      and s.is_super_admin = true
      and coalesce(s.scheduling_link, '') <> ''
  ) t
  order by pri, updated_at desc
  limit 1;
$$;

grant execute on function public.director_booking_link() to authenticated;
