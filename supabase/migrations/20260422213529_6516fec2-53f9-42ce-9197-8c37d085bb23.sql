WITH paused AS (
  SELECT id,
    (date_trunc('week', (paused_at AT TIME ZONE 'America/Chicago')::date)::date) AS first_monday,
    COALESCE(pause_reason, 'Paused') AS reason
  FROM staff WHERE is_paused = true
),
weeks AS (
  SELECT p.id AS staff_id, p.reason,
    generate_series(p.first_monday, date_trunc('week', CURRENT_DATE)::date, interval '1 week')::date AS week_of
  FROM paused p
),
metrics AS (SELECT unnest(ARRAY['confidence','performance']) AS metric)
INSERT INTO excused_submissions (staff_id, week_of, metric, reason)
SELECT w.staff_id, w.week_of, m.metric, w.reason
FROM weeks w CROSS JOIN metrics m
ON CONFLICT DO NOTHING;