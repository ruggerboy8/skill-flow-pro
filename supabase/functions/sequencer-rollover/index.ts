import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { format, addWeeks, startOfWeek } from 'https://esm.sh/date-fns@3.6.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RolloverRequest {
  roles: number[];
  orgId: string;
  testDate?: string;
  dryRun?: boolean;
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
    const { roles, orgId, testDate, dryRun = false } = body;

    if (!roles || roles.length === 0 || !orgId) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: roles, orgId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const refDate = testDate ? new Date(testDate) : new Date();
    const currentMonday = startOfWeek(refDate, { weekStartsOn: 1 });
    const nextMonday = addWeeks(currentMonday, 1);
    const nplus1Monday = addWeeks(currentMonday, 2);

    const currentWeekStr = format(currentMonday, 'yyyy-MM-dd');
    const nextWeekStr = format(nextMonday, 'yyyy-MM-dd');
    const nplus1WeekStr = format(nplus1Monday, 'yyyy-MM-dd');

    const results = [];

    for (const roleId of roles) {
      try {
        // Step 1: Lock current week (if it's proposed and we're on/past Monday)
        if (testDate || new Date().getDay() === 1) { // Monday or test mode
          console.log(`[Lock Current] Locking ${currentWeekStr} for role ${roleId}`);
          const { error: lockError } = await supabase
            .from('weekly_plan')
            .update({ status: 'locked', locked_at: new Date().toISOString() })
            .eq('org_id', orgId)
            .eq('role_id', roleId)
            .eq('week_start_date', currentWeekStr)
            .eq('status', 'proposed');

          if (lockError) {
            console.error(`[Lock Current] Error:`, lockError);
          }
        }

        // Step 2: Generate/refresh next week (proposed)
        console.log(`[Generate Next] Generating ${nextWeekStr} as PROPOSED`);
        await generateWeekPlan(supabase, orgId, roleId, nextWeekStr);

        // Step 3: Generate/refresh N+1 week (proposed)
        console.log(`[Prepare N+1] Generating ${nplus1WeekStr} as PROPOSED`);
        await generateWeekPlan(supabase, orgId, roleId, nplus1WeekStr);

        results.push({
          roleId,
          status: 'success',
          currentWeek: currentWeekStr,
          nextWeek: nextWeekStr,
          nplus1Week: nplus1WeekStr
        });

      } catch (error: any) {
        console.error(`[Rollover] Error for role ${roleId}:`, error);
        results.push({
          roleId,
          status: 'error',
          currentWeek: currentWeekStr,
          nextWeek: nextWeekStr,
          nplus1Week: nplus1WeekStr,
          error: error.message
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

// Helper function to generate a week's plan
async function generateWeekPlan(supabase: any, orgId: string, roleId: number, weekStartDate: string) {
  // Call sequencer-rank to get the ranked moves
  const { data: rankData, error: rankError } = await supabase.functions.invoke('sequencer-rank', {
    body: {
      roleId,
      effectiveDate: weekStartDate,
      timezone: 'America/Chicago'
    }
  });

  if (rankError) {
    console.error(`[generateWeekPlan] Rank error for ${weekStartDate}:`, rankError);
    throw new Error(`Failed to rank moves: ${rankError.message}`);
  }

  const nextPicks = rankData?.next || [];
  
  console.log(`[generateWeekPlan] Rank response for ${weekStartDate}:`, JSON.stringify(nextPicks.slice(0, 3).map((p: any) => ({ id: p.proMoveId, name: p.name }))));
  
  if (nextPicks.length === 0) {
    console.warn(`[generateWeekPlan] No moves ranked for ${weekStartDate}`);
    return;
  }

  // Delete existing plan for this week (if any)
  const { error: deleteError } = await supabase
    .from('weekly_plan')
    .delete()
    .eq('org_id', orgId)
    .eq('role_id', roleId)
    .eq('week_start_date', weekStartDate);

  if (deleteError) {
    console.error(`[generateWeekPlan] Delete error:`, deleteError);
  }

  // Insert new plan (UPSERT via unique constraint)
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
    console.error(`[generateWeekPlan] Insert error for ${weekStartDate}:`, insertError);
    throw new Error(`Failed to insert plan: ${insertError.message}`);
  }

  console.log(`[generateWeekPlan] Successfully generated ${planRows.length} moves for ${weekStartDate}`);
}
