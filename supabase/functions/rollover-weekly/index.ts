import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Helper to enforce weekly rollover for a single staff member
async function enforceWeeklyRolloverNow(args: {
  userId: string;
  staffId: string;
  roleId: number;
  locationId: string;
  now: Date;
}) {
  const { userId, staffId, roleId, locationId, now } = args;
  
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )

  // Get location timezone and config
  const { data: loc, error: locErr } = await supabase
    .from('locations')
    .select('timezone, program_start_date, cycle_length_weeks')
    .eq('id', locationId)
    .maybeSingle();

  if (locErr || !loc) {
    console.log(`Location not found: ${locationId}`);
    return;
  }

  // Calculate rollover threshold (Monday 00:01 local)
  const mondayStart = new Date(now);
  mondayStart.setUTCHours(0, 0, 0, 0);
  const dayOfWeek = mondayStart.getUTCDay();
  const daysUntilMonday = dayOfWeek === 0 ? 0 : (7 - dayOfWeek);
  mondayStart.setUTCDate(mondayStart.getUTCDate() + daysUntilMonday);
  
  // Adjust for timezone - this is simplified, real implementation would use date-fns-tz
  const timezoneOffset = loc.timezone === 'America/Chicago' ? -6 : 0; // Central time approximation
  const rolloverThreshold = new Date(mondayStart.getTime() + (1 * 60 * 1000)); // 00:01
  
  if (now < rolloverThreshold) {
    console.log(`Not rollover time yet for location ${locationId}`);
    return;
  }

  // Get previous week (subtract 7 days)
  const prevWeekDate = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));
  
  // Calculate previous cycle/week - simplified logic
  const daysSinceStart = Math.floor((prevWeekDate.getTime() - new Date(loc.program_start_date).getTime()) / (24 * 60 * 60 * 1000));
  const totalWeeks = Math.floor(daysSinceStart / 7);
  const prevCycle = Math.floor(totalWeeks / loc.cycle_length_weeks) + 1;
  const prevWeek = (totalWeeks % loc.cycle_length_weeks) + 1;

  console.log(`Processing rollover for staff ${staffId}, prev cycle ${prevCycle}, week ${prevWeek}`);

  // Find all weekly_focus rows for prev cycle/week/role
  const { data: focusRows } = await supabase
    .from('weekly_focus')
    .select('id, action_id, self_select')
    .eq('role_id', roleId)
    .eq('cycle', prevCycle)
    .eq('week_in_cycle', prevWeek);

  const focusIds = (focusRows || []).map(f => f.id);
  if (!focusIds.length) {
    console.log(`No focus rows found for cycle ${prevCycle}, week ${prevWeek}`);
    return;
  }

  // Check completion: do we have performance for ALL of them?
  const { data: prevScores } = await supabase
    .from('weekly_scores')
    .select('id, weekly_focus_id, confidence_score, confidence_date, performance_score')
    .eq('staff_id', staffId)
    .in('weekly_focus_id', focusIds);

  const required = focusIds.length;
  const perfCount = (prevScores || []).filter(s => s.performance_score !== null).length;
  const fullyPerformed = perfCount >= required;

  if (fullyPerformed) {
    console.log(`Week already fully performed for staff ${staffId}`);
    return; 
  }

  console.log(`Adding site moves to backlog for staff ${staffId}`);

  // 1) Add SITE moves from that week to backlog
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

  // 2) Clear confidence for items that still lack performance
  const toClear = (prevScores || [])
    .filter(r => r.performance_score === null);
    
  if (toClear.length) {
    const updates = toClear.map(r => ({
      id: r.id,
      staff_id: staffId,
      weekly_focus_id: r.weekly_focus_id,
      confidence_score: null,
      confidence_date: null,
    }));
    await supabase.from('weekly_scores').upsert(updates);
    console.log(`Cleared confidence for ${updates.length} incomplete items`);
  }

  console.log(`Rollover complete for staff ${staffId}`);
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
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

    const locationsToProcess: string[] = [];

    for (const location of locations || []) {
      // Simple timezone check - in production would use proper timezone libraries
      const localHour = now.getUTCHours() + (location.timezone === 'America/Chicago' ? -6 : 0);
      const dayOfWeek = now.getUTCDay();
      
      // Check if it's Monday 00:01-01:01 local time
      if (dayOfWeek === 1 && localHour >= 0 && localHour < 1) {
        locationsToProcess.push(location.id);
        console.log(`Location ${location.name} is in rollover window`);
      }
    }

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