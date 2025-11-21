-- Add foreign key relationship between weekly_assignments and pro_moves
ALTER TABLE public.weekly_assignments
  ADD CONSTRAINT weekly_assignments_action_id_fkey
  FOREIGN KEY (action_id)
  REFERENCES public.pro_moves(action_id)
  ON DELETE SET NULL;

-- Add foreign key relationship between weekly_assignments and competencies
ALTER TABLE public.weekly_assignments
  ADD CONSTRAINT weekly_assignments_competency_id_fkey
  FOREIGN KEY (competency_id)
  REFERENCES public.competencies(competency_id)
  ON DELETE SET NULL;