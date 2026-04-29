-- Backfill self-score aggregates and participation snapshots for all
-- draft Quarterly evaluations created before compute_eval_self_scores existed.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT id FROM public.evaluations
    WHERE type = 'Quarterly'
      AND status = 'draft'
      AND quarter IS NOT NULL
  LOOP
    PERFORM public.compute_eval_self_scores(r.id);
    PERFORM public.compute_eval_participation_snapshot(r.id);
  END LOOP;
END$$;