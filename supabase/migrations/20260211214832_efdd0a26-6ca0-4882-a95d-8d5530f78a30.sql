
-- Security definer function to get staff_id for a user (if not already exists)
CREATE OR REPLACE FUNCTION public.get_staff_id_for_user(_user_id uuid)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM staff WHERE user_id = _user_id LIMIT 1;
$$;

-- Security definer function to check clinical director or admin
CREATE OR REPLACE FUNCTION public.is_clinical_or_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM staff
    WHERE user_id = _user_id
    AND (is_clinical_director = true OR is_super_admin = true)
  );
$$;

-- Coach baseline assessments table
CREATE TABLE public.coach_baseline_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_staff_id uuid NOT NULL REFERENCES public.staff(id),
  coach_staff_id uuid NOT NULL REFERENCES public.staff(id),
  status text DEFAULT 'in_progress',
  started_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (doctor_staff_id, coach_staff_id)
);

-- Coach baseline items table
CREATE TABLE public.coach_baseline_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id uuid NOT NULL REFERENCES public.coach_baseline_assessments(id) ON DELETE CASCADE,
  action_id bigint NOT NULL REFERENCES public.pro_moves(action_id) ON DELETE CASCADE,
  rating int CHECK (rating >= 1 AND rating <= 4),
  note_text text,
  updated_at timestamptz DEFAULT now(),
  UNIQUE (assessment_id, action_id)
);

-- Enable RLS
ALTER TABLE public.coach_baseline_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_baseline_items ENABLE ROW LEVEL SECURITY;

-- RLS for coach_baseline_assessments
CREATE POLICY "Clinical staff can read assessments"
  ON public.coach_baseline_assessments FOR SELECT TO authenticated
  USING (public.is_clinical_or_admin(auth.uid()));

CREATE POLICY "Coach can insert own assessments"
  ON public.coach_baseline_assessments FOR INSERT TO authenticated
  WITH CHECK (
    coach_staff_id = public.get_staff_id_for_user(auth.uid())
    AND public.is_clinical_or_admin(auth.uid())
  );

CREATE POLICY "Coach can update own assessments"
  ON public.coach_baseline_assessments FOR UPDATE TO authenticated
  USING (
    coach_staff_id = public.get_staff_id_for_user(auth.uid())
    AND public.is_clinical_or_admin(auth.uid())
  );

-- RLS for coach_baseline_items
CREATE POLICY "Clinical staff can read items"
  ON public.coach_baseline_items FOR SELECT TO authenticated
  USING (
    assessment_id IN (
      SELECT id FROM public.coach_baseline_assessments
      WHERE public.is_clinical_or_admin(auth.uid())
    )
  );

CREATE POLICY "Coach can insert own items"
  ON public.coach_baseline_items FOR INSERT TO authenticated
  WITH CHECK (
    assessment_id IN (
      SELECT id FROM public.coach_baseline_assessments
      WHERE coach_staff_id = public.get_staff_id_for_user(auth.uid())
    )
  );

CREATE POLICY "Coach can update own items"
  ON public.coach_baseline_items FOR UPDATE TO authenticated
  USING (
    assessment_id IN (
      SELECT id FROM public.coach_baseline_assessments
      WHERE coach_staff_id = public.get_staff_id_for_user(auth.uid())
    )
  );
