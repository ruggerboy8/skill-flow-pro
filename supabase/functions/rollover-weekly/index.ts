import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.53.0'
import { addMinutes, subDays } from 'https://esm.sh/date-fns@3.6.0'
import { toZonedTime, formatInTimeZone } from 'https://esm.sh/date-fns-tz@3.2.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Get week anchors for a given timezone (from v2/time.ts logic)
function getWeekAnchors(now: Date, timezone: string) {
  const localNow = toZonedTime(now, timezone);
  const mondayOffset = (localNow.getDay() + 6) % 7; // 0=Monday, 1=Tuesday, etc.
  const monday = new Date(localNow);
  monday.setUTCDate(monday.getUTCDate() - mondayOffset);
  monday.setUTCHours(0, 0, 0, 0);
  
  return {
    checkin_open: monday,
    performance_deadline: addMinutes(monday, 6 * 24 * 60 + 23 * 60 + 59) // Friday 11:59pm
  };
}

// Enforce weekly rollover for a single staff member
async function enforceWeeklyRolloverNow(
  supabase: any,
  args: {
    userId: string;
    staffId: string;
    roleId: number;
    locationId: string;
    now: Date;
  }
): Promise<void> {
  const { userId, staffId, roleId, locationId, now } = args;

  console.log(`Processing rollover for staff ${staffId} at location ${locationId}`);

  // Get location details
  const { data: loc, error: locErr } = await supabase
    .from('locations')
    .select('timezone, program_start_date, cycle_length_weeks')
    .eq('id', locationId)
    .maybeSingle();
    
  if (locErr || !loc) {
    console.error(`Failed to get location ${locationId}:`, locErr);
    return;
  }

  // Check if it's time for rollover (Monday 00:01 local)
  const currAnchors = getWeekAnchors(now, loc.timezone);
  const rolloverThreshold = addMinutes(currAnchors.checkin_open, 1); // Mon 00:01 local
  if (now < rolloverThreshold) {
    console.log(`Not time for rollover yet for location ${locationId}`);
    return;
  }

  // Get previous week's context (simplified cycle/week calculation)
  const prevWeekStart = subDays(currAnchors.checkin_open, 7);
  const daysSinceStart = Math.floor((prevWeekStart.getTime() - new Date(loc.program_start_date).getTime()) / (1000 * 60 * 60 * 24));
  const totalWeeksSinceStart = Math.floor(daysSinceStart / 7);
  const prevCycle = Math.floor(totalWeeksSinceStart / loc.cycle_length_weeks) + 1;
  const prevWeek = (totalWeeksSinceStart % loc.cycle_length_weeks) + 1;

  console.log(`Previous week: Cycle ${prevCycle}, Week ${prevWeek}`);

  // Find weekly_focus rows for previous cycle/week/role
  const { data: focusRows } = await supabase
    .from('weekly_focus')
    .select('id, action_id, self_select')
    .eq('role_id', roleId)
    .eq('cycle', prevCycle)
    .eq('week_in_cycle', prevWeek);

  const focusIds = (focusRows || []).map((f: any) => f.id);
  if (!focusIds.length) {
    console.log(`No focus rows found for previous week`);
    return;
  }

  // Check completion: do we have performance for ALL of them?
  const { data: prevScores } = await supabase
    .from('weekly_scores')
    .select('id, weekly_focus_id, confidence_score, confidence_date, performance_score')
    .eq('staff_id', staffId)
    .in('weekly_focus_id', focusIds);

  const required = focusIds.length;
  const perfCount = (prevScores || []).filter((s: any) => s.performance_score !== null).length;
  const fullyPerformed = perfCount >= required;

  if (fullyPerformed) {
    console.log(`Week fully performed, no rollover needed`);
    return;
  }

  console.log(`Week incomplete (${perfCount}/${required}), processing rollover`);

  // 1) Add SITE moves from that week to backlog (dedup handled by RPC)
  const siteActionIds = (focusRows || [])
    .filter((f: any) => !f.self_select && f.action_id)
    .map((f: any) => f.action_id as number);

  for (const actionId of siteActionIds) {
    const { error } = await supabase.rpc('add_backlog_if_missing', {
      p_staff_id: staffId,
      p_action_id: actionId,
      p_cycle: prevCycle,
      p_week: prevWeek
    });
    if (error) {
      console.error(`Failed to add backlog item ${actionId}:`, error);
    }
  }

  // 2) Clear confidence for items that still lack performance
  const toClear = (prevScores || [])
    .filter((r: any) => r.performance_score === null);
    
  if (toClear.length) {
    const updates = toClear.map((r: any) => ({
      id: r.id,
      staff_id: staffId,
      weekly_focus_id: r.weekly_focus_id,
      confidence_score: null,
      confidence_date: null,
    }));
    
    const { error } = await supabase.from('weekly_scores').upsert(updates);
    if (error) {
      console.error(`Failed to clear confidence scores:`, error);
    } else {
      console.log(`Cleared confidence for ${toClear.length} incomplete items`);
    }
  }

  console.log(`Rollover completed for staff ${staffId}`);
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
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    const now = new Date();
    console.log(`Rollover check starting at ${now.toISOString()}`);

    // Get all locations and check which are in rollover window
    const { data: locations, error: locError } = await supabase
      .from('locations')
      .select('id, name, timezone, program_start_date, cycle_length_weeks');

    if (locError) {
      throw new Error(`Failed to fetch locations: ${locError.message}`);
    }

    let processedCount = 0;
    
    for (const location of locations || []) {
      // Check if this location is in the rollover window (Monday 00:01-01:01 local)
      const anchors = getWeekAnchors(now, location.timezone);
      const rolloverStart = addMinutes(anchors.checkin_open, 1); // Mon 00:01
      const rolloverEnd = addMinutes(anchors.checkin_open, 61);   // Mon 01:01
      
      const isInWindow = now >= rolloverStart && now < rolloverEnd;
      
      if (!isInWindow) {
        console.log(`Location ${location.name} not in rollover window`);
        continue;
      }

      console.log(`Processing rollover for location ${location.name} (${location.timezone})`);

      // Get all staff for this location
      const { data: staff, error: staffError } = await supabase
        .from('staff')
        .select('id, user_id, role_id')
        .eq('primary_location_id', location.id)
        .not('role_id', 'is', null);

      if (staffError) {
        console.error(`Failed to fetch staff for location ${location.id}:`, staffError);
        continue;
      }

      // Process rollover for each staff member
      for (const staffMember of staff || []) {
        try {
          await enforceWeeklyRolloverNow(supabase, {
            userId: staffMember.user_id,
            staffId: staffMember.id,
            roleId: staffMember.role_id,
            locationId: location.id,
            now
          });
          processedCount++;
        } catch (error) {
          console.error(`Failed to process rollover for staff ${staffMember.id}:`, error);
        }
      }
    }

    console.log(`Rollover check completed. Processed ${processedCount} staff members.`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        processed: processedCount,
        timestamp: now.toISOString()
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error) {
    console.error('Rollover function error:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message,
        timestamp: new Date().toISOString()
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});