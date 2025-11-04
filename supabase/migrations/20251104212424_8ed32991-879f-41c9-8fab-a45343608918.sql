-- Create simple KV table for simulation storage
create table if not exists public.app_kv (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

-- Enable RLS
alter table public.app_kv enable row level security;

-- Super admins can manage simulation data
create policy "Super admins can manage simulation KV"
  on public.app_kv
  for all
  using (is_super_admin(auth.uid()))
  with check (is_super_admin(auth.uid()));

-- Coaches can read simulation data
create policy "Coaches can read simulation KV"
  on public.app_kv
  for select
  using (
    key like 'sim:%' 
    and is_coach_or_admin(auth.uid())
  );