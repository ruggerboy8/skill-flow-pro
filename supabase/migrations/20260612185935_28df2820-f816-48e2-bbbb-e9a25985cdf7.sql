
-- 1) Deduplicate: keep earliest assessment per doctor; reassign items + delete extras
DO $$
DECLARE
  rec RECORD;
  keeper_id uuid;
BEGIN
  FOR rec IN
    SELECT doctor_staff_id
    FROM public.coach_baseline_assessments
    GROUP BY doctor_staff_id
    HAVING COUNT(*) > 1
  LOOP
    SELECT id INTO keeper_id
    FROM public.coach_baseline_assessments
    WHERE doctor_staff_id = rec.doctor_staff_id
    ORDER BY created_at ASC, id ASC
    LIMIT 1;

    -- Reassign items from duplicates to keeper, skipping any (assessment_id, action_id) that already exists
    UPDATE public.coach_baseline_items i
    SET assessment_id = keeper_id
    WHERE i.assessment_id IN (
        SELECT id FROM public.coach_baseline_assessments
        WHERE doctor_staff_id = rec.doctor_staff_id AND id <> keeper_id
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.coach_baseline_items existing
        WHERE existing.assessment_id = keeper_id
          AND existing.action_id = i.action_id
      );

    -- Delete duplicate assessments (cascades remaining items)
    DELETE FROM public.coach_baseline_assessments
    WHERE doctor_staff_id = rec.doctor_staff_id AND id <> keeper_id;
  END LOOP;
END $$;

-- 2) Enforce one assessment per doctor
CREATE UNIQUE INDEX IF NOT EXISTS coach_baseline_assessments_doctor_uniq
  ON public.coach_baseline_assessments (doctor_staff_id);

-- 3) Atomic get-or-create RPC
CREATE OR REPLACE FUNCTION public.get_or_create_coach_baseline_assessment(_doctor_staff_id uuid)
RETURNS TABLE (id uuid, status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _coach_staff_id uuid;
  _existing_id uuid;
  _existing_status text;
  _new_id uuid;
BEGIN
  -- Resolve the calling user's staff id
  SELECT s.id INTO _coach_staff_id
  FROM public.staff s
  WHERE s.user_id = auth.uid()
  LIMIT 1;

  IF _coach_staff_id IS NULL THEN
    RAISE EXCEPTION 'No staff record for current user';
  END IF;

  -- Return existing if any
  SELECT a.id, a.status INTO _existing_id, _existing_status
  FROM public.coach_baseline_assessments a
  WHERE a.doctor_staff_id = _doctor_staff_id
  LIMIT 1;

  IF _existing_id IS NOT NULL THEN
    id := _existing_id;
    status := _existing_status;
    RETURN NEXT;
    RETURN;
  END IF;

  -- Otherwise create
  INSERT INTO public.coach_baseline_assessments (doctor_staff_id, coach_staff_id, status)
  VALUES (_doctor_staff_id, _coach_staff_id, 'in_progress')
  ON CONFLICT (doctor_staff_id) DO NOTHING
  RETURNING coach_baseline_assessments.id INTO _new_id;

  IF _new_id IS NULL THEN
    -- Lost a race; re-fetch
    SELECT a.id, a.status INTO _existing_id, _existing_status
    FROM public.coach_baseline_assessments a
    WHERE a.doctor_staff_id = _doctor_staff_id
    LIMIT 1;
    id := _existing_id;
    status := _existing_status;
  ELSE
    id := _new_id;
    status := 'in_progress';
  END IF;

  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_or_create_coach_baseline_assessment(uuid) TO authenticated;
