-- Phase 1: Create canonical weekly_assignments table and backfill historical data
-- This is additive only - no behavioral changes to existing code paths

-- 1. Create the canonical weekly_assignments table
CREATE TABLE IF NOT EXISTS public.weekly_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start_date date NOT NULL,
  role_id bigint NOT NULL,
  location_id uuid, -- For onboarding (location-specific)
  org_id uuid, -- For global org-specific assignments
  source text NOT NULL CHECK (source IN ('onboarding', 'global')),
  status text NOT NULL DEFAULT 'locked' CHECK (status IN ('draft', 'locked')),
  display_order integer NOT NULL,
  action_id bigint, -- NULL for self-select slots
  competency_id bigint, -- For self-select slots
  self_select boolean NOT NULL DEFAULT false,
  legacy_focus_id uuid, -- Traceability to weekly_focus
  superseded_at timestamptz, -- For mid-week edit versioning
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  -- Constraints
  CHECK (
    (source = 'onboarding' AND location_id IS NOT NULL AND org_id IS NULL) OR
    (source = 'global' AND location_id IS NULL)
  )
);

-- Unique constraints via partial indexes
CREATE UNIQUE INDEX unique_weekly_assignment_onboarding 
ON public.weekly_assignments(week_start_date, role_id, location_id, source, display_order) 
WHERE source = 'onboarding';

CREATE UNIQUE INDEX unique_weekly_assignment_global_no_org
ON public.weekly_assignments(week_start_date, role_id, source, display_order) 
WHERE source = 'global' AND org_id IS NULL;

CREATE UNIQUE INDEX unique_weekly_assignment_global_org 
ON public.weekly_assignments(week_start_date, role_id, org_id, source, display_order) 
WHERE source = 'global' AND org_id IS NOT NULL;

-- Indexes for common queries
CREATE INDEX idx_weekly_assignments_week_role ON public.weekly_assignments(week_start_date, role_id);
CREATE INDEX idx_weekly_assignments_location ON public.weekly_assignments(location_id) WHERE location_id IS NOT NULL;
CREATE INDEX idx_weekly_assignments_org_source ON public.weekly_assignments(org_id, source) WHERE org_id IS NOT NULL;
CREATE INDEX idx_weekly_assignments_legacy_focus ON public.weekly_assignments(legacy_focus_id) WHERE legacy_focus_id IS NOT NULL;
CREATE INDEX idx_weekly_assignments_status ON public.weekly_assignments(status);

-- RLS policies (mirror existing patterns)
ALTER TABLE public.weekly_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their location onboarding assignments"
  ON public.weekly_assignments FOR SELECT
  USING (
    source = 'onboarding' AND 
    location_id IN (
      SELECT s.primary_location_id
      FROM staff s
      WHERE s.user_id = auth.uid()
    )
  );

CREATE POLICY "Authenticated users can read global assignments"
  ON public.weekly_assignments FOR SELECT
  USING (source = 'global' AND org_id IS NULL);

CREATE POLICY "Users view own org global assignments"
  ON public.weekly_assignments FOR SELECT
  USING (
    source = 'global' AND
    org_id IN (
      SELECT l.organization_id
      FROM staff s
      JOIN locations l ON l.id = s.primary_location_id
      WHERE s.user_id = auth.uid()
    )
  );

CREATE POLICY "Super admins manage all assignments"
  ON public.weekly_assignments FOR ALL
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));

-- 2. Backfill onboarding assignments (cycles 1-3, weeks 1-18)
-- For each location, compute week_start_date from program_start + week_offset
INSERT INTO public.weekly_assignments (
  week_start_date,
  role_id,
  location_id,
  org_id,
  source,
  status,
  display_order,
  action_id,
  competency_id,
  self_select,
  legacy_focus_id,
  created_at,
  updated_at
)
SELECT DISTINCT ON (l.id, wf.role_id, wf.cycle, wf.week_in_cycle, wf.display_order)
  -- Calculate week_start_date: program_start + week_offset (0-indexed)
  (DATE_TRUNC('week', l.program_start_date::timestamptz AT TIME ZONE l.timezone)::date + 
   ((wf.cycle - 1) * l.cycle_length_weeks + (wf.week_in_cycle - 1)) * INTERVAL '7 days')::date AS week_start_date,
  wf.role_id,
  l.id AS location_id,
  NULL AS org_id,  -- Onboarding is location-specific, not org-level
  'onboarding'::text AS source,
  'locked'::text AS status,
  wf.display_order,
  wf.action_id,
  wf.competency_id,
  wf.self_select,
  wf.id AS legacy_focus_id,
  wf.created_at,
  now() AS updated_at
