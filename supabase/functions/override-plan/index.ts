import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.53.0';

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
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // Check auth with anon key
    const anonClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    
    const { data: { user } } = await anonClient.auth.getUser();
    if (!user) {
      return new Response('Unauthorized', { status: 401, headers: corsHeaders });
    }

    // Check super admin
    const { data: staff } = await supabase
      .from('staff')
      .select('is_super_admin')
      .eq('user_id', user.id)
      .single();

    if (!staff?.is_super_admin) {
      return new Response('Forbidden: Super admin required', { 
        status: 403, 
        headers: corsHeaders 
      });
    }

    const { weekStart, roleId, actionIds } = await req.json();

    if (!weekStart || !roleId || !actionIds || actionIds.length !== 3) {
      return new Response('Invalid request', { status: 400, headers: corsHeaders });
    }

    // Get existing plan
    const { data: existingPlan } = await supabase
      .from('alcan_weekly_plan')
      .select('*')
      .eq('week_start', weekStart)
      .eq('role_id', roleId)
      .single();

    if (!existingPlan) {
      return new Response('Plan not found', { status: 404, headers: corsHeaders });
    }

    // Add override log
    const logs = existingPlan.logs || [];
    logs.push(`OVERRIDE by ${user.email} at ${new Date().toISOString()}`);

    // Update plan
    const { error } = await supabase
      .from('alcan_weekly_plan')
      .update({
        action_ids: actionIds,
        logs,
        updated_at: new Date().toISOString(),
      })
      .eq('week_start', weekStart)
      .eq('role_id', roleId);

    if (error) throw error;

    // If this is the locked week, re-expand to weekly_focus
    if (existingPlan.status === 'locked') {
      // Delete existing weekly_focus for this week/role
      await supabase
        .from('weekly_focus')
        .delete()
        .eq('role_id', roleId)
        .match({ cycle: 0, week_in_cycle: 0 });

      // Get all locations
      const { data: locations } = await supabase
        .from('locations')
        .select('id')
        .eq('active', true);

      if (locations) {
        const rows = locations.flatMap((loc) =>
          actionIds.map((actionId: number, order: number) => ({
            cycle: 0,
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
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error overriding plan:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
