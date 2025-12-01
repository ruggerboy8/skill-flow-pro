# Edge Function Deployment Guide
## How to Deploy `sync-onboarding-assignments`

---

## What This Function Does

The `sync-onboarding-assignments` edge function automatically:
- Detects new locations or changed program start dates
- Generates missing `weekly_assignments` for onboarding weeks (C1-C3)
- Ensures all active locations have complete assignment coverage
- Runs weekly via cron to catch any gaps

---

## Deployment Steps

### Step 1: The function is already configured ✅

Your `supabase/config.toml` has been updated to include:
```toml
[functions.sync-onboarding-assignments]
verify_jwt = false
```

### Step 2: Deploy via Lovable's Auto-Deploy

**The function will auto-deploy** when Lovable rebuilds your preview. This happens automatically when:
- You make any code changes
- The preview rebuilds

**To verify deployment:**
1. Wait for the preview to rebuild (watch the build indicator)
2. Check the Supabase dashboard → Edge Functions
3. You should see `sync-onboarding-assignments` listed

### Step 3: Test the Function Manually

Once deployed, test it manually:

**Option A: Via Supabase Dashboard**
1. Go to https://supabase.com/dashboard/project/yeypngaufuualdfzcjpk/functions
2. Find `sync-onboarding-assignments`
3. Click "Invoke" button
4. Use empty body: `{}`
5. Check response - should show:
   ```json
   {
     "success": true,
     "locations_processed": 10,
     "templates_processed": 54,
     "assignments_inserted": 0,
     "assignments_skipped": 1080
   }
   ```

**Option B: Via cURL**
```bash
curl -X POST \
  https://yeypngaufuualdfzcjpk.supabase.co/functions/v1/sync-onboarding-assignments \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlleXBuZ2F1ZnV1YWxkZnpjanBrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM3MjEyMDMsImV4cCI6MjA2OTI5NzIwM30.zugutVfLz0dgR7C9eRFUEGsRJBbkP0pAYjsZ9soUHyw" \
  -H "Content-Type: application/json" \
  -d '{}'
```

### Step 4: Schedule Weekly Cron Job

**I need to set this up for you because it requires write access to the cron table.**

Please run this SQL query in your Supabase SQL Editor:

```sql
-- Schedule to run every Sunday at 2 AM UTC
SELECT cron.schedule(
  'sync-onboarding-assignments-weekly',
  '0 2 * * 0',
  $$
  SELECT
    net.http_post(
        url:='https://yeypngaufuualdfzcjpk.supabase.co/functions/v1/sync-onboarding-assignments',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlleXBuZ2F1ZnV1YWxkZnpjanBrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM3MjEyMDMsImV4cCI6MjA2OTI5NzIwM30.zugutVfLz0dgR7C9eRFUEGsRJBbkP0pAYjsZ9soUHyw"}'::jsonb,
        body:='{"scheduled": true}'::jsonb
    ) as request_id;
  $$
);
```

**To access Supabase SQL Editor:**
1. Go to https://supabase.com/dashboard/project/yeypngaufuualdfzcjpk/sql/new
2. Paste the SQL above
3. Click "Run"
4. Should see: `jobid: 2` (or next available ID)

**Verify cron job created:**
```sql
SELECT * FROM cron.job WHERE jobname = 'sync-onboarding-assignments-weekly';
```

---

## Monitoring

### Check Cron Execution History
```sql
-- See recent runs
SELECT 
  jobid,
  runid,
  job_pid,
  database,
  username,
  command,
  status,
  return_message,
  start_time,
  end_time
FROM cron.job_run_details
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'sync-onboarding-assignments-weekly')
ORDER BY start_time DESC
LIMIT 10;
```

### Check Edge Function Logs
1. Go to Supabase Dashboard → Edge Functions
2. Click `sync-onboarding-assignments`
3. Click "Logs" tab
4. Look for entries like:
   ```
   🔄 Starting onboarding assignments sync...
   📍 Found 10 active locations with onboarding
   📚 Found 54 onboarding focus templates
   🏢 Processing location: Lake Orion
   ✅ Sync complete
   ```

### Alert on Errors
If you want alerts when the function fails:

1. Add to the function code:
```typescript
catch (error) {
  console.error('❌ Sync failed:', error);
  
  // Optional: Send alert via email/Slack
  await supabase.from('error_log').insert({
    function_name: 'sync-onboarding-assignments',
    error_message: error.message,
    occurred_at: new Date().toISOString()
  });
  
  return new Response(
    JSON.stringify({ success: false, error: error.message }),
    { headers: corsHeaders, status: 500 }
  );
}
```

---

## Troubleshooting

### Function Not Showing Up
- Check `supabase/config.toml` includes the function
- Wait for preview rebuild to complete
- Check Lovable build logs for errors

### Cron Job Not Running
```sql
-- Check if job is active
SELECT active, schedule, command 
FROM cron.job 
WHERE jobname = 'sync-onboarding-assignments-weekly';

-- If active = false, enable it:
UPDATE cron.job 
SET active = true 
WHERE jobname = 'sync-onboarding-assignments-weekly';
```

### Function Returns Errors
Check logs:
```sql
-- Recent errors in cron execution
SELECT * FROM cron.job_run_details
WHERE status = 'failed'
  AND jobid = (SELECT jobid FROM cron.job WHERE jobname = 'sync-onboarding-assignments-weekly')
ORDER BY start_time DESC;
```

### Manual Re-sync Needed
If you add a new location or change program dates:
1. Go to Supabase Dashboard → Edge Functions
2. Click `sync-onboarding-assignments`
3. Click "Invoke" with empty body `{}`
4. Function will detect gaps and fill them immediately

---

## Next Steps After Deployment

Once deployed and cron scheduled:
1. ✅ Monitor first cron execution (next Sunday 2 AM)
2. ✅ Check logs confirm no errors
3. ✅ Proceed to Phase 3 (Frontend Migration)
4. ✅ Ask onboarding staff to test score submission

---

## Uninstalling (if needed)

**Remove cron job:**
```sql
SELECT cron.unschedule('sync-onboarding-assignments-weekly');
```

**Delete function:**
1. Remove from `supabase/config.toml`
2. Delete `supabase/functions/sync-onboarding-assignments/` folder
3. Wait for preview rebuild
