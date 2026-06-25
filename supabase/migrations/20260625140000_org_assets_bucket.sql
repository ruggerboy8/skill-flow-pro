-- Storage bucket for organization logos. Was referenced by the branding upload
-- flows (OrgDetailPanel, OrgBootstrapDrawer, AdminGlobalSettingsTab) but never
-- created, so every logo upload failed silently and logo_url stayed null.
-- Idempotent.

insert into storage.buckets (id, name, public)
values ('org-assets', 'org-assets', true)
on conflict (id) do nothing;

-- Public read (logos render on the header and onboarding screens).
drop policy if exists "org_assets_public_read" on storage.objects;
create policy "org_assets_public_read" on storage.objects
  for select
  using (bucket_id = 'org-assets');

-- Authenticated users (super/org admins) can manage logos.
drop policy if exists "org_assets_auth_insert" on storage.objects;
create policy "org_assets_auth_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'org-assets');

drop policy if exists "org_assets_auth_update" on storage.objects;
create policy "org_assets_auth_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'org-assets')
  with check (bucket_id = 'org-assets');

drop policy if exists "org_assets_auth_delete" on storage.objects;
create policy "org_assets_auth_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'org-assets');
