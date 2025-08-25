-- Ensure at most one open backlog record per staff/action
CREATE UNIQUE INDEX IF NOT EXISTS uniq_open_backlog_v2
ON user_backlog_v2 (staff_id, action_id)
WHERE resolved_on IS NULL;