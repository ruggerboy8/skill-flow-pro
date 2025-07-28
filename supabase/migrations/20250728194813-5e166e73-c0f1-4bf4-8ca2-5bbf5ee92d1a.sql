-- 1-a  add explicit competency + self_select flag
ALTER TABLE public.weekly_focus
  ADD COLUMN competency_id  bigint REFERENCES public.competencies(competency_id),
  ADD COLUMN self_select    boolean NOT NULL DEFAULT false;   -- false = we assign action

-- 1-b  make action_id nullable (only required when self_select = false)
ALTER TABLE public.weekly_focus
  ALTER COLUMN action_id DROP NOT NULL;

-- 1-c  keep data integrity with a CHECK constraint
ALTER TABLE public.weekly_focus
  ADD CONSTRAINT chk_action_or_selfselect
  CHECK (
    (self_select = false  AND action_id IS NOT NULL) OR
    (self_select = true   AND action_id IS NULL)
  );

-- 1-d  de-dup key now needs competency_id when self_select = true
ALTER TABLE public.weekly_focus
  DROP CONSTRAINT IF EXISTS unique_cycle_week_role_action;

CREATE UNIQUE INDEX uniq_cycle_week_role
  ON public.weekly_focus (cycle, week_in_cycle, role_id, COALESCE(action_id, competency_id));

-- 2 | Forward-compatible change to weekly_scores
ALTER TABLE public.weekly_scores
  ADD COLUMN selected_action_id bigint REFERENCES public.pro_moves(action_id);