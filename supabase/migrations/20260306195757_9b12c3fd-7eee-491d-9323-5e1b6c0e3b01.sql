ALTER TABLE public.practice_groups
  ADD COLUMN IF NOT EXISTS organization_id UUID
  REFERENCES public.organizations(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_practice_groups_organization_id
  ON public.practice_groups(organization_id);

CREATE OR REPLACE FUNCTION public.current_user_org_id()
RETURNS UUID LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT pg.organization_id
  FROM public.staff s
  JOIN public.locations l ON l.id = s.primary_location_id
  JOIN public.practice_groups pg ON pg.id = l.group_id
  WHERE s.user_id = auth.uid()
  LIMIT 1;
$$;