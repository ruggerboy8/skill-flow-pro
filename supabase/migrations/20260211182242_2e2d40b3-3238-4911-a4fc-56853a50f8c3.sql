-- Fix the function overload issue: drop the bigint version if it exists
-- and ensure only the integer[] version remains
DO $$
BEGIN
  -- Try dropping bigint[] variant
  BEGIN
    DROP FUNCTION IF EXISTS public.save_eval_acknowledgement_and_focus(uuid, bigint[]);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
END $$;
