-- Recovered from production 2026-08-18 (GOV-1).
-- This migration was applied to production but never committed. Recovered from
-- supabase_migrations.schema_migrations so the repo matches production.
-- Applied version: 20260724200152

-- Roadmap 2.4 slice B: make weekly_scores self-describing so score history no
-- longer depends on the retiring weekly_focus / weekly_plan tables.
update public.weekly_scores ws
set site_action_id = wf.action_id
from public.weekly_focus wf
where ws.site_action_id is null
  and ws.weekly_focus_id = wf.id::text
  and wf.action_id is not null;

update public.weekly_scores ws
set site_action_id = wp.action_id
from public.weekly_plan wp
where ws.site_action_id is null
  and ws.weekly_focus_id = 'plan:' || wp.id::text
  and wp.action_id is not null;

update public.weekly_scores ws
set site_action_id = wa.action_id
from public.weekly_assignments wa
where ws.site_action_id is null
  and ws.assignment_id = 'assign:' || wa.id::text
  and wa.action_id is not null;