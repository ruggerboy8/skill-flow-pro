-- Recompute aggregated self-scores for the recently-submitted eval
SELECT public.compute_eval_self_scores('406a4910-609a-446f-8e03-3d657588aab0'::uuid);

-- Auto-release the eval to the staff member (matches new submit behavior)
UPDATE public.evaluations
SET is_visible_to_staff = true,
    released_at = COALESCE(released_at, now())
WHERE id = '406a4910-609a-446f-8e03-3d657588aab0'
  AND status = 'submitted'
  AND is_visible_to_staff = false;