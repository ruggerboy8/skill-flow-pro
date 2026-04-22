CREATE TABLE public.deputy_sync_runs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  mode text NOT NULL,
  trigger text NOT NULL DEFAULT 'manual',
  week_start date,
  week_end date,
  status text NOT NULL DEFAULT 'running',
  timesheet_count integer,
  mapped_participant_count integer,
  excusals_inserted integer,
  excusals_already_existed integer,
  error_message text,
  triggered_by uuid,
  started_at timestamp with time zone NOT NULL DEFAULT now(),
  finished_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_deputy_sync_runs_org_started
  ON public.deputy_sync_runs (organization_id, started_at DESC);

ALTER TABLE public.deputy_sync_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_admins_can_view_deputy_sync_runs"
ON public.deputy_sync_runs
FOR SELECT
TO authenticated
USING (
  (organization_id = current_user_org_id())
  AND EXISTS (
    SELECT 1 FROM staff
    WHERE staff.user_id = auth.uid()
      AND (staff.is_org_admin = true OR staff.is_super_admin = true)
  )
);

CREATE POLICY "super_admins_can_view_all_deputy_sync_runs"
ON public.deputy_sync_runs
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM staff
    WHERE staff.user_id = auth.uid()
      AND staff.is_super_admin = true
  )
);