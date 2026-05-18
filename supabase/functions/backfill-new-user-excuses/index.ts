import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Returns YYYY-MM-DD for Monday of the week containing `d` (UTC-based)
function mondayOf(d: Date): string {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = x.getUTCDay(); // 0=Sun..6=Sat
  const diff = dow === 0 ? -6 : 1 - dow;
  x.setUTCDate(x.getUTCDate() + diff);
  return x.toISOString().slice(0, 10);
}

function addDaysISO(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
    const svc = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const authHeader = req.headers.get('Authorization') ?? '';

    const userClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const userId = userData.user.id;
    const admin = createClient(url, svc);

    const { data: staff, error: staffErr } = await admin
      .from('staff')
      .select('id, participation_start_at, hire_date, first_login_at')
      .eq('user_id', userId)
      .maybeSingle();

    if (staffErr || !staff) {
      return new Response(JSON.stringify({ ok: true, reason: 'no_staff' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Already processed
    if (staff.first_login_at) {
      return new Response(JSON.stringify({ ok: true, alreadyProcessed: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Stamp first_login_at first (idempotent guard for concurrent calls)
    await admin.from('staff').update({ first_login_at: new Date().toISOString() }).eq('id', staff.id);

    const startSource = staff.participation_start_at || staff.hire_date;
    if (!startSource) {
      return new Response(JSON.stringify({ ok: true, reason: 'no_start_date' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const startMonday = mondayOf(new Date(startSource));
    const currentMonday = mondayOf(new Date());

    // Build list of week_of values strictly before current week
    const weeks: string[] = [];
    let w = startMonday;
    while (w < currentMonday) {
      weeks.push(w);
      w = addDaysISO(w, 7);
    }

    if (weeks.length === 0) {
      return new Response(JSON.stringify({ ok: true, excusedWeeks: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Find existing excuses to avoid duplicates
    const { data: existing } = await admin
      .from('excused_submissions')
      .select('week_of, metric')
      .eq('staff_id', staff.id)
      .in('week_of', weeks);

    const existingKey = new Set((existing ?? []).map((r: any) => `${r.week_of}|${r.metric}`));

    const rows: any[] = [];
    for (const week_of of weeks) {
      for (const metric of ['confidence', 'performance']) {
        const k = `${week_of}|${metric}`;
        if (existingKey.has(k)) continue;
        rows.push({
          staff_id: staff.id,
          week_of,
          metric,
          reason: 'Auto-excused: user had not logged in yet',
          created_by: userId,
        });
      }
    }

    let inserted = 0;
    if (rows.length > 0) {
      const { error: insErr, count } = await admin
        .from('excused_submissions')
        .insert(rows, { count: 'exact' });
      if (insErr) {
        console.error('[backfill-new-user-excuses] insert error', insErr);
        return new Response(JSON.stringify({ error: insErr.message }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      inserted = count ?? rows.length;
    }

    return new Response(JSON.stringify({
      ok: true,
      excusedWeeks: weeks.length,
      inserted,
      startMonday,
      currentMonday,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('[backfill-new-user-excuses] error', e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
