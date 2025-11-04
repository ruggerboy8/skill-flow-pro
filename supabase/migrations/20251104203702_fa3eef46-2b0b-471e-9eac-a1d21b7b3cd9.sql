-- ============================================
-- Phase 5: Monday-Morning Schedule System
-- Part 1: Create tables (FIXED)
-- ============================================

-- Status enum for weekly plans
CREATE TYPE public.plan_status AS ENUM ('locked', 'draft');

-- Main Alcan-wide weekly plan table
CREATE TABLE public.alcan_weekly_plan (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start DATE NOT NULL,
  role_id SMALLINT NOT NULL CHECK (role_id IN (1, 2)),
  status public.plan_status NOT NULL DEFAULT 'draft',
  action_ids BIGINT[3] NOT NULL,
  logs JSONB DEFAULT '[]'::jsonb,
  engine_config JSONB,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  computed_by UUID REFERENCES auth.users(id),
  published_at TIMESTAMPTZ,
  published_by UUID REFERENCES auth.users(id),
  locked_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT alcan_weekly_plan_week_start_role_id_key UNIQUE (week_start, role_id)
);

-- Enable RLS
ALTER TABLE public.alcan_weekly_plan ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Authenticated users can read weekly plans"
ON public.alcan_weekly_plan
FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Super admins and system can manage weekly plans"
ON public.alcan_weekly_plan
FOR ALL
USING (is_super_admin(auth.uid()) OR auth.uid() IS NOT NULL)
WITH CHECK (is_super_admin(auth.uid()) OR auth.uid() IS NOT NULL);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION public.update_alcan_weekly_plan_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';

CREATE TRIGGER alcan_weekly_plan_updated_at
  BEFORE UPDATE ON public.alcan_weekly_plan
  FOR EACH ROW
  EXECUTE FUNCTION public.update_alcan_weekly_plan_timestamp();

-- 2. Create manager_priorities table (FIXED: coach_staff_id is UUID)
CREATE TABLE public.manager_priorities (
  id BIGSERIAL PRIMARY KEY,
  coach_staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  role_id SMALLINT NOT NULL CHECK (role_id IN (1, 2)),
  action_id BIGINT NOT NULL REFERENCES public.pro_moves(action_id) ON DELETE CASCADE,
  weight SMALLINT NOT NULL DEFAULT 1 CHECK (weight >= 1 AND weight <= 5),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (coach_staff_id, role_id, action_id)
);

-- Enable RLS on manager_priorities
ALTER TABLE public.manager_priorities ENABLE ROW LEVEL SECURITY;

-- RLS: Coaches can manage their own priorities
CREATE POLICY "Coaches can manage their own priorities"
ON public.manager_priorities
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.staff s
    WHERE s.id = manager_priorities.coach_staff_id
      AND s.user_id = auth.uid()
      AND (s.is_coach = true OR s.is_super_admin = true)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.staff s
    WHERE s.id = manager_priorities.coach_staff_id
      AND s.user_id = auth.uid()
      AND (s.is_coach = true OR s.is_super_admin = true)
  )
);

-- Super admins can manage all priorities
CREATE POLICY "Super admins can manage all priorities"
ON public.manager_priorities
FOR ALL
USING (is_super_admin(auth.uid()))
WITH CHECK (is_super_admin(auth.uid()));

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION public.update_manager_priorities_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';

CREATE TRIGGER manager_priorities_updated_at
  BEFORE UPDATE ON public.manager_priorities
  FOR EACH ROW
  EXECUTE FUNCTION public.update_manager_priorities_timestamp();

-- 3. Helper function to get current staff_id for auth user
CREATE OR REPLACE FUNCTION public.get_current_staff_id()
RETURNS UUID AS $$
  SELECT id FROM public.staff WHERE user_id = auth.uid() LIMIT 1;
$$ LANGUAGE SQL STABLE SECURITY DEFINER SET search_path TO 'public';