import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CALLBACK_URL = 'https://yeypngaufuualdfzcjpk.supabase.co/functions/v1/deputy-oauth-callback';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const deputyClientId = Deno.env.get('DEPUTY_CLIENT_ID');

    if (!deputyClientId) {
      return new Response(
        JSON.stringify({ error: 'Deputy not configured. Add DEPUTY_CLIENT_ID to env vars.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify JWT
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey);
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify org admin
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { data: staff, error: staffError } = await supabase
      .from('staff')
      .select('id, organization_id, is_org_admin, is_super_admin')
      .eq('user_id', user.id)
      .single();

    if (staffError || !staff || (!staff.is_org_admin && !staff.is_super_admin)) {
      return new Response(
        JSON.stringify({ error: 'Access denied. Org admin required.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Encode org_id and staff_id in state for CSRF protection and attribution
    const state = btoa(JSON.stringify({
      org_id: staff.organization_id,
      staff_id: staff.id,
    }));

    const params = new URLSearchParams({
      client_id: deputyClientId,
      redirect_uri: CALLBACK_URL,
      response_type: 'code',
      scope: 'longlife_refresh_token',
      state,
    });

    // Single-install app: use the install-specific OAuth login URL
    const deputyInstall = Deno.env.get('DEPUTY_INSTALL') || 'd2215826013715';
    const deputyRegion = Deno.env.get('DEPUTY_REGION') || 'na';
    const oauthUrl = `https://${deputyInstall}.${deputyRegion}.deputy.com/my/oauth/login?${params.toString()}`;

    console.log(`Deputy OAuth initiated for org ${staff.organization_id} by staff ${staff.id}`);

    return new Response(
      JSON.stringify({ url: oauthUrl }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Error in deputy-initiate-oauth:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
