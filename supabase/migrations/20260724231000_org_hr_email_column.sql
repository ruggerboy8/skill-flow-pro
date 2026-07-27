-- APPLIED LIVE 2026-07-24 (Phase C U2): per-organization HR contact for
-- offboarding exports; send-hr-export resolves the caller's org hr_email
-- with the env var as last-resort fallback. Idempotent.
alter table public.organizations add column if not exists hr_email text;
update public.organizations set hr_email = 'falvarez@alcandentalcooperative.com'
  where name = 'Alcan Pediatric Dental' and hr_email is null;
