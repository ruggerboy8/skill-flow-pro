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
 * Token-overlap (Jaccard) similarity between two normalized names.
 */
function nameSimilarity(a: string, b: string): number {
  const ta = new Set(normalizeName(a).split(/\s+/).filter(Boolean));
  const tb = new Set(normalizeName(b).split(/\s+/).filter(Boolean));
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  const union = new Set([...ta, ...tb]).size;
  return inter / union;
}

/**
 * Find the best staff match for a Deputy display name.
 * Returns exact match if available, otherwise top-scoring fuzzy match above threshold.
 */
function suggestStaffMatch(
  deputyName: string,
  staffList: Array<{ id: string; name: string }>,
  threshold = 0.6
): { id: string; name: string } | null {
  const normDeputy = normalizeName(deputyName);
  const exact = staffList.find((s) => normalizeName(s.name) === normDeputy);
  if (exact) return exact;

  let best: { id: string; name: string } | null = null;
  let bestScore = 0;
  for (const s of staffList) {
    const score = nameSimilarity(deputyName, s.name);
    if (score > bestScore) {
      bestScore = score;
      best = s;
    }
  }
  return bestScore >= threshold ? best : null;
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

    // NOTE: a single auth user can have multiple staff rows (super-admin who
    // also belongs to a partner org). Pick the row with admin rights + org_id,
    // prioritising super_admin > org_admin > any.
    const { data: staffRows, error: staffError } = await supabase
      .from('staff')
      .select('id, organization_id, is_org_admin, is_super_admin')
      .eq('user_id', user.id);

    if (staffError) {
      return new Response(
        JSON.stringify({ error: `Staff lookup failed: ${staffError.message}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    if (!staffRows || staffRows.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Staff record not found for this user.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const callerStaff =
      staffRows.find((s: any) => s.is_super_admin && s.organization_id) ??
      staffRows.find((s: any) => s.is_org_admin && s.organization_id) ??
      staffRows.find((s: any) => s.organization_id) ??
      staffRows[0];

    if ((!callerStaff.is_org_admin && !callerStaff.is_super_admin) || !callerStaff.organization_id) {
      return new Response(
        JSON.stringify({ error: 'Access denied. Org admin required.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const orgId = callerStaff.organization_id;

    // ── Parse request body ────────────────────────────────────────────────────
    // Supported params:
    //   week_of: "YYYY-MM-DD"   — sync a specific week (defaults to current week)
    //   dry_run: boolean        — if true (DEFAULT), report without writing.
    //   employees_only: boolean — if true, only import employee mappings; skip
    //                              timesheet processing and excusal writes.
    //   days: number            — preview window in days (default 7); only used
    //                              when dry_run is true.
    let body: Record<string, any> = {};
    try { body = await req.json(); } catch { /* empty body is fine */ }

    const dryRun: boolean = body.dry_run !== false; // default true
    const employeesOnly: boolean = body.employees_only === true;
    const previewDays: number = Math.max(1, Math.min(31, Number(body.days ?? 7)));

    const targetWeekMonday = body.week_of
      ? getWeekMonday(new Date(body.week_of))
      : getWeekMonday(new Date());

    const weekOfStr = targetWeekMonday.toISOString().split('T')[0];
    const nextMonday = new Date(targetWeekMonday);
    nextMonday.setUTCDate(nextMonday.getUTCDate() + 7);

    // For dry-run preview: use a rolling N-day window ending now.
    // For real sync: use the target week (Mon..Mon).
    const windowStart = dryRun
      ? new Date(Date.now() - previewDays * 24 * 60 * 60 * 1000)
      : targetWeekMonday;
    const windowEnd = dryRun ? new Date() : nextMonday;

    const startUnix = Math.floor(windowStart.getTime() / 1000);
    const endUnix = Math.floor(windowEnd.getTime() / 1000);

    console.log(
      `Deputy sync — org ${orgId}, dry_run=${dryRun}, employees_only=${employeesOnly}, ` +
      `window=${windowStart.toISOString()}..${windowEnd.toISOString()}`
    );

    // ── Load connection ───────────────────────────────────────────────────────
    const { data: connection, error: connError } = await supabase
      .from('deputy_connections')
      .select('*')
      .eq('organization_id', orgId)
      .maybeSingle();

    if (connError) {
      return new Response(
        JSON.stringify({ error: `Connection lookup failed: ${connError.message}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    if (!connection) {
      return new Response(
        JSON.stringify({ error: 'No Deputy connection found. Please connect Deputy first.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── Go-live gating: block real sync when toggle is off ────────────────────
    if (!dryRun && !employeesOnly && !(connection as any).sync_enabled) {
      return new Response(
        JSON.stringify({
          ok: false,
          skipped: true,
          reason: 'sync_disabled',
          message: 'Sync is disabled for this organization. Enable it in the Sync Settings before running a live sync.',
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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

    // ── Load org staff (used for matching in all flows) ──────────────────────
    const { data: allStaff } = await supabase
      .from('staff')
      .select('id, name')
      .eq('organization_id', orgId)
      .eq('active', true)
      .eq('is_participant', true);
    const staffList = (allStaff ?? []) as Array<{ id: string; name: string }>;

    // ─────────────────────────────────────────────────────────────────────────
    // EMPLOYEES-ONLY FLOW: pull roster, write/refresh mappings with suggestions
    // ─────────────────────────────────────────────────────────────────────────
    if (employeesOnly) {
      const empRes = await fetch(`${deputyBaseUrl}/api/v1/resource/Employee/QUERY`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          search: { s1: { field: 'Active', data: true, type: 'eq' } },
        }),
      });

      if (!empRes.ok) {
        const errText = await empRes.text();
        throw new Error(`Deputy employee query failed (${empRes.status}): ${errText}`);
      }

      const employees: any[] = await empRes.json();

      let createdCount = 0;
      let suggestedCount = 0;
      const employeeSample: any[] = [];

      for (const emp of employees) {
        const empId: number = emp.Id;
        const displayName: string = (emp.DisplayName ?? `${emp.FirstName ?? ''} ${emp.LastName ?? ''}`.trim()) || `Employee ${empId}`;

        if (employeeSample.length < 5) {
          employeeSample.push({ id: empId, display_name: displayName, active: !!emp.Active });
        }

        const { data: existing } = await supabase
          .from('deputy_employee_mappings')
          .select('id, staff_id, is_confirmed')
          .eq('organization_id', orgId)
          .eq('deputy_employee_id', empId)
          .maybeSingle();

        if (!existing) {
          const suggested = suggestStaffMatch(displayName, staffList);
          if (suggested) suggestedCount++;
          createdCount++;
          if (!dryRun) {
            await supabase.from('deputy_employee_mappings').insert({
              organization_id: orgId,
              deputy_employee_id: empId,
              deputy_display_name: displayName,
              staff_id: suggested?.id ?? null,
              is_confirmed: false,
              is_ignored: false,
            });
          }
        }
      }

      return new Response(JSON.stringify({
        ok: true,
        employees_only: true,
        dry_run: dryRun,
        employee_count: employees.length,
        new_mappings_created: dryRun ? 0 : createdCount,
        new_mappings_would_create: dryRun ? createdCount : undefined,
        auto_suggested: suggestedCount,
        employee_sample: employeeSample,
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TIMESHEET FLOW (preview or real sync)
    // ─────────────────────────────────────────────────────────────────────────
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

    // ── Per-employee day-of-week aggregation ─────────────────────────────────
    // For each Deputy employee, collect the set of weekdays (1=Mon..5=Fri, UTC)
    // on which they have at least one NON-DISCARDED timesheet within the
    // sync window. We use this to determine per-metric excusal eligibility:
    //   - Confidence excused → no overlap with {Mon, Tue, Wed}
    //   - Performance excused → no overlap with {Thu, Fri}
    //     EXCEPT Friday-only ({5}) → "expected_extended_deadline", NOT excused
    //   - Both excused → daysWorked is empty (absent all week)
    const allSeenEmployees = new Map<number, string>();
    const daysWorkedByEmployee = new Map<number, Set<number>>();
    const timesheetSample: any[] = [];
    const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    for (const ts of timesheets) {
      const empId: number = ts.Employee;
      const displayName: string =
        ts._DPMetaData?.EmployeeInfo?.DisplayName ?? `Employee ${empId}`;

      if (!allSeenEmployees.has(empId)) {
        allSeenEmployees.set(empId, displayName);
      }

      if (!ts.Discarded && ts.StartTime) {
        const dow = new Date(ts.StartTime * 1000).getUTCDay(); // 0=Sun..6=Sat
        if (dow >= 1 && dow <= 5) {
          if (!daysWorkedByEmployee.has(empId)) {
            daysWorkedByEmployee.set(empId, new Set<number>());
          }
          daysWorkedByEmployee.get(empId)!.add(dow);
        }
      }

      if (timesheetSample.length < 5) {
        const start = ts.StartTime ? new Date(ts.StartTime * 1000).toISOString() : null;
        const end = ts.EndTime ? new Date(ts.EndTime * 1000).toISOString() : null;
        const totalHours = ts.TotalTime != null ? Number(ts.TotalTime) : null;
        timesheetSample.push({
          employee_id: empId,
          employee_name: displayName,
          start,
          end,
          total_hours: totalHours,
          day_of_week: ts.StartTime ? DAY_LABELS[new Date(ts.StartTime * 1000).getUTCDay()] : null,
          discarded: !!ts.Discarded,
        });
      }
    }

    // ── Compute per-mapping decisions ────────────────────────────────────────
    // Decision matrix per the confirmed rules:
    //
    //   daysWorked        | confidence            | performance
    //   ------------------|-----------------------|------------------------------
    //   ∅ (absent)        | excused               | excused
    //   {5} (Fri only)    | excused               | expected_extended_deadline
    //   any incl Mon/Tue/Wed | expected           | (depends on Thu/Fri)
    //   any incl Thu/Fri  | (depends on M/T/W)    | expected
    //
    // For dry-run preview: include ALL mappings with a staff_id (regardless of
    // confirmation) so admins can see what WILL happen once they confirm.
    // For real sync: only confirmed, non-ignored mappings produce excusals.
    const mappingsQuery = supabase
      .from('deputy_employee_mappings')
      .select('deputy_employee_id, staff_id, deputy_display_name, is_confirmed, is_ignored')
      .eq('organization_id', orgId)
      .not('staff_id', 'is', null);

    const { data: mappingRows } = dryRun
      ? await mappingsQuery
      : await mappingsQuery.eq('is_confirmed', true).eq('is_ignored', false);

    const mappings = (mappingRows ?? []) as any[];

    const syncStartDate: string | null = (connection as any).sync_start_date ?? null;
    const beforeStartFloor = !dryRun && syncStartDate
      ? syncStartDate > weekOfStr // YYYY-MM-DD string compare is safe
      : false;

    type EmpDecision = {
      deputy_employee_id: number;
      deputy_name: string;
      sfp_staff_id: string;
      days_worked: string[];
      confidence: 'expected' | 'excused';
      performance: 'expected' | 'excused' | 'expected_extended_deadline';
      is_confirmed: boolean;
    };

    const details: EmpDecision[] = [];
    const excusalInserts: Record<string, any>[] = [];
    let absentCount = 0;
    let fridayExtensionCount = 0;
    let confidenceExcusedCount = 0;
    let performanceExcusedCount = 0;

    for (const mapping of mappings) {
      const days = daysWorkedByEmployee.get(mapping.deputy_employee_id) ?? new Set<number>();
      const hasMonTueWed = days.has(1) || days.has(2) || days.has(3);
      const hasThuFri = days.has(4) || days.has(5);
      const isFridayOnly = days.size === 1 && days.has(5);

      const confidence: 'expected' | 'excused' = hasMonTueWed ? 'expected' : 'excused';
      let performance: 'expected' | 'excused' | 'expected_extended_deadline';
      if (hasThuFri && !isFridayOnly) performance = 'expected';
      else if (isFridayOnly) performance = 'expected_extended_deadline';
      else performance = 'excused';

      if (days.size === 0) absentCount++;
      if (isFridayOnly) fridayExtensionCount++;
      if (confidence === 'excused') confidenceExcusedCount++;
      if (performance === 'excused') performanceExcusedCount++;

      details.push({
        deputy_employee_id: mapping.deputy_employee_id,
        deputy_name: mapping.deputy_display_name,
        sfp_staff_id: mapping.staff_id,
        days_worked: Array.from(days).sort().map((d) => DAY_LABELS[d]),
        confidence,
        performance,
        is_confirmed: !!mapping.is_confirmed,
      });

      // Only WRITE excusals on real sync, for confirmed mappings, and only
      // when we're in/after the sync_start_date floor. The "extended deadline"
      // case is intentionally NOT written — it's a deadline adjustment, not
      // an excusal. (Display/sequencer handling is a Phase-2 concern.)
      if (!dryRun && mapping.is_confirmed && !mapping.is_ignored && !beforeStartFloor) {
        if (confidence === 'excused') {
          excusalInserts.push({
            staff_id: mapping.staff_id,
            week_of: weekOfStr,
            metric: 'confidence',
            reason: days.size === 0
              ? 'Absent all week per Deputy attendance (auto-synced)'
              : 'Did not work Mon–Wed per Deputy attendance (auto-synced)',
            created_by: null,
          });
        }
        if (performance === 'excused') {
          excusalInserts.push({
            staff_id: mapping.staff_id,
            week_of: weekOfStr,
            metric: 'performance',
            reason: days.size === 0
              ? 'Absent all week per Deputy attendance (auto-synced)'
              : 'Did not work Thu–Fri per Deputy attendance (auto-synced)',
            created_by: null,
          });
        }
      }
    }

    // ── Auto-create new mappings for never-seen Deputy employees (real sync only)
    let newMappingsCreated = 0;
    if (!dryRun) {
      for (const [deputyEmpId, displayName] of allSeenEmployees.entries()) {
        const { data: existing } = await supabase
          .from('deputy_employee_mappings')
          .select('id')
          .eq('organization_id', orgId)
          .eq('deputy_employee_id', deputyEmpId)
          .maybeSingle();

        if (!existing) {
          const suggested = suggestStaffMatch(displayName, staffList);
          await supabase.from('deputy_employee_mappings').insert({
            organization_id: orgId,
            deputy_employee_id: deputyEmpId,
            deputy_display_name: displayName,
            staff_id: suggested?.id ?? null,
            is_confirmed: false,
            is_ignored: false,
          });
          newMappingsCreated++;
        }
      }

      if (excusalInserts.length > 0) {
        const { error: excusalError } = await supabase
          .from('excused_submissions')
          .upsert(excusalInserts, {
            onConflict: 'staff_id,week_of,metric',
            ignoreDuplicates: true,
          });
        if (excusalError) console.error('Error inserting excusal records:', excusalError);
      }

      await supabase
        .from('deputy_connections')
        .update({
          last_sync_at: new Date().toISOString(),
          last_sync_status: 'success',
          last_sync_error: null,
        })
        .eq('organization_id', orgId);
    }

    // Sort details: unconfirmed first (admin attention), then alpha by name
    details.sort((a, b) => {
      if (a.is_confirmed !== b.is_confirmed) return a.is_confirmed ? 1 : -1;
      return a.deputy_name.localeCompare(b.deputy_name);
    });

    const summary: Record<string, any> = {
      ok: true,
      dry_run: dryRun,
      week_of: weekOfStr,
      window_start: windowStart.toISOString(),
      window_end: windowEnd.toISOString(),
      preview_days: dryRun ? previewDays : undefined,
      timesheet_count: timesheets.length,
      timesheet_sample: dryRun ? timesheetSample : undefined,
      employee_count: allSeenEmployees.size,
      mapped_employee_count: mappings.length,
      confirmed_mapping_count: mappings.filter((m) => m.is_confirmed).length,
      absent_all_week_count: absentCount,
      friday_only_extension_count: fridayExtensionCount,
      would_excuse_confidence: confidenceExcusedCount,
      would_excuse_performance: performanceExcusedCount,
      details,
      sync_start_date: syncStartDate,
      skipped_before_start_date: beforeStartFloor || undefined,
      new_mappings_created: dryRun ? 0 : newMappingsCreated,
      excusal_records_created: dryRun ? 0 : excusalInserts.length,
      note: dryRun
        ? 'DRY RUN — no data was written. The `details` array shows the per-employee decision that WOULD be applied for confirmed mappings on a real sync.'
        : undefined,
    };

    console.log(
      `Deputy sync complete: ${timesheets.length} timesheets, ${mappings.length} mappings, ` +
      `${absentCount} absent, ${fridayExtensionCount} Fri-only, ${excusalInserts.length} excusals written`
    );
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
