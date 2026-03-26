-- Drop unused views (no dependencies)
DROP VIEW IF EXISTS action_usage_stats;
DROP VIEW IF EXISTS pro_move_usage_view;

-- Drop unused tables
DROP TABLE IF EXISTS weekly_scores_backup_20241124;
DROP TABLE IF EXISTS pro_move_resources_legacy;
DROP TABLE IF EXISTS learning_resources_legacy CASCADE;
DROP TABLE IF EXISTS orphaned_scores_log;
DROP TABLE IF EXISTS alcan_weekly_plan;