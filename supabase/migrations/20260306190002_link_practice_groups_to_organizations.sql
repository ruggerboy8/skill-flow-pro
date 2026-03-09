-- Migration: Link practice_groups to organizations
-- Adds organization_id FK to practice_groups (nullable initially so existing
-- rows aren't immediately broken — will be made NOT NULL after backfill).

ALTER TABLE public.practice_groups
  ADD COLUMN IF NOT EXISTS organization_id UUID
  REFERENCES public.organizations(id) ON DELETE RESTRICT;

-- Index for efficient joins down the chain (org → groups → locations → staff)
CREATE INDEX IF NOT EXISTS idx_practice_groups_organization_id
  ON public.practice_groups(organization_id);

-- Helper function: get the organization_id for the currently authenticated user.
-- Walks the chain: auth.uid() → staff → locations → practice_groups → organizations
-- Used in RLS policies throughout the app.
-- Returns NULL if user has no staff record or no linked organization yet.
CREATE OR REPLACE FUNCTION public.current_user_org_id()
RETURNS UUID
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pg.organization_id
  FROM public.staff s
  JOIN public.locations l ON l.id = s.primary_location_id
  JOIN public.practice_groups pg ON pg.id = l.group_id
  WHERE s.user_id = auth.uid()
  LIMIT 1;
$$;
