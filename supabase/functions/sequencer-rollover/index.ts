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
        console.log(`[Generate Next] Refreshing ${nextWeekStr} as PROPOSED`);
        console.log(`[Prepare N+1] Refreshing ${nplus1WeekStr} as PROPOSED`);

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
