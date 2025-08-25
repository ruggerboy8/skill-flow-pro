-- Make confidence fields nullable if they aren't already
ALTER TABLE public.weekly_scores
  ALTER COLUMN confidence_score DROP NOT NULL,
  ALTER COLUMN confidence_date  DROP NOT NULL;

-- Optional but recommended: tiny helper index for week lookups
CREATE INDEX IF NOT EXISTS idx_weekly_scores_staff_focus
  ON public.weekly_scores (staff_id, weekly_focus_id);