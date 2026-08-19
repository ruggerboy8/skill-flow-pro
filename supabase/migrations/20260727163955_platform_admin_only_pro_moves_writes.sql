-- Recovered from production 2026-08-18 (GOV-1).
-- This migration was applied to production but never committed. Recovered from
-- supabase_migrations.schema_migrations so the repo matches production.
-- Applied version: 20260727163955

-- Phase C U1 (owner decision D1, 2026-07-24): the pro_moves table is the
-- PLATFORM library — centrally managed, distributed to all tenants (each org's
-- effective library = platform moves filtered by practice type + that org's
-- visibility/wording overrides, which live in their own org-scoped tables).
-- Reads stay open to all authenticated users (participants render moves).
-- Writes were previously open to ANY org's coach/admin (cross-tenant edit
-- risk); now platform admins only.

drop policy if exists "Coaches and admins can manage pro_moves" on public.pro_moves;

create policy "Platform admins manage pro_moves"
on public.pro_moves
for all
using (
  exists (
    select 1 from public.staff s
    left join public.user_capabilities uc on uc.staff_id = s.id
    where s.user_id = auth.uid()
      and (coalesce(s.is_super_admin, false) or coalesce(uc.is_platform_admin, false))
  )
)
with check (
  exists (
    select 1 from public.staff s
    left join public.user_capabilities uc on uc.staff_id = s.id
    where s.user_id = auth.uid()
      and (coalesce(s.is_super_admin, false) or coalesce(uc.is_platform_admin, false))
  )
);