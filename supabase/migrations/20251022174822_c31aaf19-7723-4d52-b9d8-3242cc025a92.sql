-- Add is_lead column to staff table
ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS is_lead boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.staff.is_lead IS 'Lead RDA role: can access Coach dashboard scoped to their organization';

-- Add audit table for role changes
CREATE TABLE IF NOT EXISTS public.admin_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  changed_by uuid NOT NULL REFERENCES public.staff(id),
  action text NOT NULL,
  old_values jsonb,
  new_values jsonb,
  scope_organization_id uuid REFERENCES public.organizations(id),
  scope_location_id uuid REFERENCES public.locations(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_audit_staff_id_idx ON public.admin_audit(staff_id);
CREATE INDEX IF NOT EXISTS admin_audit_changed_by_idx ON public.admin_audit(changed_by);
CREATE INDEX IF NOT EXISTS admin_audit_created_at_idx ON public.admin_audit(created_at DESC);

-- Enable RLS on admin_audit
ALTER TABLE public.admin_audit ENABLE ROW LEVEL SECURITY;

-- Super admins can read audit logs
CREATE POLICY "Super admins can read audit logs" ON public.admin_audit
  FOR SELECT
  USING (is_super_admin(auth.uid()));

-- System can insert audit logs
CREATE POLICY "System can insert audit logs" ON public.admin_audit
  FOR INSERT
  WITH CHECK (true);

COMMENT ON TABLE public.admin_audit IS 'Audit log for administrative actions on staff records';