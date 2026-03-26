-- Migration: org branding
-- Adds logo_url and brand_color columns to organizations, and creates the
-- org-assets public storage bucket for org logos.
--
-- logo_url:    Public URL of the org's uploaded logo (replaces default header logo)
-- brand_color: Hex color string (e.g. '#1a4a7a') injected as --primary CSS variable

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS logo_url    TEXT,
  ADD COLUMN IF NOT EXISTS brand_color TEXT;

-- Public storage bucket for org logos
-- Public = true so logo URLs are accessible without auth (they appear in the app header)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'org-assets',
  'org-assets',
  true,
  2097152,  -- 2 MB
  ARRAY['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to read org-assets (needed for logo in header)
CREATE POLICY "org_assets_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'org-assets');

-- Allow platform admins to upload/update org logos
CREATE POLICY "org_assets_platform_admin_write"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'org-assets'
    AND EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.user_id = auth.uid()
        AND s.is_super_admin = true
    )
  );

CREATE POLICY "org_assets_platform_admin_update"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'org-assets'
    AND EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.user_id = auth.uid()
        AND s.is_super_admin = true
    )
  );

-- Allow org admins to upload their own org's logo
-- (path must start with the org slug, enforced at application layer)
CREATE POLICY "org_assets_org_admin_write"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'org-assets'
    AND EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.user_id = auth.uid()
        AND s.is_org_admin = true
    )
  );

-- Sanity check
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'organizations'
      AND column_name = 'logo_url'
  ) THEN
    RAISE EXCEPTION 'logo_url column was not added to organizations';
  END IF;
  RAISE NOTICE 'org branding columns added successfully';
END $$;
