-- 1-a  add cycle + week_in_cycle
alter table public.weekly_focus
  add column cycle int,
  add column week_in_cycle int;      -- 1-6

-- 1-b  make them required going forward
alter table public.weekly_focus
  alter column cycle set not null,
  alter column week_in_cycle set not null;

-- 1-c  adjust unique constraint
alter table public.weekly_focus
  drop constraint if exists weekly_focus_iso_week_iso_year_role_id_action_id_key;

alter table public.weekly_focus
  add constraint unique_cycle_week_role_action
  unique (cycle, week_in_cycle, role_id, action_id);

-- 1-d  optional helper view so the staff dashboard can still pull by cycle/week
create or replace view public.v_weekly_focus AS
select wf.*, pm.action_statement
from public.weekly_focus wf
join public.pro_moves   pm on pm.action_id = wf.action_id
where pm.status = 'Active';