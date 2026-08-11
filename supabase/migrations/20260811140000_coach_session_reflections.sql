-- Coach self-reflection after each session: five 1-5 scales + an optional
-- note. Coach-private by design (decided 2026-08-11) — no coach oversight
-- workflow exists yet, and honesty matters more than aggregation right now.
create table if not exists coach_session_reflections (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null unique references coaching_sessions(id) on delete cascade,
  coach_staff_id uuid not null references staff(id) on delete cascade,
  r_talk smallint check (r_talk between 1 and 5),
  r_ask smallint check (r_ask between 1 and 5),
  r_candor smallint check (r_candor between 1 and 5),
  r_specificity smallint check (r_specificity between 1 and 5),
  r_continuity smallint check (r_continuity between 1 and 5),
  note text,
  created_at timestamptz not null default now()
);

alter table coach_session_reflections enable row level security;

drop policy if exists "Coach can manage own session reflections" on coach_session_reflections;
create policy "Coach can manage own session reflections" on coach_session_reflections
for all
using (coach_staff_id in (select id from staff where user_id = auth.uid()))
with check (coach_staff_id in (select id from staff where user_id = auth.uid()));
