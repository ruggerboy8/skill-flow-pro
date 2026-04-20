import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Auth
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json(401, { ok: false, error: 'Missing authorization header' });

    const userClient = createClient(supabaseUrl, supabaseAnonKey);
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await userClient.auth.getUser(token);
    if (authError || !user) return json(401, { ok: false, error: 'Unauthorized' });

    const admin = createClient(supabaseUrl, supabaseServiceKey);

    // Verify org admin and get organization_id
    const { data: staff, error: staffError } = await admin
      .from('staff')
      .select('id, organization_id, is_org_admin, is_super_admin')
      .eq('user_id', user.id)
      .single();

    if (staffError || !staff) return json(403, { ok: false, error: 'Staff record not found' });
    if (!staff.is_org_admin && !staff.is_super_admin) {
      return json(403, { ok: false, error: 'Org admin required' });
    }
    if (!staff.organization_id) {
      return json(400, { ok: false, error: 'No organization linked to your staff record' });
    }

    // Load Deputy connection
    const { data: connection, error: connError } = await admin
      .from('deputy_connections')
      .select('access_token, refresh_token, token_expires_at, deputy_install, deputy_region')
      .eq('organization_id', staff.organization_id)
      .maybeSingle();

    if (connError) return json(500, { ok: false, error: `DB error: ${connError.message}` });
    if (!connection) return json(404, { ok: false, error: 'No Deputy connection found. Connect first.' });

    const baseUrl = `https://${connection.deputy_install}.${connection.deputy_region}.deputy.com`;

    // Refresh token if expired or near expiry (within 60s)
    let accessToken = connection.access_token;
    const expiresAt = new Date(connection.token_expires_at).getTime();
    if (Date.now() > expiresAt - 60_000) {
      const clientId = Deno.env.get('DEPUTY_CLIENT_ID');
      const clientSecret = Deno.env.get('DEPUTY_CLIENT_SECRET');
      if (!clientId || !clientSecret) {
        return json(500, { ok: false, error: 'Deputy credentials not configured' });
      }
      const refreshBody = new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
        refresh_token: connection.refresh_token,
        scope: 'longlife_refresh_token',
      });
      const refreshResp = await fetch(`${baseUrl}/oauth/access_token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: refreshBody.toString(),
      });
      if (!refreshResp.ok) {
        const errText = await refreshResp.text();
        return json(502, {
          ok: false,
          step: 'refresh_token',
          status: refreshResp.status,
          error: errText.slice(0, 500),
        });
      }
      const refreshData = await refreshResp.json();
      accessToken = refreshData.access_token ?? accessToken;
      const newExpires = new Date(Date.now() + (refreshData.expires_in ?? 86400) * 1000).toISOString();
      await admin
        .from('deputy_connections')
        .update({
          access_token: accessToken,
          refresh_token: refreshData.refresh_token ?? connection.refresh_token,
          token_expires_at: newExpires,
        })
        .eq('organization_id', staff.organization_id);
    }

    // Call Deputy /api/v1/me to verify the token
    // Deputy OAuth 2.0 access tokens use the standard Bearer scheme
    const meResp = await fetch(`${baseUrl}/api/v1/me`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    });

    const bodyText = await meResp.text();
    if (!meResp.ok) {
      // Return 200 so the frontend receives the JSON body (not a FunctionsHttpError)
      return json(200, {
        ok: false,
        step: 'api_call',
        status: meResp.status,
        endpoint: `${baseUrl}/api/v1/me`,
        error: bodyText.slice(0, 500),
      });
    }

    let me: any = null;
    try { me = JSON.parse(bodyText); } catch { /* ignore */ }

    // Also pull a single employee record as a real "data pull" sanity check
    const empResp = await fetch(`${baseUrl}/api/v1/resource/Employee/QUERY`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ search: {}, max: 1 }),
    });

    const empText = await empResp.text();
    let employeeSample: any = null;
    if (empResp.ok) {
      try {
        const arr = JSON.parse(empText);
        const first = Array.isArray(arr) ? arr[0] : null;
        if (first) {
          employeeSample = {
            id: first.Id,
            display_name: first.DisplayName,
            first_name: first.FirstName,
            last_name: first.LastName,
            active: first.Active,
          };
        }
      } catch { /* ignore */ }
    }

    return json(200, {
      ok: true,
      deputy_install: `${connection.deputy_install}.${connection.deputy_region}.deputy.com`,
      me: me ? {
        id: me.Id,
        display_name: me.DisplayName ?? me.Name,
        email: me.Email,
        company: me.Company,
      } : null,
      employee_sample: employeeSample,
      employee_query_status: empResp.status,
      employee_query_error: empResp.ok ? null : empText.slice(0, 300),
    });
  } catch (err: any) {
    console.error('deputy-test-connection error:', err);
    return json(500, { ok: false, error: err?.message ?? 'Unexpected error' });
  }
});
