-- APPLIED LIVE 2026-07-24 (Phase C U1, owner decision D1): pro_moves is the
-- centrally managed PLATFORM library; writes are platform-admin only. Reads
-- stay open (participants render moves); org customization flows through the
-- org-scoped override tables. Idempotent.
drop policy if exists "Coaches and admins can manage pro_moves" on public.pro_moves;
drop policy if exists "Platform admins manage pro_moves" on public.pro_moves;
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
