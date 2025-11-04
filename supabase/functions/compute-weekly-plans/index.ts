import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.53.0';
import { fetchAlcanInputsForRole } from '../_shared/sequencer-data.ts';
import { computeWeek, advanceInputsForPreview } from '../_shared/sequencer-engine.ts';
import { defaultEngineConfig } from '../_shared/sequencer-config.ts';
import type { OrgInputs, WeekPlan } from '../_shared/sequencer-types.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { runDate } = await req.json().catch(() => ({}));
    
    // Compute in America/Chicago timezone
    const timezone = 'America/Chicago';
    const now = new Date(runDate || new Date().toLocaleString('en-US', { timeZone: timezone }));
    
    // Get this Monday (week_start)
    const dayOfWeek = now.getDay();
    const daysToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(now);
    monday.setDate(now.getDate() + daysToMonday);
    monday.setHours(0, 0, 0, 0);
    const weekStart = monday.toISOString().split('T')[0];
    
    // Next Monday (preview)
    const nextMonday = new Date(monday);
    nextMonday.setDate(monday.getDate() + 7);
    const previewWeekStart = nextMonday.toISOString().split('T')[0];
    
    // Cutoff: exclude current week (up to last Sunday 23:59:59 CT)
    const cutoff = new Date(monday);
    cutoff.setDate(monday.getDate() - 1);
    cutoff.setHours(23, 59, 59, 999);
    const effectiveDate = cutoff;

    const results: { locked?: WeekPlan; preview?: WeekPlan }[] = [];

    // Process both roles
    for (const roleId of [1, 2] as const) {
      console.log(`Computing plans for role ${roleId}`);
      
      // Fetch Alcan-wide inputs (no org filter, with cutoff)
      const inputs: OrgInputs = await fetchAlcanInputsForRole({
        role: roleId,
        effectiveDate,
        timezone,
        cutoff,
      });

      // Compute N (this week, locked)
      const locked = computeWeek(inputs, defaultEngineConfig, weekStart);
      
      // Upsert locked plan
      const { error: lockedError } = await supabase
        .from('alcan_weekly_plan')
        .upsert({
          week_start: weekStart,
          role_id: roleId,
          status: 'locked',
          action_ids: locked.picks.map(p => p.proMoveId),
          logs: locked.logs,
          engine_config: defaultEngineConfig,
          computed_at: new Date().toISOString(),
          computed_by: null, // system
        }, {
          onConflict: 'week_start,role_id',
        });

      if (lockedError) {
        console.error('Failed to upsert locked plan:', lockedError);
        throw lockedError;
      }

      // Expand to weekly_focus for all locations
      await expandToWeeklyFocus(supabase, weekStart, roleId, locked.picks.map(p => p.proMoveId));

      // Compute N+1 (preview, draft)
      const previewInputs = advanceInputsForPreview(inputs, locked);
      
      // Load manager priorities for preview
      const { data: priorities } = await supabase
        .from('manager_priorities')
        .select('action_id, weight')
        .eq('role_id', roleId);
      
      const priorityMap = new Map((priorities || []).map(p => [p.action_id, p.weight]));
      const previewInputsWithPriorities = { ...previewInputs, managerPriorities: priorityMap };
      
      const preview = computeWeek(previewInputsWithPriorities, defaultEngineConfig, previewWeekStart);

      // Upsert preview plan
      const { error: previewError } = await supabase
        .from('alcan_weekly_plan')
        .upsert({
          week_start: previewWeekStart,
          role_id: roleId,
          status: 'draft',
          action_ids: preview.picks.map(p => p.proMoveId),
          logs: preview.logs,
          engine_config: defaultEngineConfig,
          computed_at: new Date().toISOString(),
          computed_by: null,
        }, {
          onConflict: 'week_start,role_id',
        });

      if (previewError) {
        console.error('Failed to upsert preview plan:', previewError);
        throw previewError;
      }

      results.push({ locked, preview });
    }

    return new Response(
      JSON.stringify({ success: true, results, weekStart, previewWeekStart }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error computing weekly plans:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function expandToWeeklyFocus(
  supabase: any,
  weekStart: string,
  roleId: number,
  actionIds: number[]
) {
  // Get all locations
  const { data: locations } = await supabase
    .from('locations')
    .select('id')
    .eq('active', true);

  if (!locations) return;

  // Delete existing weekly_focus for this week/role across all locations
  await supabase
    .from('weekly_focus')
    .delete()
    .eq('role_id', roleId)
    .match({ cycle: 0, week_in_cycle: 0 }); // Placeholder; adjust if tracking cycle/week differently

  // Insert new weekly_focus rows
  const rows = locations.flatMap((loc, idx) =>
    actionIds.map((actionId, order) => ({
      cycle: 0, // Alcan-wide uses week_start instead
      week_in_cycle: 0,
      role_id: roleId,
      action_id: actionId,
      display_order: order + 1,
      self_select: false,
      universal: true,
    }))
  );

  await supabase.from('weekly_focus').insert(rows);
}
