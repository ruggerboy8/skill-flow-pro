import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.53.0';
import { corsHeaders } from '../_shared/cors.ts';
import type { RoleId } from '../_shared/sequencer-types.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get staff record
    const { data: staff, error: staffError } = await supabase
      .from('staff')
      .select('id, is_coach, is_super_admin')
      .eq('user_id', user.id)
      .single();

    if (staffError || !staff) {
      return new Response(JSON.stringify({ error: 'Staff record not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!staff.is_coach && !staff.is_super_admin) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { roleId, actionIds, simulation } = await req.json() as { roleId: RoleId; actionIds: number[]; simulation?: boolean };

    if (![1, 2].includes(roleId)) {
      return new Response(JSON.stringify({ error: 'Invalid roleId' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!Array.isArray(actionIds) || actionIds.length === 0) {
      return new Response(JSON.stringify({ error: 'Invalid actionIds' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (simulation) {
      // Simulation mode: store priorities in KV
      const top5 = actionIds.slice(0, 5);
      await supabase
        .from('app_kv')
        .upsert({
          key: `sim:priorities:user:${user.id}:role:${roleId}`,
          value: { actionIds: top5, savedAt: new Date().toISOString() },
          updated_at: new Date().toISOString(),
        });

      // Recompute simulation nextWeek with updated priorities
      // Load simulation inputs
      const { data: inputsData } = await supabase
        .from('app_kv')
        .select('value')
        .eq('key', `sim:inputs:role:${roleId}`)
        .single();

      if (inputsData) {
        // Re-run engine with updated priorities (simplified: just reload for now)
        // In full implementation, merge priority weights into inputs.managerPriorities
        // and recompute. For now, the UI refetch will show updated state.
      }
    } else {
      // Production mode: write to manager_priorities table
      await supabase
        .from('manager_priorities')
        .delete()
        .eq('coach_staff_id', staff.id)
        .eq('role_id', roleId);

      const top5 = actionIds.slice(0, 5);
      const inserts = top5.map((actionId, idx) => ({
        coach_staff_id: staff.id,
        role_id: roleId,
        action_id: actionId,
        weight: 5 - idx,
      }));

      const { error: insertError } = await supabase
        .from('manager_priorities')
        .insert(inserts);

      if (insertError) {
        console.error('Insert error:', insertError);
        return new Response(JSON.stringify({ error: insertError.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('Error in manager-priorities-save:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
