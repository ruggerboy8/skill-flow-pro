import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { format, startOfWeek, addWeeks } from 'https://esm.sh/date-fns@3.6.0';
import { toZonedTime } from 'https://esm.sh/date-fns-tz@3.2.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  try {
    // #2: Verify cron secret if present
    const cronSecret = req.headers.get('x-cron-secret');
    if (cronSecret) {
      const { data: settingsData } = await supabaseAdmin
        .from('app_kv')
        .select('value')
        .eq('key', 'sequencer:cron_secret')
        .single();
      
      if (cronSecret !== settingsData?.value?.secret) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    const body = await req.json().catch(() => ({}));
    const { dryRun = false, roles = [1, 2], asOf, orgId } = body;

    if (!orgId) {
      return new Response(JSON.stringify({ error: 'orgId required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // #5: Check if automation is enabled
    const { data: enabledData } = await supabaseAdmin
      .from('app_kv')
      .select('value')
      .eq('key', 'sequencer:auto_enabled')
      .single();

    if (!enabledData?.value?.enabled) {
      return new Response(JSON.stringify({
        status: 'disabled',
        message: 'Auto-sequencing is disabled'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Get org timezone
    const { data: tzData } = await supabaseAdmin
      .from('app_kv')
      .select('value')
      .eq('key', 'sequencer:org_timezone')
      .single();
    
    const orgTz = tzData?.value?.timezone || 'America/Chicago';

    // #6: Compute dates in org timezone
    const nowUtc = asOf ? new Date(asOf) : new Date();
    const nowLocal = toZonedTime(nowUtc, orgTz);
    
    // Find Monday (start of week) in local timezone
    const currentMondayLocal = startOfWeek(nowLocal, { weekStartsOn: 1 });
    const nextMondayLocal = addWeeks(currentMondayLocal, 1);
    const nplus1MondayLocal = addWeeks(currentMondayLocal, 2);
    
    // Store as DATE strings (no time component)
    const currentMonday = format(currentMondayLocal, 'yyyy-MM-dd');
    const nextMonday = format(nextMondayLocal, 'yyyy-MM-dd');
    const nplus1Monday = format(nplus1MondayLocal, 'yyyy-MM-dd');

    const results = [];

    for (const roleId of roles) {
      // Check progress gate
      const gateData = await supabaseAdmin.rpc('check_sequencer_gate', {
        p_org_id: orgId,
        p_role_id: roleId
      });

      if (!gateData?.data?.gate_open) {
        results.push({
          roleId,
          status: 'waiting_for_first_location',
          message: 'No locations at C3W6 yet'
        });
        continue;
      }

      // #9: Check if this is first run
      const { data: existingRows } = await supabaseAdmin
        .from('weekly_plan')
        .select('id')
        .eq('org_id', orgId)
        .eq('role_id', roleId)
        .limit(1);

      const isFirstRun = !existingRows || existingRows.length === 0;

      if (isFirstRun) {
        // #1: First run mid-week → seed Next + N+1 as PROPOSED only (no lock)
        console.log(`[First Run] Seeding Next (${nextMonday}) and N+1 (${nplus1Monday}) as PROPOSED`);
        
        if (!dryRun) {
          await seedWeek(supabaseAdmin, orgId, roleId, nextMonday, 'proposed', 'auto');
          await seedWeek(supabaseAdmin, orgId, roleId, nplus1Monday, 'proposed', 'auto');
        }

        results.push({
          roleId,
          status: 'first_run_seeded',
          nextWeek: nextMonday,
          nplus1Week: nplus1Monday
        });

        // Log run
        if (!dryRun) {
          await supabaseAdmin.from('sequencer_runs').insert({
            org_id: orgId,
            role_id: roleId,
            target_week_start: nextMonday,
            mode: cronSecret ? 'cron' : 'manual',
            success: true,
            config: { orgTz, dryRun, isFirstRun: true },
            logs: [`First run: seeded ${nextMonday} and ${nplus1Monday}`],
            lock_at_local: `${currentMonday} Mon 00:01 ${orgTz}`
          });
        }
        continue;
      }

      // Ongoing: Lock current week (idempotent)
      const { data: currentRows } = await supabaseAdmin
        .from('weekly_plan')
        .select('*')
        .eq('org_id', orgId)
        .eq('role_id', roleId)
        .eq('week_start_date', currentMonday);

      if (!currentRows || currentRows.length === 0) {
        // No current week exists → generate and lock
        console.log(`[Lock Current] Generating ${currentMonday} as LOCKED`);
        if (!dryRun) {
          await seedWeek(supabaseAdmin, orgId, roleId, currentMonday, 'locked', 'auto');
        }
      } else {
        // Lock existing proposed rows (idempotent, respect overridden)
        const proposedRows = currentRows.filter(r => r.status === 'proposed' && !r.overridden);
        if (proposedRows.length > 0) {
          console.log(`[Lock Current] Locking ${proposedRows.length} proposed rows for ${currentMonday}`);
          if (!dryRun) {
            await supabaseAdmin
              .from('weekly_plan')
              .update({ status: 'locked', locked_at: new Date().toISOString() })
              .eq('org_id', orgId)
              .eq('role_id', roleId)
              .eq('week_start_date', currentMonday)
              .eq('status', 'proposed')
              .eq('overridden', false);
          }
        }
      }

      // Handle next week (respect overrides)
      const { data: nextRows } = await supabaseAdmin
        .from('weekly_plan')
        .select('*')
        .eq('org_id', orgId)
        .eq('role_id', roleId)
        .eq('week_start_date', nextMonday);

      const hasOverride = nextRows?.some(r => r.overridden === true);

      if (!hasOverride) {
        console.log(`[Generate Next] Refreshing ${nextMonday} as PROPOSED`);
        if (!dryRun) {
          await seedWeek(supabaseAdmin, orgId, roleId, nextMonday, 'proposed', 'auto');
        }
      } else {
        console.log(`[Skip Next] ${nextMonday} has manual override, preserving`);
      }

      // Prepare N+1 (always refresh unless overridden)
      const { data: nplus1Rows } = await supabaseAdmin
        .from('weekly_plan')
        .select('*')
        .eq('org_id', orgId)
        .eq('role_id', roleId)
        .eq('week_start_date', nplus1Monday);

      const hasNplus1Override = nplus1Rows?.some(r => r.overridden === true);

      if (!hasNplus1Override) {
        console.log(`[Prepare N+1] Refreshing ${nplus1Monday} as PROPOSED`);
        if (!dryRun) {
          await seedWeek(supabaseAdmin, orgId, roleId, nplus1Monday, 'proposed', 'auto');
        }
      } else {
        console.log(`[Skip N+1] ${nplus1Monday} has manual override, preserving`);
      }

      results.push({
        roleId,
        status: 'success',
        currentWeek: currentMonday,
        nextWeek: nextMonday,
        nplus1Week: nplus1Monday
      });

      // Log run
      if (!dryRun) {
        await supabaseAdmin.from('sequencer_runs').insert({
          org_id: orgId,
          role_id: roleId,
          target_week_start: nextMonday,
          mode: cronSecret ? 'cron' : 'manual',
          success: true,
          config: { orgTz, dryRun },
          logs: [`Processed ${currentMonday} → ${nextMonday} → ${nplus1Monday}`],
          lock_at_local: `${currentMonday} Mon 00:01 ${orgTz}`
        });
      }
    }

    return new Response(JSON.stringify({
      success: true,
      dryRun,
      results
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('[Rollover Error]:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

// Helper: Seed a week by calling sequencer-rank
async function seedWeek(
  supabase: any,
  orgId: string,
  roleId: number,
  weekStart: string,
  status: 'proposed' | 'locked',
  generatedBy: 'auto' | 'manual'
) {
  // Call sequencer-rank to get picks
  const { data: rankData, error: rankError } = await supabase.functions.invoke('sequencer-rank', {
    body: {
      roleId,
      effectiveDate: weekStart
    }
  });

  if (rankError) throw rankError;

  const picks = rankData.next.slice(0, 3);

  // UPSERT rows (idempotent)
  for (let i = 0; i < picks.length; i++) {
    const pick = picks[i];
    await supabase.from('weekly_plan').upsert({
      org_id: orgId,
      role_id: roleId,
      week_start_date: weekStart,
      display_order: i + 1,
      action_id: pick.proMoveId,
      self_select: false,
      status,
      generated_by: generatedBy,
      overridden: false
    }, {
      onConflict: 'org_id,role_id,week_start_date,display_order'
    });
  }
}
