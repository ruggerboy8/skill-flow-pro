
-- Create updated_at trigger function if not exists
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- coaching_sessions
CREATE TABLE public.coaching_sessions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  doctor_staff_id uuid NOT NULL REFERENCES public.staff(id),
  coach_staff_id uuid NOT NULL REFERENCES public.staff(id),
  session_type text NOT NULL DEFAULT 'baseline_review',
  sequence_number smallint NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'scheduled',
  scheduled_at timestamptz NOT NULL,
  meeting_link text,
  coach_note text NOT NULL DEFAULT '',
  doctor_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.coaching_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coach can manage own sessions"
  ON public.coaching_sessions FOR ALL
  USING (coach_staff_id IN (SELECT id FROM public.staff WHERE user_id = auth.uid()));

CREATE POLICY "Doctor can view own sessions"
  ON public.coaching_sessions FOR SELECT
  USING (doctor_staff_id IN (SELECT id FROM public.staff WHERE user_id = auth.uid()));

CREATE POLICY "Doctor can update prep"
  ON public.coaching_sessions FOR UPDATE
  USING (doctor_staff_id IN (SELECT id FROM public.staff WHERE user_id = auth.uid())
    AND status IN ('director_prep_ready', 'doctor_prep_submitted', 'meeting_pending'))
  WITH CHECK (doctor_staff_id IN (SELECT id FROM public.staff WHERE user_id = auth.uid()));

CREATE TRIGGER update_coaching_sessions_updated_at
  BEFORE UPDATE ON public.coaching_sessions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- coaching_session_selections
CREATE TABLE public.coaching_session_selections (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES public.coaching_sessions(id) ON DELETE CASCADE,
  action_id bigint NOT NULL,
  selected_by text NOT NULL,
  display_order smallint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT unique_selection_slot UNIQUE (session_id, selected_by, display_order),
  CONSTRAINT valid_selected_by CHECK (selected_by IN ('coach', 'doctor')),
  CONSTRAINT valid_display_order CHECK (display_order IN (1, 2))
);

ALTER TABLE public.coaching_session_selections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coach can manage selections"
  ON public.coaching_session_selections FOR ALL
  USING (session_id IN (
    SELECT id FROM public.coaching_sessions
    WHERE coach_staff_id IN (SELECT id FROM public.staff WHERE user_id = auth.uid())
  ));

CREATE POLICY "Doctor can view selections"
  ON public.coaching_session_selections FOR SELECT
  USING (session_id IN (
    SELECT id FROM public.coaching_sessions
    WHERE doctor_staff_id IN (SELECT id FROM public.staff WHERE user_id = auth.uid())
  ));

CREATE POLICY "Doctor can insert own selections"
  ON public.coaching_session_selections FOR INSERT
  WITH CHECK (
    selected_by = 'doctor'
    AND session_id IN (
      SELECT id FROM public.coaching_sessions
      WHERE doctor_staff_id IN (SELECT id FROM public.staff WHERE user_id = auth.uid())
        AND status = 'director_prep_ready'
    )
  );

-- coaching_meeting_records
CREATE TABLE public.coaching_meeting_records (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES public.coaching_sessions(id) ON DELETE CASCADE,
  calibration_confirmed boolean NOT NULL DEFAULT false,
  summary text NOT NULL DEFAULT '',
  experiments jsonb DEFAULT '[]'::jsonb,
  submitted_at timestamptz,
  doctor_confirmed_at timestamptz,
  doctor_revision_note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.coaching_meeting_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coach can manage meeting records"
  ON public.coaching_meeting_records FOR ALL
  USING (session_id IN (
    SELECT id FROM public.coaching_sessions
    WHERE coach_staff_id IN (SELECT id FROM public.staff WHERE user_id = auth.uid())
  ));

CREATE POLICY "Doctor can view meeting records"
  ON public.coaching_meeting_records FOR SELECT
  USING (session_id IN (
    SELECT id FROM public.coaching_sessions
    WHERE doctor_staff_id IN (SELECT id FROM public.staff WHERE user_id = auth.uid())
  ));

CREATE POLICY "Doctor can confirm meeting records"
  ON public.coaching_meeting_records FOR UPDATE
  USING (session_id IN (
    SELECT id FROM public.coaching_sessions
    WHERE doctor_staff_id IN (SELECT id FROM public.staff WHERE user_id = auth.uid())
      AND status = 'meeting_pending'
  ))
  WITH CHECK (session_id IN (
    SELECT id FROM public.coaching_sessions
    WHERE doctor_staff_id IN (SELECT id FROM public.staff WHERE user_id = auth.uid())
  ));
