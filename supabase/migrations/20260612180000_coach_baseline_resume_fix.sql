-- Coach baseline "resume" fix
--
-- Symptoms: the CD private baseline always shows "Start" (never resumes) and
-- testing produces duplicate-key / RLS-violation errors.
--
-- Root causes:
--   1. UNIQUE (doctor_staff_id, coach_staff_id) permits multiple assessments per
--      doctor (one per coach), which contradicts the app's "first-to-start owns
--      it, one assessment per doctor" model and lets duplicates accumulate.
--   2. The wizard creates the assessment as a side effect of mounting, which
--      races (double-fire) and collides with the "first assessment only" INSERT
--      policy + the unique constraint, throwing errors.
--
-- This migration:
--   A. Collapses any existing duplicates to one assessment per doctor (earliest
--      wins), preserving item ratings/notes from the duplicates where possible.
--   B. Replaces UNIQUE(doctor_staff_id, coach_staff_id) with UNIQUE(doctor_staff_id).
--   C. Adds an atomic, race-safe get_or_create RPC so the frontend can resume.
--
-- Idempotent: safe to run more than once. Paste into the Supabase SQL Editor.

-- ─────────────────────────────────────────────────────────────────────────────
-- A. Dedupe to one assessment per doctor (earliest created_at wins)
-- ─────────────────────────────────────────────────────────────────────────────

-- A.1 Re-point items from duplicate assessments onto the keeper, but only where
--     the keeper does not already have that action_id (avoid the UNIQUE(assessment_id, action_id) collision).
UPDATE public.coach_baseline_items ci
SET assessment_id = keep.keeper_id
FROM (
  SELECT
    a.id AS dup_id,
    (SELECT a2.id
       FROM public.coach_baseline_assessments a2
      WHERE a2.doctor_staff_id = a.doctor_staff_id
      ORDER BY a2.created_at ASC, a2.id ASC
      LIMIT 1) AS keeper_id
  FROM public.coach_baseline_assessments a
) keep
WHERE ci.assessment_id = keep.dup_id
  AND keep.dup_id <> keep.keeper_id
  AND NOT EXISTS (
    SELECT 1 FROM public.coach_baseline_items k
    WHERE k.assessment_id = keep.keeper_id
      AND k.action_id = ci.action_id
  );

-- A.2 Delete the non-keeper assessments. Their remaining items (the ones that
--     conflicted in A.1) cascade via coach_baseline_items.assessment_id ON DELETE CASCADE.
DELETE FROM public.coach_baseline_assessments a
WHERE a.id <> (
  SELECT a2.id
    FROM public.coach_baseline_assessments a2
   WHERE a2.doctor_staff_id = a.doctor_staff_id
   ORDER BY a2.created_at ASC, a2.id ASC
   LIMIT 1
);

-- ─────────────────────────────────────────────────────────────────────────────
-- B. One assessment per doctor
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.coach_baseline_assessments
  DROP CONSTRAINT IF EXISTS coach_baseline_assessments_doctor_staff_id_coach_staff_id_key;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'coach_baseline_assessments_doctor_staff_id_key'
  ) THEN
    ALTER TABLE public.coach_baseline_assessments
      ADD CONSTRAINT coach_baseline_assessments_doctor_staff_id_key UNIQUE (doctor_staff_id);
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- C. Atomic resume-or-create RPC
-- ─────────────────────────────────────────────────────────────────────────────
-- SECURITY DEFINER so it can enforce the one-per-doctor rule in a single
-- statement without tripping the "first assessment only" INSERT policy or the
-- mount-time race. Returns the existing assessment if present, otherwise creates
-- one owned by the calling clinical director.

CREATE OR REPLACE FUNCTION public.get_or_create_coach_baseline_assessment(_doctor_staff_id uuid)
RETURNS public.coach_baseline_assessments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _coach_staff_id uuid;
  _row public.coach_baseline_assessments;
BEGIN
  IF NOT public.is_clinical_or_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only clinical directors can open a coach baseline assessment';
  END IF;

  -- Resume: first-to-start owns it; any clinical director co-edits the same row.
  SELECT * INTO _row
  FROM public.coach_baseline_assessments
  WHERE doctor_staff_id = _doctor_staff_id
  ORDER BY created_at ASC, id ASC
  LIMIT 1;

  IF FOUND THEN
    RETURN _row;
  END IF;

  -- Otherwise create one owned by the calling coach. ON CONFLICT makes
  -- concurrent first-opens converge on a single row instead of erroring.
  _coach_staff_id := public.get_staff_id_for_user(auth.uid());

  INSERT INTO public.coach_baseline_assessments (doctor_staff_id, coach_staff_id, status)
  VALUES (_doctor_staff_id, _coach_staff_id, 'in_progress')
  ON CONFLICT (doctor_staff_id) DO UPDATE SET updated_at = now()
  RETURNING * INTO _row;

  RETURN _row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_or_create_coach_baseline_assessment(uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Sanity check
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE _dupes int;
BEGIN
  SELECT count(*) INTO _dupes FROM (
    SELECT doctor_staff_id
    FROM public.coach_baseline_assessments
    GROUP BY doctor_staff_id
    HAVING count(*) > 1
  ) t;
  IF _dupes > 0 THEN
    RAISE EXCEPTION 'Dedupe failed: % doctor(s) still have multiple coach baseline assessments', _dupes;
  END IF;
  RAISE NOTICE 'coach baseline resume fix applied cleanly';
END $$;
