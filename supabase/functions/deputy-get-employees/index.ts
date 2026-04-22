// Deputy — Phase 1 helper.
//
// Returns the org's Deputy roster (active first, then inactive) so the
// mapping UI can populate its dropdown WITHOUT touching timesheet data.
// Read-only: never writes to the DB.
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

const CALLBACK_URL = 'https://yeypngaufuualdfzcjpk.supabase.co/functions/v1/deputy-oauth-callback';

function cleanInstall(s: string) {
  return String(s).replace(/^https?:\/\//i, '').replace(/\.deputy\.com.*$/i, '').replace(/\..*$/, '').trim();
}
function cleanRegion(s: string) {
  return String(s).replace(/[^a-z0-9-]/gi, '').trim();
}

async function refreshToken(
  conn: any,
  baseUrl: string,
  clientId: string,
  clientSecret: string,
  admin: ReturnType<typeof createClient>,
  orgId: string
): Promise<string> {
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: CALLBACK_URL,
    grant_type: 'refresh_token',
    refresh_token: conn.refresh_token,
    scope: 'longlife_refresh_token',
  });
  const r = await fetch(`${baseUrl}/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`Deputy token refresh failed (${r.status}): ${t.slice(0, 300)}`);
  }
  const d = await r.json();
  const expiresAt = new Date(Date.now() + (d.expires_in ?? 86400) * 1000).toISOString();
  await (admin as any)
    .from('deputy_connections')
    .update({
      access_token: d.access_token,
      refresh_token: d.refresh_token ?? conn.refresh_token,
      token_expires_at: expiresAt,
    })
    .eq('organization_id', orgId);
  return d.access_token;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
    const svc = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const clientId = Deno.env.get('DEPUTY_CLIENT_ID');
    const clientSecret = Deno.env.get('DEPUTY_CLIENT_SECRET');
    if (!clientId || !clientSecret) return json(500, { ok: false, error: 'Deputy credentials not configured' });

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json(401, { ok: false, error: 'Missing authorization header' });

    const userClient = createClient(supabaseUrl, anon);
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authErr } = await userClient.auth.getUser(token);
    if (authErr || !user) return json(401, { ok: false, error: 'Unauthorized' });

    const admin = createClient(supabaseUrl, svc);

    const { data: staffRows, error: sErr } = await admin
      .from('staff')
      .select('id, organization_id, is_org_admin, is_super_admin')
      .eq('user_id', user.id);
    if (sErr) return json(500, { ok: false, error: `Staff lookup failed: ${sErr.message}` });
    if (!staffRows?.length) return json(403, { ok: false, error: 'Staff record not found' });

    const caller =
      staffRows.find((s: any) => s.is_super_admin && s.organization_id) ??
      staffRows.find((s: any) => s.is_org_admin && s.organization_id) ??
      staffRows.find((s: any) => s.organization_id) ??
      staffRows[0];
    if ((!caller.is_org_admin && !caller.is_super_admin) || !caller.organization_id) {
      return json(403, { ok: false, error: 'Org admin required' });
    }

    const orgId = caller.organization_id as string;

    const { data: conn, error: cErr } = await admin
      .from('deputy_connections')
      .select('access_token, refresh_token, token_expires_at, deputy_install, deputy_region')
      .eq('organization_id', orgId)
      .maybeSingle();
    if (cErr) return json(500, { ok: false, error: `DB error: ${cErr.message}` });
    if (!conn) return json(404, { ok: false, error: 'No Deputy connection. Connect first.' });

    const baseUrl = `https://${cleanInstall((conn as any).deputy_install)}.${cleanRegion((conn as any).deputy_region)}.deputy.com`;

    let accessToken = (conn as any).access_token as string;
    const expMs = new Date((conn as any).token_expires_at).getTime();
    if (Date.now() > expMs - 60_000) {
      accessToken = await refreshToken(conn, baseUrl, clientId, clientSecret, admin, orgId);
    }

    // Fetch ALL employees (active and inactive). Sort active first so the
    // dropdown is mostly clean but recently-terminated folks remain mappable.
    const empRes = await fetch(`${baseUrl}/api/v1/resource/Employee/QUERY`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ search: {}, max: 500 }),
    });
    if (!empRes.ok) {
      const t = await empRes.text();
      return json(502, { ok: false, step: 'employee_query', status: empRes.status, error: t.slice(0, 500) });
    }
    const employees: any[] = await empRes.json();

    const out = employees.map((e: any) => {
      const id: number = e.Id;
      const displayName: string =
        (e.DisplayName ?? `${e.FirstName ?? ''} ${e.LastName ?? ''}`.trim()) || `Employee ${id}`;
      return {
        deputy_employee_id: id,
        display_name: displayName,
        first_name: e.FirstName ?? null,
        last_name: e.LastName ?? null,
        email: e.Email ?? e.UserEmail ?? null,
        active: e.Active === true || e.Active === 1,
      };
    });

    out.sort((a, b) => {
      if (a.active !== b.active) return a.active ? -1 : 1;
      return a.display_name.localeCompare(b.display_name);
    });

    return json(200, {
      ok: true,
      employees: out,
      total: out.length,
      active_count: out.filter((e) => e.active).length,
    });
  } catch (err: any) {
    console.error('deputy-get-employees error:', err);
    return json(500, { ok: false, error: err?.message ?? 'Unexpected error' });
  }
});
