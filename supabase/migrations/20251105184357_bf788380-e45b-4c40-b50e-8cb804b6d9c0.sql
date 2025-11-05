-- Add week_start_date column to weekly_focus for reliable cooldown/recency
ALTER TABLE weekly_focus ADD COLUMN IF NOT EXISTS week_start_date DATE;

-- Backfill using created_at as proxy (America/Chicago timezone)
UPDATE weekly_focus
SET week_start_date = DATE_TRUNC('week', (created_at AT TIME ZONE 'America/Chicago'))::date
WHERE week_start_date IS NULL;

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_weekly_focus_week_start_date 
ON weekly_focus(week_start_date, role_id, action_id);