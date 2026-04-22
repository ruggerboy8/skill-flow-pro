// Deputy sync dispatcher.
//
// Invoked weekly by pg_cron. Loops through every deputy_connections row where
// auto_sync_enabled = true and triggers deputy-sync (mode=apply_week) for the
// previous ISO week, using the service role for inter-function auth.
//
// Designed to be idempotent and safe to re-run: deputy-sync's apply_week mode
// upserts excused_submissions with ignoreDuplicates, and each invocation creates
// its own audit row in deputy_sync_runs.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

/** Returns the Monday (UTC) of the week previous to `now`. */
function previousWeekMonday(now: Date): string {
  const d = new Date(now);
  const day = d.getUTCDay();
  const daysToMonday = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + daysToMonday - 7); // back one full week
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString().split('T')[0];
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const svc = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(supabaseUrl, svc);

    // Optional override for backfill / manual replay
    let body: Record<string, any> = {};
    try { body = await req.json(); } catch { /* allow empty */ }
    const weekOf = body.week_of as string | undefined ?? previousWeekMonday(new Date());

    const { data: connections, error: connErr } = await admin
      .from('deputy_connections')
      .select('organization_id')
      .eq('auto_sync_enabled', true);

    if (connErr) {
      console.error('dispatcher: connection lookup failed', connErr);
      return json(500, { ok: false, error: connErr.message });
    }

    const results: Array<{ organization_id: string; ok: boolean; error?: string; data?: any }> = [];

    for (const c of (connections ?? []) as Array<{ organization_id: string }>) {
      try {
        const r = await fetch(`${supabaseUrl}/functions/v1/deputy-sync`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${svc}`,
          },
          body: JSON.stringify({
            mode: 'apply_week',
            week_of: weekOf,
            system: true,
            trigger: 'cron',
            organization_id: c.organization_id,
          }),
        });
        const data = await r.json().catch(() => ({}));
        if (!r.ok || !data?.ok) {
          results.push({
            organization_id: c.organization_id,
            ok: false,
            error: data?.error ?? `HTTP ${r.status}`,
          });
        } else {
          results.push({
            organization_id: c.organization_id,
            ok: true,
            data: {
              excusals_inserted: data.excusals_inserted,
              mapped_participant_count: data.mapped_participant_count,
            },
          });
        }
      } catch (err: any) {
        console.error(`dispatcher: org ${c.organization_id} failed`, err);
        results.push({ organization_id: c.organization_id, ok: false, error: err?.message ?? 'unknown' });
      }
    }

    return json(200, {
      ok: true,
      week_of: weekOf,
      orgs_processed: results.length,
      orgs_succeeded: results.filter((r) => r.ok).length,
      orgs_failed: results.filter((r) => !r.ok).length,
      results,
    });
  } catch (err: any) {
    console.error('dispatcher error:', err);
    return json(500, { ok: false, error: err?.message ?? 'Unexpected error' });
  }
});
