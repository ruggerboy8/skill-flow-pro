import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { format, addWeeks, startOfWeek, addDays } from 'https://esm.sh/date-fns@3.6.0';
import { formatInTimeZone, fromZonedTime } from 'https://esm.sh/date-fns-tz@3.2.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RolloverRequest {
  roles?: number[];
  asOf?: string;
  dryRun?: boolean;
  force?: boolean;
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
    const { roles = [1, 2], asOf, dryRun = false, force = false } = body;

    const logs: string[] = [];
    logs.push(`[Global Rollover] Starting for roles: ${roles.join(', ')}`);
    
    // Check global gate: has any location reached C3W6?
    if (!force) {
      const gateOpen = await checkGlobalGate(supabase, logs);
      if (!gateOpen) {
        logs.push('[Global Rollover] Gate closed: no location at C3W6 yet');
        return new Response(
          JSON.stringify({ 
            status: 'waiting_for_first_location',
            message: 'Progress gate not met (C3W6)', 
            logs 
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      logs.push('[Global Rollover] Gate open ✓');
    }

    // Get global timezone from app_kv
    const { data: tzData } = await supabase
      .from('app_kv')
      .select('value')
      .eq('key', 'sequencer:global_timezone')
      .maybeSingle();

    const globalTz = (tzData?.value as any)?.timezone || 'America/Chicago';
    logs.push(`[Global Rollover] Using timezone: ${globalTz}`);

    const now = asOf ? new Date(asOf) : new Date();
    
    // Check if we're at Mon 12:01 AM in global timezone (or in force mode)
    if (!force && !asOf) {
      const localDay = formatInTimeZone(now, globalTz, 'i');
      const localHour = parseInt(formatInTimeZone(now, globalTz, 'H'), 10);
      const localMinute = parseInt(formatInTimeZone(now, globalTz, 'm'), 10);
      
      if (localDay !== '1' || localHour !== 0 || localMinute < 1) {
        logs.push(`[Global Rollover] Not rollover time (day=${localDay}, hour=${localHour}, min=${localMinute})`);
        return new Response(
          JSON.stringify({ 
            status: 'not_rollover_time',
            message: 'Not rollover time (Mon 12:01 AM global time)', 
            logs 
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      logs.push('[Global Rollover] Rollover time confirmed ✓');
    }

    // Calculate Monday anchors in global TZ
    const mondayZ = toZonedStart(now, globalTz);
    const currentWeekStr = format(mondayZ, 'yyyy-MM-dd');
    const nextWeekStr = format(addWeeks(mondayZ, 1), 'yyyy-MM-dd');

    logs.push(`[Global Rollover] Weeks: Current=${currentWeekStr}, Next=${nextWeekStr}`);

    const results = [];

    for (const roleId of roles) {
      const roleLogs: string[] = [];
      try {
        // Step 1: Lock current week
        roleLogs.push(`[Lock This Week] Locking ${currentWeekStr} for role ${roleId}`);
        
        // First check if current week exists at all
        const { data: existingCurrent } = await supabase
          .from('weekly_plan')
          .select('id, status')
          .is('org_id', null)
          .eq('role_id', roleId)
          .eq('week_start_date', currentWeekStr)
          .limit(1);

        if (!existingCurrent || existingCurrent.length === 0) {
          // First week after gate - generate it as locked
          roleLogs.push(`[Lock This Week] First week after gate - generating locked plan`);
          if (!dryRun) {
            await generateWeekPlan(supabase, null, roleId, currentWeekStr, globalTz, false, 'locked', roleLogs);
          }
        } else {
          // Update proposed → locked
          if (!dryRun) {
            const { error: lockError } = await supabase
              .from('weekly_plan')
              .update({ status: 'locked', locked_at: new Date().toISOString() })
              .is('org_id', null)
              .eq('role_id', roleId)
              .eq('week_start_date', currentWeekStr)
              .eq('status', 'proposed');

            if (lockError) {
              roleLogs.push(`[Lock This Week] Error: ${lockError.message}`);
            } else {
              roleLogs.push('[Lock This Week] Locked successfully ✓');
            }
          } else {
            roleLogs.push('[Lock This Week] Skipped (dry run)');
          }
        }

        // Step 2: Generate/refresh next week (unless overridden)
        roleLogs.push(`[Generate Next] Checking ${nextWeekStr}`);
        if (!dryRun) {
          await generateWeekPlan(supabase, null, roleId, nextWeekStr, globalTz, true, 'proposed', roleLogs);
        } else {
          roleLogs.push('[Generate Next] Skipped (dry run)');
        }

        // Log to sequencer_runs
        if (!dryRun) {
          await supabase.from('sequencer_runs').insert({
            org_id: null,
            role_id: roleId,
            target_week_start: currentWeekStr,
            mode: 'global_cron',
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
          logs: roleLogs
        });

      } catch (error: any) {
        console.error(`[Global Rollover] Error for role ${roleId}:`, error);
        roleLogs.push(`[ERROR] ${error.message}`);
        
        if (!dryRun) {
          await supabase.from('sequencer_runs').insert({
            org_id: null,
            role_id: roleId,
            target_week_start: currentWeekStr,
            mode: 'global_cron',
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
          error: error.message,
          logs: roleLogs
        });
      }
    }

    return new Response(
      JSON.stringify({ success: true, dryRun, results, logs }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[Global Rollover] Fatal error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// Check if any active location globally has reached C3W6
async function checkGlobalGate(supabase: any, logs: string[]): Promise<boolean> {
  const { data: locations } = await supabase
    .from('locations')
    .select('id, program_start_date, cycle_length_weeks, timezone')
    .eq('active', true);

  if (!locations || locations.length === 0) {
    logs.push('[Gate] No active locations found');
    return false;
  }

  for (const loc of locations) {
    const programStartDate = new Date(loc.program_start_date);
    const cycleLength = loc.cycle_length_weeks;
    const now = new Date();
    
    const daysDiff = Math.floor((now.getTime() - programStartDate.getTime()) / (1000 * 60 * 60 * 24));
    const weekIndex = Math.floor(daysDiff / 7);
    const cycleNumber = Math.max(1, Math.floor(weekIndex / cycleLength) + 1);
    const weekInCycle = Math.max(1, (weekIndex % cycleLength) + 1);
    
    if (cycleNumber === 3 && weekInCycle === 6) {
      logs.push(`[Gate] Location ${loc.id} at C3W6 ✓`);
      return true;
    }
  }

  logs.push('[Gate] No locations at C3W6 yet');
  return false;
}

// Calculate Monday anchor in timezone
function toZonedStart(now: Date, tz: string): Date {
  const isoDow = parseInt(formatInTimeZone(now, tz, 'i'), 10);
  const todayMidnightUtc = fromZonedTime(
    `${formatInTimeZone(now, tz, 'yyyy-MM-dd')}T00:00:00`,
    tz
  );
  return addDays(todayMidnightUtc, -(isoDow - 1));
}

// Generate a week's plan (global: org_id = null)
async function generateWeekPlan(
  supabase: any, 
  orgId: string | null,
  roleId: number, 
  weekStartDate: string, 
  timezone: string,
  respectOverride: boolean = true,
  status: 'proposed' | 'locked' = 'proposed',
  logs: string[] = []
) {
  // Check if week is overridden
  if (respectOverride) {
    const { data: existing } = await supabase
      .from('weekly_plan')
      .select('id, overridden')
      .is('org_id', null)
      .eq('role_id', roleId)
      .eq('week_start_date', weekStartDate)
      .limit(1);

    if (existing && existing.length > 0 && existing[0].overridden) {
      logs.push(`[generateWeekPlan] Week ${weekStartDate} is overridden, skipping`);
      return;
    }
  }

  // Call sequencer-rank to get ranked moves
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
    .is('org_id', null)
    .eq('role_id', roleId)
    .eq('week_start_date', weekStartDate)
    .neq('overridden', true);

  if (deleteError) {
    logs.push(`[generateWeekPlan] Delete error: ${deleteError.message}`);
  }

  // Insert new plan (global: org_id = NULL)
  const planRows = nextPicks.slice(0, 3).map((pick: any, index: number) => ({
    org_id: null,
    role_id: roleId,
    week_start_date: weekStartDate,
    display_order: index + 1,
    action_id: pick.proMoveId,
    self_select: false,
    status,
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

  logs.push(`[generateWeekPlan] Generated ${planRows.length} moves for ${weekStartDate} (status: ${status})`);
}
