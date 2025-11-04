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

    const { roleId, actionIds } = await req.json() as { roleId: RoleId; actionIds: number[] };

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

    // Delete existing priorities for this coach/role
    await supabase
      .from('manager_priorities')
      .delete()
      .eq('coach_staff_id', staff.id)
      .eq('role_id', roleId);

    // Insert top 5 priorities with rank
    const top5 = actionIds.slice(0, 5);
    const inserts = top5.map((actionId, idx) => ({
      coach_staff_id: staff.id,
      role_id: roleId,
      action_id: actionId,
      weight: 5 - idx, // Higher rank = higher weight
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

    // TODO: Trigger preview recompute (call compute-weekly-plans or similar)
    // For now, the UI will refetch rankings which includes the updated preview

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
