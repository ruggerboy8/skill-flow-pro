
-- 1) weekly_focus.universal + integrity
ALTER TABLE public.weekly_focus
  ADD COLUMN IF NOT EXISTS universal boolean NOT NULL DEFAULT false;

-- At most one universal=true per (role_id, cycle, week_in_cycle)
CREATE UNIQUE INDEX IF NOT EXISTS weekly_focus_one_universal_per_group
  ON public.weekly_focus (role_id, cycle, week_in_cycle)
  WHERE universal = true;

COMMENT ON COLUMN public.weekly_focus.universal IS
  'When true, marks the office-wide anchor Pro Move for (role_id, cycle, week_in_cycle).';

-- RLS: admin-only write access on weekly_focus (read already allowed)
CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.staff
    WHERE user_id = _user_id
      AND is_super_admin = true
  );
$$;

-- Ensure RLS is enabled (safe if already enabled)
ALTER TABLE public.weekly_focus ENABLE ROW LEVEL SECURITY;

-- Replace/write policies for admin-only writes
DROP POLICY IF EXISTS "Admins can insert weekly focus" ON public.weekly_focus;
DROP POLICY IF EXISTS "Admins can update weekly focus" ON public.weekly_focus;
DROP POLICY IF EXISTS "Admins can delete weekly focus" ON public.weekly_focus;

CREATE POLICY "Admins can insert weekly focus"
  ON public.weekly_focus
  FOR INSERT
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Admins can update weekly focus"
  ON public.weekly_focus
  FOR UPDATE
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Admins can delete weekly focus"
  ON public.weekly_focus
  FOR DELETE
  USING (public.is_super_admin(auth.uid()));

-- 2) weekly_scores provenance flags + entered_by

-- Create enum type score_source if needed
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'score_source') THEN
    CREATE TYPE public.score_source AS ENUM ('live', 'backfill');
  END IF;
END$$;

ALTER TABLE public.weekly_scores
  ADD COLUMN IF NOT EXISTS confidence_source public.score_source NOT NULL DEFAULT 'live',
  ADD COLUMN IF NOT EXISTS performance_source public.score_source NOT NULL DEFAULT 'live',
  ADD COLUMN IF NOT EXISTS confidence_estimated boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS performance_estimated boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS entered_by uuid;

COMMENT ON COLUMN public.weekly_scores.confidence_source IS 'live|backfill';
COMMENT ON COLUMN public.weekly_scores.performance_source IS 'live|backfill';
COMMENT ON COLUMN public.weekly_scores.confidence_estimated IS 'true when confidence was estimated, not measured';
COMMENT ON COLUMN public.weekly_scores.performance_estimated IS 'true when performance was estimated, not measured';
COMMENT ON COLUMN public.weekly_scores.entered_by IS 'auth.users.id of the user who keyed the row';

-- Backfill entered_by from staff.user_id for existing rows
UPDATE public.weekly_scores ws
SET entered_by = s.user_id
FROM public.staff s
WHERE ws.entered_by IS NULL
  AND ws.staff_id = s.id;

-- Set default and enforce NOT NULL
ALTER TABLE public.weekly_scores
  ALTER COLUMN entered_by SET DEFAULT auth.uid(),
  ALTER COLUMN entered_by SET NOT NULL;

-- Trigger to enforce entered_by on INSERT and keep immutable on UPDATE
CREATE OR REPLACE FUNCTION public.set_entered_by()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.entered_by IS NULL THEN
      NEW.entered_by := auth.uid();
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Preserve original creator; ignore attempts to change it
    NEW.entered_by := OLD.entered_by;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_entered_by ON public.weekly_scores;
CREATE TRIGGER trg_set_entered_by
BEFORE INSERT OR UPDATE ON public.weekly_scores
FOR EACH ROW EXECUTE FUNCTION public.set_entered_by();

-- 3) Ensure selected_action_id references pro_moves(action_id)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'weekly_scores_selected_action_id_fkey'
  ) THEN
    ALTER TABLE public.weekly_scores
      ADD CONSTRAINT weekly_scores_selected_action_id_fkey
      FOREIGN KEY (selected_action_id)
      REFERENCES public.pro_moves(action_id)
      ON UPDATE NO ACTION
      ON DELETE SET NULL;
  END IF;
END$$;
