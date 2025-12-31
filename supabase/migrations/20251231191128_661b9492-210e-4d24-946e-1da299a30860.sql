-- Insert initial setting with time gate disabled for holiday week
INSERT INTO app_kv (key, value, updated_at)
VALUES ('global:performance_time_gate_enabled', '{"enabled": false}'::jsonb, now())
ON CONFLICT (key) DO UPDATE SET value = '{"enabled": false}'::jsonb, updated_at = now();