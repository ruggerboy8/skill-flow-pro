-- Update all pro_moves to have role_id based on their competency's role_id
UPDATE public.pro_moves 
SET role_id = c.role_id
FROM public.competencies c 
WHERE pro_moves.competency_id = c.competency_id 
  AND pro_moves.role_id IS NULL;