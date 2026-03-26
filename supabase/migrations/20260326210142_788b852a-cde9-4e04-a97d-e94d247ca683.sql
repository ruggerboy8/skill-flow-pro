
-- Fix misassigned competency_ids on role_id=6 pro moves
-- These were assigned competency_ids from role_id=1 due to the role_name lookup bug
UPDATE public.pro_moves pm
SET competency_id = c2.competency_id
FROM public.competencies c1
JOIN public.competencies c2 ON lower(c1.name) = lower(c2.name) AND c2.role_id = 6
WHERE pm.role_id = 6
  AND pm.competency_id = c1.competency_id
  AND c1.role_id = 1;
