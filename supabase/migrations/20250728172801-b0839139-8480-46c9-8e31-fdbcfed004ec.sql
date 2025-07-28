-- Fix the trigger function security issue
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
$$ language plpgsql security definer set search_path = '';

-- Add basic RLS policies for existing tables (read-only for authenticated users)
alter table public.roles enable row level security;
alter table public.domains enable row level security;
alter table public.competencies enable row level security;
alter table public.pro_moves enable row level security;

-- Allow authenticated users to read reference data
create policy "Read roles" on public.roles
  for select to authenticated using (true);

create policy "Read domains" on public.domains
  for select to authenticated using (true);

create policy "Read competencies" on public.competencies
  for select to authenticated using (true);

create policy "Read pro_moves" on public.pro_moves
  for select to authenticated using (true);