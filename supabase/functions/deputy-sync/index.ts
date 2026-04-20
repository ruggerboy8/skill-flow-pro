import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CALLBACK_URL = 'https://yeypngaufuualdfzcjpk.supabase.co/functions/v1/deputy-oauth-callback';

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Strip professional suffixes so "Alex Otto, DDS" matches "Alex Otto".
 */
function normalizeName(name: string): string {
  return name
    .replace(/,?\s*(DDS|DMD|MD|RDH|RDHA|DA|CDA|OM|OMS)\.?/gi, '')
    .trim()
    .toLowerCase();
}

/**
 * Returns the Monday (UTC) of the week containing `date`.
 */
function getWeekMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getUTCDay(); // 0=Sun, 1=Mon…6=Sat
  const daysToMonday = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + daysToMonday);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/**
 * Refresh Deputy access token using the stored refresh token.
 * Updates the deputy_connections row in place and returns the new access token.
 */
async function refreshDeputyToken(
  connection: Record<string, any>,
  clientId: string,
  clientSecret: string,
  supabase: ReturnType<typeof createClient>
): Promise<string> {
  const cleanInstall = String(connection.deputy_install).replace(/^https?:\/\//i, '').replace(/\.deputy\.com.*$/i, '').replace(/\..*$/, '').trim();
  const cleanRegion = String(connection.deputy_region).replace(/[^a-z0-9-]/gi, '').trim();
  const refreshUrl = `https://${cleanInstall}.${cleanRegion}.deputy.com/oauth/access_token`;

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: CALLBACK_URL,
    grant_type: 'refresh_token',
    refresh_token: connection.refresh_token,
    scope: 'longlife_refresh_token',
  });

  const response = await fetch(refreshUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Deputy token refresh failed (${response.status}): ${errText}`);
  }

  const data = await response.json();
  const tokenExpiresAt = new Date(Date.now() + (data.expires_in ?? 86400) * 1000).toISOString();

  // Persist the new token pair — refresh token rotates on every use
  await (supabase as any)
    .from('deputy_connections')
    .update({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      token_expires_at: tokenExpiresAt,
    } as any)
    .eq('organization_id', connection.organization_id);

  console.log('Deputy token refreshed successfully');
  return data.access_token;
}

// ─── Main handler ────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const deputyClientId = Deno.env.get('DEPUTY_CLIENT_ID');
    const deputyClientSecret = Deno.env.get('DEPUTY_CLIENT_SECRET');

    if (!deputyClientId || !deputyClientSecret) {
      return new Response(
        JSON.stringify({ error: 'Deputy credentials not configured.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── Auth ──────────────────────────────────────────────────────────────────
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

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // ── Verify org admin ──────────────────────────────────────────────────────
    const { data: callerStaff, error: staffError } = await supabase
      .from('staff')
      .select('id, organization_id, is_org_admin, is_super_admin')
      .eq('user_id', user.id)
      .single();

    if (staffError || !callerStaff || (!callerStaff.is_org_admin && !callerStaff.is_super_admin)) {
      return new Response(
        JSON.stringify({ error: 'Access denied. Org admin required.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const orgId = callerStaff.organization_id;

    // ── Parse request body ────────────────────────────────────────────────────
    // Supported params:
    //   week_of: "YYYY-MM-DD"  — sync a specific week (defaults to current week)
    //   dry_run: boolean       — if true (DEFAULT), report what would happen without
    //                            writing any excusal records. Set to false explicitly
    //                            to enable live excusal creation.
    let body: Record<string, any> = {};
    try { body = await req.json(); } catch { /* empty body is fine */ }

    const dryRun: boolean = body.dry_run !== false; // default true

    const targetWeekMonday = body.week_of
      ? getWeekMonday(new Date(body.week_of))
      : getWeekMonday(new Date());

    const weekOfStr = targetWeekMonday.toISOString().split('T')[0]; // "YYYY-MM-DD"
    const nextMonday = new Date(targetWeekMonday);
    nextMonday.setUTCDate(nextMonday.getUTCDate() + 7);

    const startUnix = Math.floor(targetWeekMonday.getTime() / 1000);
    const endUnix = Math.floor(nextMonday.getTime() / 1000);

    console.log(`Deputy sync started — org ${orgId}, week of ${weekOfStr}, dry_run=${dryRun}`);

    // ── Load connection ───────────────────────────────────────────────────────
    const { data: connection, error: connError } = await supabase
      .from('deputy_connections')
      .select('*')
      .eq('organization_id', orgId)
      .single();

    if (connError || !connection) {
      return new Response(
        JSON.stringify({ error: 'No Deputy connection found. Please connect Deputy first.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── Refresh token if expiring within 5 minutes ────────────────────────────
    let accessToken: string = connection.access_token;
    const expiresAt = new Date(connection.token_expires_at).getTime();
    if (expiresAt < Date.now() + 5 * 60 * 1000) {
      console.log('Access token expiring soon — refreshing');
      accessToken = await refreshDeputyToken(connection, deputyClientId, deputyClientSecret, supabase as any);
    }

    const cleanInstall2 = String(connection.deputy_install).replace(/^https?:\/\//i, '').replace(/\.deputy\.com.*$/i, '').replace(/\..*$/, '').trim();
    const cleanRegion2 = String(connection.deputy_region).replace(/[^a-z0-9-]/gi, '').trim();
    const deputyBaseUrl = `https://${cleanInstall2}.${cleanRegion2}.deputy.com`;

    // ── Query Deputy timesheets for the target week ───────────────────────────
    const timesheetRes = await fetch(`${deputyBaseUrl}/api/v1/resource/Timesheet/QUERY`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        search: {
          s1: { field: 'StartTime', data: startUnix, type: 'gt' },
          s2: { field: 'StartTime', data: endUnix, type: 'lt' },
        },
      }),
    });

    if (!timesheetRes.ok) {
      const errText = await timesheetRes.text();
      if (!dryRun) {
        await supabase.from('deputy_connections').update({
          last_sync_at: new Date().toISOString(),
          last_sync_status: 'error',
          last_sync_error: `Timesheet query failed (${timesheetRes.status}): ${errText.slice(0, 500)}`,
        }).eq('organization_id', orgId);
      }
      throw new Error(`Deputy timesheet query failed: ${errText}`);
    }

    const timesheets: any[] = await timesheetRes.json();
    console.log(`Retrieved ${timesheets.length} timesheets from Deputy`);

    // ── Build employee maps ───────────────────────────────────────────────────
    const allSeenEmployees = new Map<number, string>();    // deputyId → displayName
    const employeesWhoWorked = new Set<number>();           // deputyIds

    for (const ts of timesheets) {
      const empId: number = ts.Employee;
      const displayName: string =
        ts._DPMetaData?.EmployeeInfo?.DisplayName ?? `Employee ${empId}`;

      if (!allSeenEmployees.has(empId)) {
        allSeenEmployees.set(empId, displayName);
      }
      if (!ts.Discarded) {
        employeesWhoWorked.add(empId);
      }
    }

    // ── Auto-match new employees ──────────────────────────────────────────────
    const { data: allStaff } = await supabase
      .from('staff')
      .select('id, name')
      .eq('organization_id', orgId)
      .eq('active', true)
      .eq('is_participant', true);

    const staffList = allStaff ?? [];

    let newMappingsCreated = 0;
    for (const [deputyEmpId, displayName] of allSeenEmployees.entries()) {
      const { data: existing } = await supabase
        .from('deputy_employee_mappings')
        .select('id')
        .eq('organization_id', orgId)
        .eq('deputy_employee_id', deputyEmpId)
        .maybeSingle();

      if (!existing) {
        const normalizedDeputy = normalizeName(displayName);
        const matchedStaff = staffList.find(
          (s) => normalizeName(s.name) === normalizedDeputy
        );

        if (!dryRun) {
          await supabase.from('deputy_employee_mappings').insert({
            organization_id: orgId,
            deputy_employee_id: deputyEmpId,
            deputy_display_name: displayName,
            staff_id: matchedStaff?.id ?? null,
            is_confirmed: false,
            is_ignored: false,
          });
        }

        newMappingsCreated++;
        console.log(
          `${dryRun ? '[DRY RUN] Would create' : 'New'} mapping: "${displayName}" → ${
            matchedStaff ? `"${matchedStaff.name}"` : 'unmatched'
          }`
        );
      }
    }

    // ── Compute excusals for absent confirmed staff ───────────────────────────
    const { data: confirmedMappings } = await supabase
      .from('deputy_employee_mappings')
      .select('deputy_employee_id, staff_id, deputy_display_name')
      .eq('organization_id', orgId)
      .eq('is_confirmed', true)
      .eq('is_ignored', false)
      .not('staff_id', 'is', null);

    const mappings = confirmedMappings ?? [];
    const excusalInserts: Record<string, any>[] = [];

    for (const mapping of mappings) {
      if (!employeesWhoWorked.has(mapping.deputy_employee_id)) {
        excusalInserts.push({
          staff_id: mapping.staff_id,
          week_of: weekOfStr,
          metric: 'confidence',
          reason: 'Absent per Deputy attendance data (auto-synced)',
          created_by: null,
        });
        excusalInserts.push({
          staff_id: mapping.staff_id,
          week_of: weekOfStr,
          metric: 'performance',
          reason: 'Absent per Deputy attendance data (auto-synced)',
          created_by: null,
        });
        console.log(`${
          dryRun ? '[DRY RUN] Would excuse' : 'Absent all week'
        }: ${mapping.deputy_display_name}`);
      }
    }

    if (!dryRun && excusalInserts.length > 0) {
      const { error: excusalError } = await supabase
        .from('excused_submissions')
        .upsert(excusalInserts, {
          onConflict: 'staff_id,week_of,metric',
          ignoreDuplicates: true,
        });

      if (excusalError) {
        console.error('Error inserting excusal records:', excusalError);
      }
    }

    // ── Update sync metadata (only on real runs) ──────────────────────────────
    if (!dryRun) {
      await supabase
        .from('deputy_connections')
        .update({
          last_sync_at: new Date().toISOString(),
          last_sync_status: 'success',
          last_sync_error: null,
        })
        .eq('organization_id', orgId);
    }

    const summary = {
      ok: true,
      dry_run: dryRun,
      week_of: weekOfStr,
      timesheets_retrieved: timesheets.length,
      deputy_employees_seen: allSeenEmployees.size,
      employees_who_worked: employeesWhoWorked.size,
      new_mappings_created: dryRun ? 0 : newMappingsCreated,
      new_mappings_would_create: dryRun ? newMappingsCreated : undefined,
      confirmed_mappings_checked: mappings.length,
      staff_absent_all_week: excusalInserts.length / 2,
      excusal_records_created: dryRun ? 0 : excusalInserts.length,
      excusal_records_would_create: dryRun ? excusalInserts.length : undefined,
      note: dryRun
        ? 'DRY RUN — no data was written. Pass dry_run: false to create mappings and excusals.'
        : undefined,
    };

    console.log('Deputy sync complete:', summary);
    return new Response(JSON.stringify(summary), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('Error in deputy-sync:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
