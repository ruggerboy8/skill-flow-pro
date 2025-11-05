import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { format, addWeeks, startOfWeek, addDays } from 'https://esm.sh/date-fns@3.6.0';
import { formatInTimeZone, fromZonedTime } from 'https://esm.sh/date-fns-tz@3.2.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RolloverRequest {
  roles: number[];
  orgId: string;
  testDate?: string;
  dryRun?: boolean;
  forceRollover?: boolean; // Skip time/gate checks for testing
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const body: RolloverRequest = await req.json();
    const { roles, orgId, testDate, dryRun = false, forceRollover = false } = body;

    if (!roles || roles.length === 0 || !orgId) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: roles, orgId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const logs: string[] = [];
    logs.push(`[Rollover] Starting for org ${orgId}, roles: ${roles.join(', ')}`);
    
    // Check progress gate: has any location in this org reached C3W6?
    if (!forceRollover) {
      const gateOpen = await checkProgressGate(supabase, orgId);
      if (!gateOpen) {
        logs.push('[Rollover] Progress gate closed: no location at C3W6 yet');
        return new Response(
          JSON.stringify({ 
            success: false, 
            message: 'Progress gate not met (C3W6)', 
            logs 
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      logs.push('[Rollover] Progress gate open');
    }

    // Get org timezone
    const { data: orgData } = await supabase
      .from('organizations')
      .select('id')
      .eq('id', orgId)
      .maybeSingle();

    if (!orgData) {
      throw new Error(`Organization ${orgId} not found`);
    }

    // Get timezone from first location in org (fallback to CT)
    const { data: locData } = await supabase
      .from('locations')
      .select('timezone')
      .eq('organization_id', orgId)
      .limit(1)
      .maybeSingle();

    const orgTz = locData?.timezone || 'America/Chicago';
    logs.push(`[Rollover] Using timezone: ${orgTz}`);

    const now = testDate ? new Date(testDate) : new Date();
    
    // Check if we're at Mon 12:01 AM in org timezone (or in test/force mode)
    if (!forceRollover && !testDate) {
      const localDay = formatInTimeZone(now, orgTz, 'i'); // ISO day (1=Mon)
      const localHour = parseInt(formatInTimeZone(now, orgTz, 'H'), 10);
      const localMinute = parseInt(formatInTimeZone(now, orgTz, 'm'), 10);
      
      if (localDay !== '1' || localHour !== 0 || localMinute < 1) {
        logs.push(`[Rollover] Not rollover time (day=${localDay}, hour=${localHour}, min=${localMinute})`);
        return new Response(
          JSON.stringify({ 
            success: false, 
            message: 'Not rollover time (Mon 12:01 AM org time)', 
            logs 
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      logs.push('[Rollover] Rollover time confirmed');
    }

    // Calculate Monday anchor in org timezone
    const mondayZ = toZonedStart(now, orgTz);
    const currentWeekStr = format(mondayZ, 'yyyy-MM-dd');
    const nextWeekStr = format(addWeeks(mondayZ, 1), 'yyyy-MM-dd');
    const nplus1WeekStr = format(addWeeks(mondayZ, 2), 'yyyy-MM-dd');

    logs.push(`[Rollover] Weeks: Current=${currentWeekStr}, Next=${nextWeekStr}, N+1=${nplus1WeekStr}`);

    const results = [];

    for (const roleId of roles) {
      const roleLogs: string[] = [];
      try {
        // Step 1: Lock current week (if it's proposed)
        roleLogs.push(`[Lock Current] Locking ${currentWeekStr} for role ${roleId}`);
        if (!dryRun) {
          const { error: lockError } = await supabase
            .from('weekly_plan')
            .update({ status: 'locked', locked_at: new Date().toISOString() })
            .eq('org_id', orgId)
            .eq('role_id', roleId)
            .eq('week_start_date', currentWeekStr)
            .eq('status', 'proposed');

          if (lockError) {
            roleLogs.push(`[Lock Current] Error: ${lockError.message}`);
          } else {
            roleLogs.push('[Lock Current] Locked successfully');
          }
        } else {
          roleLogs.push('[Lock Current] Skipped (dry run)');
        }

        // Step 2: Generate/refresh next week (unless overridden)
        roleLogs.push(`[Generate Next] Checking ${nextWeekStr}`);
        if (!dryRun) {
          await generateWeekPlan(supabase, orgId, roleId, nextWeekStr, orgTz, true, roleLogs);
        } else {
          roleLogs.push('[Generate Next] Skipped (dry run)');
        }

        // Step 3: Generate/refresh N+1 week (unless overridden)
        roleLogs.push(`[Prepare N+1] Checking ${nplus1WeekStr}`);
        if (!dryRun) {
          await generateWeekPlan(supabase, orgId, roleId, nplus1WeekStr, orgTz, true, roleLogs);
        } else {
          roleLogs.push('[Prepare N+1] Skipped (dry run)');
        }

        // Log to sequencer_runs
        if (!dryRun) {
          await supabase.from('sequencer_runs').insert({
            org_id: orgId,
            role_id: roleId,
            target_week_start: currentWeekStr,
            mode: 'cron',
            success: true,
            logs: roleLogs,
            run_at: new Date().toISOString()
          });
        }

        results.push({
          roleId,
          status: 'success',
          currentWeek: currentWeekStr,
          nextWeek: nextWeekStr,
          nplus1Week: nplus1WeekStr,
          logs: roleLogs
        });

      } catch (error: any) {
        console.error(`[Rollover] Error for role ${roleId}:`, error);
        roleLogs.push(`[ERROR] ${error.message}`);
        
        if (!dryRun) {
          await supabase.from('sequencer_runs').insert({
            org_id: orgId,
            role_id: roleId,
            target_week_start: currentWeekStr,
            mode: 'cron',
            success: false,
            error_message: error.message,
            logs: roleLogs,
            run_at: new Date().toISOString()
          });
        }

        results.push({
          roleId,
          status: 'error',
          currentWeek: currentWeekStr,
          nextWeek: nextWeekStr,
          nplus1Week: nplus1WeekStr,
          error: error.message,
          logs: roleLogs
        });
      }
    }

    return new Response(
      JSON.stringify({ success: true, dryRun, results }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[Rollover] Fatal error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// Helper: Check if org has reached C3W6 (progress gate)
async function checkProgressGate(supabase: any, orgId: string): Promise<boolean> {
  const { data: locations } = await supabase
    .from('locations')
    .select('id, program_start_date, cycle_length_weeks, timezone')
    .eq('organization_id', orgId)
    .eq('active', true);

  if (!locations || locations.length === 0) return false;

  for (const loc of locations) {
    const programStartDate = new Date(loc.program_start_date);
    const cycleLength = loc.cycle_length_weeks;
    const tz = loc.timezone || 'America/Chicago';
    const now = new Date();
    
    // Calculate week index from program start
    const daysDiff = Math.floor((now.getTime() - programStartDate.getTime()) / (1000 * 60 * 60 * 24));
    const weekIndex = Math.floor(daysDiff / 7);
    const cycleNumber = Math.max(1, Math.floor(weekIndex / cycleLength) + 1);
    const weekInCycle = Math.max(1, (weekIndex % cycleLength) + 1);
    
    if (cycleNumber === 3 && weekInCycle === 6) {
      console.log(`[ProgressGate] Location ${loc.id} at C3W6`);
      return true;
    }
  }

  return false;
}

// Helper: Calculate Monday anchor in org timezone
function toZonedStart(now: Date, tz: string): Date {
  const isoDow = parseInt(formatInTimeZone(now, tz, 'i'), 10); // 1=Mon..7=Sun
  const todayMidnightUtc = fromZonedTime(
    `${formatInTimeZone(now, tz, 'yyyy-MM-dd')}T00:00:00`,
    tz
  );
  return addDays(todayMidnightUtc, -(isoDow - 1)); // Monday 00:00 as UTC instant
}

// Helper function to generate a week's plan
async function generateWeekPlan(
  supabase: any, 
  orgId: string, 
  roleId: number, 
  weekStartDate: string, 
  timezone: string,
  respectOverride: boolean = true,
  logs: string[] = []
) {
  // Check if week is overridden
  if (respectOverride) {
    const { data: existing } = await supabase
      .from('weekly_plan')
      .select('id, overridden')
      .eq('org_id', orgId)
      .eq('role_id', roleId)
      .eq('week_start_date', weekStartDate)
      .limit(1);

    if (existing && existing.length > 0 && existing[0].overridden) {
      logs.push(`[generateWeekPlan] Week ${weekStartDate} is overridden, skipping`);
      return;
    }
  }

  // Call sequencer-rank to get the ranked moves
  const { data: rankData, error: rankError } = await supabase.functions.invoke('sequencer-rank', {
    body: {
      roleId,
      effectiveDate: weekStartDate,
      timezone
    }
  });

  if (rankError) {
    logs.push(`[generateWeekPlan] Rank error: ${rankError.message}`);
    throw new Error(`Failed to rank moves: ${rankError.message}`);
  }

  const nextPicks = rankData?.next || [];
  logs.push(`[generateWeekPlan] Ranked ${nextPicks.length} moves`);
  
  if (nextPicks.length === 0) {
    logs.push(`[generateWeekPlan] No moves ranked for ${weekStartDate}`);
    return;
  }

  // Delete existing plan for this week (if not overridden)
  const { error: deleteError } = await supabase
    .from('weekly_plan')
    .delete()
    .eq('org_id', orgId)
    .eq('role_id', roleId)
    .eq('week_start_date', weekStartDate)
    .neq('overridden', true);

  if (deleteError) {
    logs.push(`[generateWeekPlan] Delete error: ${deleteError.message}`);
  }

  // Insert new plan
  const planRows = nextPicks.slice(0, 3).map((pick: any, index: number) => ({
    org_id: orgId,
    role_id: roleId,
    week_start_date: weekStartDate,
    display_order: index + 1,
    action_id: pick.proMoveId,
    self_select: false,
    status: 'proposed',
    generated_by: 'auto',
    overridden: false
  }));

  const { error: insertError } = await supabase
    .from('weekly_plan')
    .insert(planRows);

  if (insertError) {
    logs.push(`[generateWeekPlan] Insert error: ${insertError.message}`);
    throw new Error(`Failed to insert plan: ${insertError.message}`);
  }

  logs.push(`[generateWeekPlan] Generated ${planRows.length} moves for ${weekStartDate}`);
}
