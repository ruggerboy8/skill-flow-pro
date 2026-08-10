CREATE OR REPLACE FUNCTION public.is_coach_or_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.staff s
    LEFT JOIN public.user_capabilities c ON c.staff_id = s.id
    WHERE s.user_id = _user_id
      AND (
        s.is_coach = true
        OR s.is_super_admin = true
        OR s.is_org_admin = true
        OR c.is_org_admin = true
        OR c.is_platform_admin = true
        OR c.can_view_submissions = true
      )
  )
$function$;