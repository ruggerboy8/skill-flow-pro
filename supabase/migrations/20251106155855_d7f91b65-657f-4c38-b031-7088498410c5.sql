-- Allow global_cron and global_manual modes in sequencer_runs
ALTER TABLE public.sequencer_runs
  DROP CONSTRAINT IF EXISTS sequencer_runs_mode_check;

ALTER TABLE public.sequencer_runs
  ADD CONSTRAINT sequencer_runs_mode_check
  CHECK (mode IN ('cron', 'manual', 'dry_run', 'global_cron', 'global_manual'));

COMMENT ON CONSTRAINT sequencer_runs_mode_check ON public.sequencer_runs 
  IS 'Allows: cron (org-specific scheduled), manual (org-specific manual), global_cron (global scheduled), global_manual (global manual), dry_run (testing)';