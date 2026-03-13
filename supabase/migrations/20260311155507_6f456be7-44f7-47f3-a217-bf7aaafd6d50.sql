
CREATE TABLE public.coaching_agenda_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  session_type text NOT NULL CHECK (session_type IN ('baseline_review', 'follow_up')),
  template_html text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(staff_id, session_type)
);

ALTER TABLE public.coaching_agenda_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coaches can read own templates"
  ON public.coaching_agenda_templates FOR SELECT
  TO authenticated
  USING (staff_id IN (SELECT s.id FROM staff s WHERE s.user_id = auth.uid()));

CREATE POLICY "Coaches can upsert own templates"
  ON public.coaching_agenda_templates FOR INSERT
  TO authenticated
  WITH CHECK (staff_id IN (SELECT s.id FROM staff s WHERE s.user_id = auth.uid() AND (s.is_clinical_director = true OR s.is_coach = true OR s.is_super_admin = true)));

CREATE POLICY "Coaches can update own templates"
  ON public.coaching_agenda_templates FOR UPDATE
  TO authenticated
  USING (staff_id IN (SELECT s.id FROM staff s WHERE s.user_id = auth.uid()))
  WITH CHECK (staff_id IN (SELECT s.id FROM staff s WHERE s.user_id = auth.uid()));
