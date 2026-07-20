CREATE OR REPLACE FUNCTION public.current_user_org_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    s.organization_id,
    (
      SELECT pg.organization_id
      FROM public.locations l
      JOIN public.practice_groups pg ON pg.id = l.group_id
      WHERE l.id = s.primary_location_id
      LIMIT 1
    )
  )
  FROM public.staff s
  WHERE s.user_id = auth.uid()
  ORDER BY
    COALESCE(s.is_org_admin, false) DESC,
    COALESCE(s.is_clinical_director, false) DESC,
    COALESCE(s.is_coach, false) DESC,
    s.created_at DESC
  LIMIT 1;
$function$;