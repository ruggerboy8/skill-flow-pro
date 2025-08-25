import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Helper: is it Monday between 00:01 and 01:01 in tz?
function inRolloverWindow(now: Date, tz: string): boolean {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour12: false,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(now);

  const weekday = parts.find(p => p.type === 'weekday')?.value || '';
  const hour = parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10);
  const minute = parseInt(parts.find(p => p.type === 'minute')?.value || '0', 10);

  const mins = hour * 60 + minute;
  // Monday (Mon), from 00:01 inclusive to 01:01 exclusive
  return weekday.toLowerCase().startsWith('mon') && mins >= 1 && mins < 61;
}

// Helper to enforce weekly rollover for a single staff member
async function enforceWeeklyRolloverNow(args: {
  userId: string;
  staffId: string;
  roleId: number;
  locationId: string;
  now: Date;
}) {
  const { staffId, roleId, locationId, now } = args;

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  // 1) Location
  const { data: loc, error: locErr } = await supabase
    .from('locations')
    .select('timezone, program_start_date, cycle_length_weeks')
    .eq('id', locationId)
    .maybeSingle();
  if (locErr || !loc) {
    console.log(`Location not found: ${locationId}`);
    return;
  }

  // IMPORTANT: No inner Monday/threshold gate here — the caller already ran the window check.

  // 2) Previous week (simple -7d)
  const prevWeekDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // 3) Map prev date -> cycle/week (same approach as before)
  const start = new Date(loc.program_start_date);
  const daysSinceStart = Math.floor((prevWeekDate.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
  const totalWeeks = Math.max(0, Math.floor(daysSinceStart / 7));
  const prevCycle = Math.floor(totalWeeks / loc.cycle_length_weeks) + 1;
  const prevWeek = (totalWeeks % loc.cycle_length_weeks) + 1;

  console.log(`Processing rollover for staff ${staffId}, prev cycle ${prevCycle}, week ${prevWeek}`);

  // 4) Focus rows
  const { data: focusRows } = await supabase
    .from('weekly_focus')
    .select('id, action_id, self_select')
    .eq('role_id', roleId)
    .eq('cycle', prevCycle)
    .eq('week_in_cycle', prevWeek);

  const focusIds = (focusRows || []).map(f => f.id);
  if (!focusIds.length) {
    console.log(`No focus rows for cycle ${prevCycle}, week ${prevWeek}`);
    return;
  }

  // 5) Score status with hadAnyConfidence guard
  const { data: prevScores } = await supabase
    .from('weekly_scores')
    .select('id, weekly_focus_id, confidence_score, performance_score')
    .eq('staff_id', staffId)
    .in('weekly_focus_id', focusIds);

  const required = focusIds.length;
  const confCount = (prevScores || []).filter(s => s.confidence_score !== null).length;
  const perfCount = (prevScores || []).filter(s => s.performance_score !== null).length;
  const fullyPerformed = perfCount >= required;
  const hadAnyConfidence = confCount > 0;

  if (fullyPerformed) {
    console.log('Week fully performed — nothing to do');
    return;
  }
  if (!hadAnyConfidence) {
    console.log('No confidence was submitted — skipping backlog');
    return;
  }

  // 6) Backlog site moves (RPC dedups)
  const siteActionIds = (focusRows || [])
    .filter(f => !f.self_select && f.action_id)
    .map(f => f.action_id as number);

  for (const actionId of siteActionIds) {
    await supabase.rpc('add_backlog_if_missing', {
      p_staff_id: staffId,
      p_action_id: actionId,
      p_cycle: prevCycle,
      p_week: prevWeek
    });
  }

  // 7) Clear confidence if performance missing
  const toClear = (prevScores || []).filter(r => r.performance_score === null);
  if (toClear.length) {
    const updates = toClear.map(r => ({
      id: r.id,
      staff_id: staffId,
      weekly_focus_id: r.weekly_focus_id,
      confidence_score: null,
      confidence_date: null,
    }));
    await supabase.from('weekly_scores').upsert(updates);
    console.log(`Cleared confidence for ${updates.length} rows`);
  }

  console.log(`Rollover complete for staff ${staffId}`);
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // DEV hook: POST a JSON body to force-run for one staff now
  if (req.method === 'POST') {
    const body = await req.json().catch(() => ({}));
    if (body && body.staffId && body.roleId && body.locationId && body.userId) {
      const now = body.nowISO ? new Date(body.nowISO) : new Date();
      await enforceWeeklyRolloverNow({
        userId: body.userId,
        staffId: body.staffId,
        roleId: Number(body.roleId),
        locationId: body.locationId,
        now
      });
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      });
    }
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    const now = new Date();
    console.log(`Running weekly rollover check at ${now.toISOString()}`);

    // Find locations that are in their rollover window (Monday 00:01-01:01 local)
    const { data: locations } = await supabase
      .from('locations')
      .select('id, name, timezone, program_start_date, cycle_length_weeks');

    const locationsToProcess = (locations || [])
      .filter(loc => inRolloverWindow(now, loc.timezone || 'America/Chicago'))
      .map(loc => loc.id);

    if (locationsToProcess.length === 0) {
      console.log('No locations in rollover window');
      return new Response(JSON.stringify({ message: 'No locations ready for rollover' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    let processedCount = 0;

    // Process each location's staff
    for (const locationId of locationsToProcess) {
      const { data: staff } = await supabase
        .from('staff')
        .select('id, user_id, role_id, primary_location_id')
        .eq('primary_location_id', locationId);

      for (const staffMember of staff || []) {
        if (staffMember.role_id && staffMember.primary_location_id) {
          await enforceWeeklyRolloverNow({
            userId: staffMember.user_id,
            staffId: staffMember.id,
            roleId: staffMember.role_id,
            locationId: staffMember.primary_location_id,
            now: now
          });
          processedCount++;
        }
      }
    }

    console.log(`Processed rollover for ${processedCount} staff members`);

    return new Response(JSON.stringify({ 
      message: `Processed rollover for ${processedCount} staff members across ${locationsToProcess.length} locations` 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    console.error('Rollover function error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});