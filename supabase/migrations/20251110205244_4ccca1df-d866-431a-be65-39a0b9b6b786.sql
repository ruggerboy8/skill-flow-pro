-- Add unique constraint to prevent duplicate singleton resources (video, script) per action
CREATE UNIQUE INDEX IF NOT EXISTS uniq_pro_move_resources_singletons
  ON pro_move_resources (action_id, type)
  WHERE type IN ('video', 'script');