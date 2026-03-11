
CREATE TABLE public.organization_pro_move_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  pro_move_id bigint NOT NULL REFERENCES pro_moves(action_id) ON DELETE CASCADE,
  is_hidden boolean NOT NULL DEFAULT false,
  hidden_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, pro_move_id)
);

ALTER TABLE public.organization_pro_move_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_admin_manage_overrides"
  ON public.organization_pro_move_overrides
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM staff
      WHERE staff.user_id = auth.uid()
        AND (staff.is_super_admin = true OR staff.is_org_admin = true)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM staff
      WHERE staff.user_id = auth.uid()
        AND (staff.is_super_admin = true OR staff.is_org_admin = true)
    )
  );

CREATE POLICY "authenticated_read_overrides"
  ON public.organization_pro_move_overrides
  FOR SELECT
  TO authenticated
  USING (true);
