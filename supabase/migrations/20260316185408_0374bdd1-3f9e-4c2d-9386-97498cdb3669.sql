ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS app_display_name text,
  ADD COLUMN IF NOT EXISTS email_sign_off text,
  ADD COLUMN IF NOT EXISTS reply_to_email text;