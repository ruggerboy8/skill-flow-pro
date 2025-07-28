-- Fix the security issue with the view
drop view if exists public.v_weekly_focus;

create view public.v_weekly_focus 
with (security_invoker = true) AS
select wf.*, pm.action_statement
from public.weekly_focus wf
join public.pro_moves pm on pm.action_id = wf.action_id
where pm.status = 'Active';