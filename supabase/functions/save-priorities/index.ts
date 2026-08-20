import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.53.0';
import { fetchAlcanInputsForRole } from '../_shared/sequencer-data.ts';
import { computeWeek, advanceInputsForPreview } from '../_shared/sequencer-engine.ts';
import { defaultEngineConfig } from '../_shared/sequencer-config.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization')!;
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response('Unauthorized', { status: 401, headers: corsHeaders });
    }

    // Get staff_id
    const { data: staff } = await supabase
      .from('staff')
      .select('id, is_coach, is_super_admin')
      .eq('user_id', user.id)
      .single();

    if (!staff || (!staff.is_coach && !staff.is_super_admin)) {
      return new Response('Forbidden', { status: 403, headers: corsHeaders });
    }

    const { roleId, priorities } = await req.json();

    // Delete existing priorities for this coach/role
    await supabase
      .from('manager_priorities')
      .delete()
      .eq('coach_staff_id', staff.id)
      .eq('role_id', roleId);

    // Insert new priorities
    if (priorities && priorities.length > 0) {
      const rows = priorities.map((p: any, idx: number) => ({
        coach_staff_id: staff.id,
        role_id: roleId,
        action_id: p.actionId,
        weight: p.weight || 1,
      }));

      const { error } = await supabase.from('manager_priorities').insert(rows);
      if (error) throw error;
    }

    // Recompute preview (N+1)
    const timezone = 'America/Chicago';
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: timezone }));
    
    // Next Monday
    const dayOfWeek = now.getDay();
    const daysToNextMonday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek;
    const nextMonday = new Date(now);
    nextMonday.setDate(now.getDate() + daysToNextMonday);
    nextMonday.setHours(0, 0, 0, 0);
    const previewWeekStart = nextMonday.toISOString().split('T')[0];

    // This Monday
    const thisMonday = new Date(nextMonday);
    thisMonday.setDate(nextMonday.getDate() - 7);
    const weekStart = thisMonday.toISOString().split('T')[0];

    // Cutoff: end of last week
    const cutoff = new Date(thisMonday);
    cutoff.setDate(thisMonday.getDate() - 1);
    cutoff.setHours(23, 59, 59, 999);

    // Fetch inputs
    const inputs = await fetchAlcanInputsForRole({
      role: roleId,
      effectiveDate: cutoff,
      timezone,
      cutoff,
    });

    // Get locked N plan
    const { data: lockedPlan } = await supabase
      .from('alcan_weekly_plan')
      .select('*')
      .eq('week_start', weekStart)
      .eq('role_id', roleId)
      .eq('status', 'locked')
      .single();

    if (!lockedPlan) {
      return new Response('No locked plan found for this week', { 
        status: 400, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    // Simulate locked week as a WeekPlan
    const lockedWeekPlan = {
      weekStart,
      picks: lockedPlan.action_ids.map((id: number) => ({ proMoveId: id, domainId: 0 })),
      logs: lockedPlan.logs || [],
    };

    // Advance inputs
    const previewInputs = advanceInputsForPreview(inputs, lockedWeekPlan);

    // Load all manager priorities (not just this coach)
    const { data: allPriorities } = await supabase
      .from('manager_priorities')
      .select('action_id, weight')
      .eq('role_id', roleId);

    const priorityMap = new Map((allPriorities || []).map(p => [p.action_id, p.weight]));
    const previewInputsWithPriorities = { ...previewInputs, managerPriorities: priorityMap };

    // Recompute preview
    const preview = computeWeek(previewInputsWithPriorities, defaultEngineConfig, previewWeekStart);

    // Upsert preview
    const serviceClient = createClient(
      supabaseUrl, 
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );
    
    await serviceClient
      .from('alcan_weekly_plan')
      .upsert({
        week_start: previewWeekStart,
        role_id: roleId,
        status: 'draft',
        action_ids: preview.picks.map(p => p.proMoveId),
        logs: preview.logs,
        engine_config: defaultEngineConfig,
        computed_at: new Date().toISOString(),
        computed_by: user.id,
      }, {
        onConflict: 'week_start,role_id',
      });

    return new Response(
      JSON.stringify({ success: true, preview }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error saving priorities:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
