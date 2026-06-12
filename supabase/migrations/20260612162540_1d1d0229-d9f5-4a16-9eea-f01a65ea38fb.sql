
-- Multi-tenant isolation hardening
-- 1) Helpers
CREATE OR REPLACE FUNCTION public.org_id_of_location(_location_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT pg.organization_id
  FROM public.locations l
  JOIN public.practice_groups pg ON pg.id = l.group_id
  WHERE l.id = _location_id
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.org_id_of_staff(_staff_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    s.organization_id,
    (SELECT pg.organization_id
       FROM public.locations l
       JOIN public.practice_groups pg ON pg.id = l.group_id
      WHERE l.id = s.primary_location_id
      LIMIT 1)
  )
  FROM public.staff s
  WHERE s.id = _staff_id
  LIMIT 1;
$$;

-- 2) practice_groups: drop permissive read; add org-scoped read
DROP POLICY IF EXISTS "read orgs (auth)" ON public.practice_groups;
CREATE POLICY "Read groups in own org"
  ON public.practice_groups FOR SELECT
  TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR organization_id = public.current_user_org_id()
  );

-- 3) locations: drop permissive read; add org-scoped read
DROP POLICY IF EXISTS "read locations (auth)" ON public.locations;
CREATE POLICY "Read locations in own org"
  ON public.locations FOR SELECT
  TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR group_id IN (
      SELECT id FROM public.practice_groups
      WHERE organization_id = public.current_user_org_id()
    )
  );

-- 4) staff: tighten coach/admin read to caller's org
DROP POLICY IF EXISTS "Coaches can read all staff" ON public.staff;
CREATE POLICY "Coaches can read staff in own org"
  ON public.staff FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_super_admin(auth.uid())
    OR (
      public.is_coach_or_admin(auth.uid())
      AND public.org_id_of_staff(id) = public.current_user_org_id()
    )
  );

-- 5) excused_locations: scope read + write to caller's org
DROP POLICY IF EXISTS "Authenticated users can read location excuses" ON public.excused_locations;
DROP POLICY IF EXISTS "Admins can manage excused_locations" ON public.excused_locations;

CREATE POLICY "Read excused locations in own org"
  ON public.excused_locations FOR SELECT
  TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR public.org_id_of_location(location_id) = public.current_user_org_id()
  );

CREATE POLICY "Org admins manage excused locations in own org"
  ON public.excused_locations FOR ALL
  TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR (
      EXISTS (SELECT 1 FROM public.staff s
              WHERE s.user_id = auth.uid() AND s.is_org_admin = true)
      AND public.org_id_of_location(location_id) = public.current_user_org_id()
    )
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR (
      EXISTS (SELECT 1 FROM public.staff s
              WHERE s.user_id = auth.uid() AND s.is_org_admin = true)
      AND public.org_id_of_location(location_id) = public.current_user_org_id()
    )
  );

-- 6) excused_submissions: scope writes to caller's org; keep self-read
DROP POLICY IF EXISTS "Admins can manage excused_submissions" ON public.excused_submissions;

CREATE POLICY "Org admins manage excused submissions in own org"
  ON public.excused_submissions FOR ALL
  TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR (
      EXISTS (SELECT 1 FROM public.staff s
              WHERE s.user_id = auth.uid() AND s.is_org_admin = true)
      AND public.org_id_of_staff(staff_id) = public.current_user_org_id()
    )
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR (
      EXISTS (SELECT 1 FROM public.staff s
              WHERE s.user_id = auth.uid() AND s.is_org_admin = true)
      AND public.org_id_of_staff(staff_id) = public.current_user_org_id()
    )
  );

-- Also let org admins read excused submissions inside their org (besides the existing self-read)
CREATE POLICY "Org admins read excused submissions in own org"
  ON public.excused_submissions FOR SELECT
  TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR (
      EXISTS (SELECT 1 FROM public.staff s
              WHERE s.user_id = auth.uid() AND s.is_org_admin = true)
      AND public.org_id_of_staff(staff_id) = public.current_user_org_id()
    )
  );

-- 7) coaching_sessions: scope "clinical staff can view all" to caller's org
DROP POLICY IF EXISTS "Clinical staff can view all sessions" ON public.coaching_sessions;
CREATE POLICY "Clinical staff view sessions in own org"
  ON public.coaching_sessions FOR SELECT
  TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR (
      EXISTS (SELECT 1 FROM public.staff s
              WHERE s.user_id = auth.uid() AND s.is_clinical_director = true)
      AND public.org_id_of_staff(doctor_staff_id) = public.current_user_org_id()
    )
  );

-- 8) coaching_meeting_records: scope clinical-staff view to caller's org via session
DROP POLICY IF EXISTS "Clinical staff can view all meeting records" ON public.coaching_meeting_records;
CREATE POLICY "Clinical staff view meeting records in own org"
  ON public.coaching_meeting_records FOR SELECT
  TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR (
      EXISTS (SELECT 1 FROM public.staff s
              WHERE s.user_id = auth.uid() AND s.is_clinical_director = true)
      AND session_id IN (
        SELECT cs.id FROM public.coaching_sessions cs
        WHERE public.org_id_of_staff(cs.doctor_staff_id) = public.current_user_org_id()
      )
    )
  );
