import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { format, startOfWeek, addWeeks } from 'https://esm.sh/date-fns@3.6.0';
import { toZonedTime } from 'https://esm.sh/date-fns-tz@3.2.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!
  );

  try {
    // Get settings
    const { data: enabledData } = await supabase
      .from('app_kv')
      .select('value')
      .eq('key', 'sequencer:auto_enabled')
      .single();

    const { data: tzData } = await supabase
      .from('app_kv')
      .select('value')
      .eq('key', 'sequencer:org_timezone')
      .single();

    const orgTz = tzData?.value?.timezone || 'America/Chicago';

    // Check gate (global - checks all locations)
    const gateData = await supabase.rpc('check_sequencer_gate', {
      p_org_id: null
    });

    // Check if first week seeded (global)
    const { data: seededData } = await supabase
      .from('weekly_plan')
      .select('id')
      .is('org_id', null)
      .limit(1);

    // #10: Compute current dates in org timezone
    const nowLocal = toZonedTime(new Date(), orgTz);
    const currentMondayLocal = startOfWeek(nowLocal, { weekStartsOn: 1 });
    const nextMondayLocal = addWeeks(currentMondayLocal, 1);
    
    const currentMonday = format(currentMondayLocal, 'yyyy-MM-dd');
    const nextMonday = format(nextMondayLocal, 'yyyy-MM-dd');

    // #10: Check has_current_locked per role (global)
    const { data: dfiCurrent } = await supabase
      .from('weekly_plan')
      .select('id')
      .is('org_id', null)
      .eq('role_id', 1)
      .eq('week_start_date', currentMonday)
      .eq('status', 'locked')
      .limit(1);

    const { data: rdaCurrent } = await supabase
      .from('weekly_plan')
      .select('id')
      .is('org_id', null)
      .eq('role_id', 2)
      .eq('week_start_date', currentMonday)
      .eq('status', 'locked')
      .limit(1);

    // #10: Check has_next_proposed per role (global)
    const { data: dfiNext } = await supabase
      .from('weekly_plan')
      .select('id')
      .is('org_id', null)
      .eq('role_id', 1)
      .eq('week_start_date', nextMonday)
      .eq('status', 'proposed')
      .limit(1);

    const { data: rdaNext } = await supabase
      .from('weekly_plan')
      .select('id')
      .is('org_id', null)
      .eq('role_id', 2)
      .eq('week_start_date', nextMonday)
      .eq('status', 'proposed')
      .limit(1);

    return new Response(JSON.stringify({
      ok: true,
      mode: 'progress',
      org_timezone: orgTz,
      enabled: enabledData?.value?.enabled || false,
      gate_open: gateData?.data?.gate_open || false,
      first_location_ready: gateData?.data?.first_location_ready,
      first_dynamic_week_seeded: (seededData?.length || 0) > 0,
      has_current_locked: {
        dfi: (dfiCurrent?.length || 0) > 0,
        rda: (rdaCurrent?.length || 0) > 0
      },
      has_next_proposed: {
        dfi: (dfiNext?.length || 0) > 0,
        rda: (rdaNext?.length || 0) > 0
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    return new Response(JSON.stringify({
      ok: false,
      error: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
