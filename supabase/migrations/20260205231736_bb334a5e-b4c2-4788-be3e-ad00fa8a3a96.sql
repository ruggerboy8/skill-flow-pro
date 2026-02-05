-- Add flagged_domains column for storing gut check flags
ALTER TABLE doctor_baseline_assessments 
ADD COLUMN IF NOT EXISTS flagged_domains text[] DEFAULT '{}';