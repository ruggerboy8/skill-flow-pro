CREATE OR REPLACE FUNCTION public.has_survey_assignment(_survey_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.survey_assignments a
    WHERE a.survey_id = _survey_id
      AND a.staff_id = public.get_current_staff_id()
  )
$$;

CREATE OR REPLACE FUNCTION public.is_survey_admin_for(_survey_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.surveys s
    WHERE s.id = _survey_id
      AND public.is_superadmin()
      AND s.organization_id = public.current_user_org_id()
  )
$$;

DROP POLICY IF EXISTS surveys_staff_select ON public.surveys;
CREATE POLICY surveys_staff_select ON public.surveys
FOR SELECT TO authenticated
USING (status = 'open' AND public.has_survey_assignment(id));

DROP POLICY IF EXISTS survey_assignments_admin_all ON public.survey_assignments;
CREATE POLICY survey_assignments_admin_all ON public.survey_assignments
FOR ALL TO authenticated
USING (public.is_survey_admin_for(survey_id))
WITH CHECK (public.is_survey_admin_for(survey_id));