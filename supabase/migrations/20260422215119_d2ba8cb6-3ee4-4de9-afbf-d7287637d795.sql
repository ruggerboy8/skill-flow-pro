-- Remove any prior schedule with the same name (safe to re-run)
DO $$
DECLARE
  job_id_to_drop bigint;
BEGIN
  SELECT jobid INTO job_id_to_drop FROM cron.job WHERE jobname = 'deputy-sync-dispatcher-weekly';
  IF job_id_to_drop IS NOT NULL THEN
    PERFORM cron.unschedule(job_id_to_drop);
  END IF;
END $$;

SELECT cron.schedule(
  'deputy-sync-dispatcher-weekly',
  '0 8 * * 1',  -- every Monday at 08:00 UTC (03:00 America/Chicago)
  $$
  SELECT net.http_post(
    url := 'https://yeypngaufuualdfzcjpk.supabase.co/functions/v1/deputy-sync-dispatcher',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlleXBuZ2F1ZnV1YWxkZnpjanBrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM3MjEyMDMsImV4cCI6MjA2OTI5NzIwM30.zugutVfLz0dgR7C9eRFUEGsRJBbkP0pAYjsZ9soUHyw'
    ),
    body := jsonb_build_object('scheduled_at', now())
  ) AS request_id;
  $$
);