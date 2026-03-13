
-- 1. Auto-increment sequence for roles.role_id (current max = 4)
CREATE SEQUENCE IF NOT EXISTS roles_role_id_seq START WITH 5;
ALTER TABLE public.roles ALTER COLUMN role_id SET DEFAULT nextval('roles_role_id_seq');
SELECT setval('roles_role_id_seq', GREATEST(5, (SELECT COALESCE(MAX(role_id), 0) + 1 FROM public.roles)));

-- 2. Auto-increment sequence for competencies.competency_id (current max = 414)
CREATE SEQUENCE IF NOT EXISTS competencies_competency_id_seq START WITH 500;
ALTER TABLE public.competencies ALTER COLUMN competency_id SET DEFAULT nextval('competencies_competency_id_seq');
SELECT setval('competencies_competency_id_seq', GREATEST(500, (SELECT COALESCE(MAX(competency_id), 0) + 1 FROM public.competencies)));

-- 3. Add active column to roles for soft-delete
ALTER TABLE public.roles ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;

-- 4. RLS write policies for roles (super admin only)
CREATE POLICY "roles_insert_superadmin"
  ON public.roles FOR INSERT TO authenticated
  WITH CHECK (is_super_admin(auth.uid()));

CREATE POLICY "roles_update_superadmin"
  ON public.roles FOR UPDATE TO authenticated
  USING (is_super_admin(auth.uid()));

CREATE POLICY "roles_delete_superadmin"
  ON public.roles FOR DELETE TO authenticated
  USING (is_super_admin(auth.uid()));

-- 5. RLS write policies for competencies (super admin only)
CREATE POLICY "competencies_insert_superadmin"
  ON public.competencies FOR INSERT TO authenticated
  WITH CHECK (is_super_admin(auth.uid()));

CREATE POLICY "competencies_update_superadmin"
  ON public.competencies FOR UPDATE TO authenticated
  USING (is_super_admin(auth.uid()));

CREATE POLICY "competencies_delete_superadmin"
  ON public.competencies FOR DELETE TO authenticated
  USING (is_super_admin(auth.uid()));
