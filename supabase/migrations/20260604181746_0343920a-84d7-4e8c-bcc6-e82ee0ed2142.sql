
-- 1. Add attribution columns
ALTER TABLE public.coach_baseline_assessments
  ADD COLUMN IF NOT EXISTS last_edited_by_staff_id uuid REFERENCES public.staff(id),
  ADD COLUMN IF NOT EXISTS last_edited_at timestamptz;

ALTER TABLE public.coach_baseline_items
  ADD COLUMN IF NOT EXISTS last_edited_by_staff_id uuid REFERENCES public.staff(id),
  ADD COLUMN IF NOT EXISTS last_edited_at timestamptz;

-- 2. Audit table
CREATE TABLE IF NOT EXISTS public.coach_baseline_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id uuid NOT NULL REFERENCES public.coach_baseline_assessments(id) ON DELETE CASCADE,
  action_id integer NOT NULL,
  actor_staff_id uuid REFERENCES public.staff(id),
  actor_user_id uuid,
  old_rating integer,
  new_rating integer,
  old_note text,
  new_note text,
  changed_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.coach_baseline_audit TO authenticated;
GRANT ALL ON public.coach_baseline_audit TO service_role;

ALTER TABLE public.coach_baseline_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clinical and admins can view audit"
ON public.coach_baseline_audit
FOR SELECT TO authenticated
USING (public.is_clinical_or_admin(auth.uid()));

-- 3. Trigger: set last_edited fields + write audit row on coach_baseline_items
CREATE OR REPLACE FUNCTION public.coach_baseline_items_track_editor()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_staff_id uuid;
BEGIN
  SELECT id INTO v_staff_id FROM public.staff WHERE user_id = auth.uid() LIMIT 1;

  NEW.last_edited_by_staff_id := v_staff_id;
  NEW.last_edited_at := now();

  -- Bump parent assessment attribution
  UPDATE public.coach_baseline_assessments
     SET last_edited_by_staff_id = v_staff_id,
         last_edited_at = now(),
         updated_at = now()
   WHERE id = NEW.assessment_id;

  -- Write audit row when value actually changes
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.coach_baseline_audit
      (assessment_id, action_id, actor_staff_id, actor_user_id, old_rating, new_rating, old_note, new_note)
    VALUES
      (NEW.assessment_id, NEW.action_id, v_staff_id, auth.uid(), NULL, NEW.rating, NULL, NEW.note_text);
  ELSIF TG_OP = 'UPDATE' AND (
        OLD.rating IS DISTINCT FROM NEW.rating
     OR OLD.note_text IS DISTINCT FROM NEW.note_text
  ) THEN
    INSERT INTO public.coach_baseline_audit
      (assessment_id, action_id, actor_staff_id, actor_user_id, old_rating, new_rating, old_note, new_note)
    VALUES
      (NEW.assessment_id, NEW.action_id, v_staff_id, auth.uid(), OLD.rating, NEW.rating, OLD.note_text, NEW.note_text);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_coach_baseline_items_track_editor ON public.coach_baseline_items;
CREATE TRIGGER trg_coach_baseline_items_track_editor
BEFORE INSERT OR UPDATE ON public.coach_baseline_items
FOR EACH ROW EXECUTE FUNCTION public.coach_baseline_items_track_editor();
