-- Staff profile (1:1 with auth.users)
create table public.staff (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references auth.users(id) on delete cascade,
  email        text unique not null,
  name         text not null,
  role_id      bigint references public.roles(role_id),
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

-- Three active Pro Moves for each role & ISO week
create table public.weekly_focus (
  id           uuid primary key default gen_random_uuid(),
  iso_week     int    not null,
  iso_year     int    not null,
  role_id      bigint references public.roles(role_id),
  action_id    bigint references public.pro_moves(action_id),
  display_order int   default 1,                 -- 1,2,3 for sorting
  created_at   timestamptz default now(),
  unique (iso_week, iso_year, role_id, action_id)
);

-- Monday & Thursday ratings
create table public.weekly_scores (
  id                 uuid primary key default gen_random_uuid(),
  staff_id           uuid references public.staff(id) on delete cascade,
  weekly_focus_id    uuid references public.weekly_focus(id) on delete cascade,
  confidence_score   int  check (confidence_score between 1 and 4),
  performance_score  int  check (performance_score between 1 and 4),
  confidence_date    timestamptz,
  performance_date   timestamptz,
  created_at         timestamptz default now(),
  updated_at         timestamptz default now(),
  unique (staff_id, weekly_focus_id)
);

-- Trigger for auto-updating the date fields
create or replace function public.touch_dates()
returns trigger as $$
begin
  if new.confidence_score is distinct from old.confidence_score
     or (tg_op = 'INSERT' and new.confidence_score is not null) then
       new.confidence_date := now();
  end if;
  if new.performance_score is distinct from old.performance_score
     or (tg_op = 'INSERT' and new.performance_score is not null) then
       new.performance_date := now();
  end if;
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

create trigger trg_touch_dates
  before insert or update on public.weekly_scores
  for each row execute procedure public.touch_dates();

-- Turn RLS on
alter table public.staff        enable row level security;
alter table public.weekly_focus enable row level security;
alter table public.weekly_scores enable row level security;

-- STAFF: user can read/update own profile
create policy "Self read/write" on public.staff
  for all using (user_id = auth.uid());

-- WEEKLY_FOCUS: all authenticated users can read
create policy "Read focus" on public.weekly_focus
  for select to authenticated using (true);

-- WEEKLY_SCORES: user can CRUD own scores
create policy "Own scores" on public.weekly_scores
  for all using (
    exists (select 1 from public.staff 
            where id = weekly_scores.staff_id
              and user_id = auth.uid())
  )
  with check (
    exists (select 1 from public.staff 
            where id = weekly_scores.staff_id
              and user_id = auth.uid())
  );