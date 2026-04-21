-- Ensure unique index for ON CONFLICT
CREATE UNIQUE INDEX IF NOT EXISTS excused_submissions_staff_week_metric_uniq
  ON public.excused_submissions (staff_id, week_of, metric);

-- Backfill excused_submissions for Makena Ward and Kaylie Aguilar
-- Both at America/Chicago locations. date_trunc('week', d)::date returns Monday (ISO).
WITH staff_pauses AS (
  SELECT
    '8635fffd-9410-4a2a-bd02-360491d79775'::uuid AS staff_id,
    DATE '2026-01-19' AS pause_start,
    DATE '2026-04-20' AS pause_end,
    'Maternity leave'::text AS reason
  UNION ALL
  SELECT
    '4d799bee-bc53-41ad-b59a-76565e38befb'::uuid,
    DATE '2026-01-23',
    DATE '2026-04-20',
    'Having a baby'
),
weeks AS (
  SELECT
    sp.staff_id,
    sp.reason,
    generate_series(
      date_trunc('week', sp.pause_start)::date,
      date_trunc('week', sp.pause_end)::date,
      INTERVAL '7 days'
    )::date AS week_of
  FROM staff_pauses sp
),
rows AS (
  SELECT staff_id, week_of, m.metric, reason
  FROM weeks
  CROSS JOIN (VALUES ('confidence'), ('performance')) AS m(metric)
)
INSERT INTO public.excused_submissions (staff_id, week_of, metric, reason)
SELECT staff_id, week_of, metric, reason FROM rows
ON CONFLICT (staff_id, week_of, metric) DO NOTHING;

-- Sanity check
DO $$
DECLARE
  makena_count INTEGER;
  kaylie_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO makena_count FROM public.excused_submissions
    WHERE staff_id = '8635fffd-9410-4a2a-bd02-360491d79775';
  SELECT COUNT(*) INTO kaylie_count FROM public.excused_submissions
    WHERE staff_id = '4d799bee-bc53-41ad-b59a-76565e38befb';
  RAISE NOTICE 'Excuse rows — Makena: %, Kaylie: %', makena_count, kaylie_count;
END $$;