-- Make org_id nullable in sequencer_runs to support global sequencing
ALTER TABLE sequencer_runs 
ALTER COLUMN org_id DROP NOT NULL;

-- Add a comment to document this design decision
COMMENT ON COLUMN sequencer_runs.org_id IS 'Organization ID - NULL for global sequencing runs, specific UUID for org-specific runs';