FROM public.weekly_focus wf
CROSS JOIN public.locations l
WHERE wf.cycle BETWEEN 1 AND 3  -- Onboarding cycles only
  AND l.active = true
  AND wf.role_id IS NOT NULL
ORDER BY l.id, wf.role_id, wf.cycle, wf.week_in_cycle, wf.display_order, wf.created_at;

-- 3. Backfill global assignments from weekly_plan
INSERT INTO public.weekly_assignments (
  week_start_date,
  role_id,
  location_id,
  org_id,
  source,
  status,
  display_order,
  action_id,
  competency_id,
  self_select,
  legacy_focus_id,
  created_at,
  updated_at
)
SELECT
  wp.week_start_date,
  wp.role_id,
  NULL AS location_id,  -- Global plans are not location-specific
  wp.org_id,
  'global'::text AS source,
  wp.status,
  wp.display_order,
  wp.action_id,
  wp.competency_id,
  wp.self_select,
  NULL AS legacy_focus_id,  -- Global plans don't trace to weekly_focus
  wp.created_at,
  wp.updated_at
FROM public.weekly_plan wp
WHERE wp.status = 'locked'  -- Only locked plans are active
ORDER BY wp.week_start_date, wp.role_id, wp.display_order
ON CONFLICT DO NOTHING;

-- 4. Add assignment_id to weekly_scores (parallel field, no behavior change)
ALTER TABLE public.weekly_scores 
ADD COLUMN IF NOT EXISTS assignment_id text;

CREATE INDEX IF NOT EXISTS idx_weekly_scores_assignment_id 
ON public.weekly_scores(assignment_id) 
WHERE assignment_id IS NOT NULL;

-- 5. Backfill assignment_id for scores linked to weekly_focus (via legacy_focus_id)
-- Match staff to their location's onboarding assignments
UPDATE public.weekly_scores ws
SET assignment_id = 'assign:' || wa.id
FROM public.weekly_assignments wa,
     staff s
WHERE ws.weekly_focus_id IS NOT NULL
  AND ws.weekly_focus_id NOT LIKE 'plan:%'
  AND wa.legacy_focus_id::text = ws.weekly_focus_id
  AND wa.location_id = s.primary_location_id
  AND s.id = ws.staff_id
  AND wa.source = 'onboarding'
  AND ws.assignment_id IS NULL;

-- 6. Backfill assignment_id for scores linked to weekly_plan (via plan:X format)
UPDATE public.weekly_scores ws
SET assignment_id = 'assign:' || wa.id
FROM public.weekly_assignments wa,
     public.weekly_plan wp
WHERE ws.weekly_focus_id LIKE 'plan:%'
  AND ws.weekly_focus_id = ('plan:' || wp.id)
  AND wp.week_start_date = wa.week_start_date 
  AND wp.role_id = wa.role_id
  AND wp.display_order = wa.display_order
  AND ((wp.org_id IS NULL AND wa.org_id IS NULL) OR (wp.org_id = wa.org_id))
  AND wa.source = 'global'
  AND ws.assignment_id IS NULL;

-- Verification queries (commented out, run manually to verify)
-- SELECT source, status, COUNT(*) FROM public.weekly_assignments GROUP BY source, status;
-- SELECT COUNT(*) AS total_scores, COUNT(assignment_id) AS scores_with_assignment_id FROM public.weekly_scores;
-- SELECT COUNT(*) FROM weekly_scores WHERE assignment_id IS NULL AND (confidence_score IS NOT NULL OR performance_score IS NOT NULL);