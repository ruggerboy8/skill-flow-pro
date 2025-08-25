-- Schedule weekly rollover to run hourly
SELECT cron.schedule(
  'weekly-rollover',
  '0 * * * *', -- Every hour
  $$
  SELECT
    net.http_post(
        url:='https://yeypngaufuualdfzcjpk.supabase.co/functions/v1/rollover-weekly',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlleXBuZ2F1ZnV1YWxkZnpjanBrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM3MjEyMDMsImV4cCI6MjA2OTI5NzIwM30.zugutVfLz0dgR7C9eRFUEGsRJBbkP0pAYjsZ9soUHyw"}'::jsonb,
        body:='{"scheduled": true}'::jsonb
    ) as request_id;
  $$
);