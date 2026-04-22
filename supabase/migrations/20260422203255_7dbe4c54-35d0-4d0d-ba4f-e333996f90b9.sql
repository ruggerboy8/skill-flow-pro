ALTER TABLE public.deputy_connections
  ADD COLUMN IF NOT EXISTS auto_sync_enabled boolean NOT NULL DEFAULT false;