import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CALLBACK_URL = 'https://yeypngaufuualdfzcjpk.supabase.co/functions/v1/deputy-oauth-callback';

// ─── Helpers ────────────────────────────────────────────────────────────────

function normalizeName(name: string): string {
  return name
    .replace(/,?\s*(DDS|DMD|MD|RDH|RDHA|DA|CDA|OM|OMS)\.?/gi, '')
    .trim()
    .toLowerCase();
}

function nameSimilarity(a: string, b: string): number {
  const ta = new Set(normalizeName(a).split(/\s+/).filter(Boolean));
  const tb = new Set(normalizeName(b).split(/\s+/).filter(Boolean));
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  const union = new Set([...ta, ...tb]).size;
  return inter / union;
}

interface DeputyEmployee {
  id: number;
  display_name: string;
  email: string | null;
  position: string | null;
  operational_unit_name: string | null;
}

/**
 * Find best Deputy employee for an SFP staff member.
 * Priority: exact email > exact normalized name > fuzzy name (Jaccard ≥ threshold).
 */
function suggestDeputyForStaff(
  staff: { name: string; email: string | null },
  deputyEmployees: DeputyEmployee[],
  threshold = 0.6
): DeputyEmployee | null {
  // 1. Email exact match (case-insensitive)
  if (staff.email) {
    const lower = staff.email.toLowerCase();
    const byEmail = deputyEmployees.find(
      (d) => d.email && d.email.toLowerCase() === lower
    );
    if (byEmail) return byEmail;
  }

  // 2. Exact normalized name
  const normStaff = normalizeName(staff.name);
  const exact = deputyEmployees.find((d) => normalizeName(d.display_name) === normStaff);
  if (exact) return exact;

  // 3. Best fuzzy name match
  let best: DeputyEmployee | null = null;
  let bestScore = 0;
  for (const d of deputyEmployees) {
    const score = nameSimilarity(staff.name, d.display_name);
    if (score > bestScore) {
      bestScore = score;
      best = d;
    }
  }
  return bestScore >= threshold ? best : null;
}

function getWeekMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getUTCDay();
  const daysToMonday = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + daysToMonday);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

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

/**
 * Fetch Deputy employees enriched with Position name and OperationalUnit (home location) name.
 * Deputy returns numeric IDs for Position/OperationalUnit; we resolve them to display names
 * via separate lookups so admins can disambiguate same-name staff.
 */
async function fetchEnrichedDeputyEmployees(
  baseUrl: string,
  accessToken: string
): Promise<DeputyEmployee[]> {
  const empRes = await fetch(`${baseUrl}/api/v1/resource/Employee/QUERY`, {
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

  // Collect referenced Position + OperationalUnit IDs to resolve in batch.
  const positionIds = new Set<number>();
  const opUnitIds = new Set<number>();
  for (const e of employees) {
    if (e.Position) positionIds.add(e.Position);
    if (e.OperationalUnit) opUnitIds.add(e.OperationalUnit);
  }

  const positionNames = new Map<number, string>();
  const opUnitNames = new Map<number, string>();

  // Resolve Positions
  if (positionIds.size > 0) {
    try {
      const posRes = await fetch(`${baseUrl}/api/v1/resource/CompanyPeriod/QUERY`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      // CompanyPeriod won't return positions; use the proper endpoint instead
      void posRes;
    } catch {/* ignore */}

    try {
      const res = await fetch(`${baseUrl}/api/v1/resource/EmployeeRole`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${accessToken}` },
      });
      if (res.ok) {
        const roles: any[] = await res.json();
        for (const r of roles) {
          if (r.Id && r.Role) positionNames.set(r.Id, String(r.Role));
        }
      }
    } catch (err) {
      console.warn('Failed to resolve EmployeeRole names:', err);
    }
  }

  // Resolve OperationalUnits (home location / area)
  if (opUnitIds.size > 0) {
    try {
      const res = await fetch(`${baseUrl}/api/v1/resource/OperationalUnit`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${accessToken}` },
      });
      if (res.ok) {
        const units: any[] = await res.json();
        for (const u of units) {
          if (u.Id) {
            const label = u.OperationalUnitName ?? u.Code ?? `Unit ${u.Id}`;
            opUnitNames.set(u.Id, String(label));
          }
        }
      }
    } catch (err) {
      console.warn('Failed to resolve OperationalUnit names:', err);
    }
  }

  return employees.map((e: any): DeputyEmployee => {
    const id: number = e.Id;
    const displayName: string =
      (e.DisplayName ?? `${e.FirstName ?? ''} ${e.LastName ?? ''}`.trim()) || `Employee ${id}`;
    return {
      id,
      display_name: displayName,
      email: e.Email ?? e.UserEmail ?? null,
      position: e.Position ? positionNames.get(e.Position) ?? null : null,
      operational_unit_name: e.OperationalUnit ? opUnitNames.get(e.OperationalUnit) ?? null : null,
    };
  });
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

    let body: Record<string, any> = {};
    try { body = await req.json(); } catch { /* empty body is fine */ }

    const dryRun: boolean = body.dry_run !== false; // default true
    const employeesOnly: boolean = body.employees_only === true;
    // Default preview window is 30 days (was 7) — gives admins much better visibility
    // into who's actually working before flipping the live sync on.
    const previewDays: number = Math.max(1, Math.min(31, Number(body.days ?? 30)));

    const targetWeekMonday = body.week_of
      ? getWeekMonday(new Date(body.week_of))
      : getWeekMonday(new Date());

    const weekOfStr = targetWeekMonday.toISOString().split('T')[0];
    const nextMonday = new Date(targetWeekMonday);
    nextMonday.setUTCDate(nextMonday.getUTCDate() + 7);

    // For dry-run preview: rolling N-day window ending now (visibility).
    // For real sync: the target week (Mon..Mon).
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

    let accessToken: string = connection.access_token;
    const expiresAt = new Date(connection.token_expires_at).getTime();
    if (expiresAt < Date.now() + 5 * 60 * 1000) {
      console.log('Access token expiring soon — refreshing');
      accessToken = await refreshDeputyToken(connection, deputyClientId, deputyClientSecret, supabase as any);
    }

    const cleanInstall2 = String(connection.deputy_install).replace(/^https?:\/\//i, '').replace(/\.deputy\.com.*$/i, '').replace(/\..*$/, '').trim();
    const cleanRegion2 = String(connection.deputy_region).replace(/[^a-z0-9-]/gi, '').trim();
    const deputyBaseUrl = `https://${cleanInstall2}.${cleanRegion2}.deputy.com`;

    // ── Load org PARTICIPANTS (the universe we care about) ───────────────────
    // Excusal logic only matters for staff who actually fill out Pro Moves.
    // We pivot the model: iterate participants, find their Deputy match — not
    // the other way around.
    const { data: participantsRaw } = await supabase
      .from('staff')
      .select('id, name, email')
      .eq('organization_id', orgId)
      .eq('active', true)
      .eq('is_participant', true)
      .order('name');
    const participants = (participantsRaw ?? []) as Array<{ id: string; name: string; email: string | null }>;

    // ─────────────────────────────────────────────────────────────────────────
    // EMPLOYEES-ONLY FLOW
    // Fetch enriched Deputy roster, then ensure every SFP participant has
    // exactly one mapping row (auto-suggested where possible).
    // ─────────────────────────────────────────────────────────────────────────
    if (employeesOnly) {
      const deputyEmployees = await fetchEnrichedDeputyEmployees(deputyBaseUrl, accessToken);

      // Persist enrichment on existing rows + suggested mappings for participants
      // missing one. We never create rows keyed only on a Deputy employee — every
      // mapping row anchors to an SFP participant.
      const { data: existingMappings } = await supabase
        .from('deputy_employee_mappings')
        .select('id, staff_id, deputy_employee_id')
        .eq('organization_id', orgId);
      const existingByStaff = new Map<string, any>();
      const claimedDeputyIds = new Set<number>();
      for (const m of existingMappings ?? []) {
        if ((m as any).staff_id) existingByStaff.set((m as any).staff_id, m);
        if ((m as any).deputy_employee_id) claimedDeputyIds.add((m as any).deputy_employee_id);
      }

      let createdCount = 0;
      let suggestedCount = 0;

      for (const p of participants) {
        if (existingByStaff.has(p.id)) continue;

        const suggested = suggestDeputyForStaff(p, deputyEmployees);
        // Don't suggest the same Deputy employee for two participants
        const finalSuggested = suggested && !claimedDeputyIds.has(suggested.id) ? suggested : null;

        if (finalSuggested) {
          suggestedCount++;
          claimedDeputyIds.add(finalSuggested.id);
        }
        createdCount++;

        if (!dryRun) {
          await supabase.from('deputy_employee_mappings').insert({
            organization_id: orgId,
            staff_id: p.id,
            deputy_employee_id: finalSuggested?.id ?? null, // NULL = unmapped placeholder
            deputy_display_name: finalSuggested?.display_name ?? '— not yet matched —',
            is_confirmed: false,
            is_ignored: false,
          });
        }
      }

      return new Response(JSON.stringify({
        ok: true,
        employees_only: true,
        dry_run: dryRun,
        deputy_employee_count: deputyEmployees.length,
        participant_count: participants.length,
        new_mappings_created: dryRun ? 0 : createdCount,
        new_mappings_would_create: dryRun ? createdCount : undefined,
        auto_suggested: suggestedCount,
        deputy_employees: deputyEmployees, // full enriched roster — UI dropdown source
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

    // ── Per-Deputy-employee day-of-week aggregation ──────────────────────────
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
        const dow = new Date(ts.StartTime * 1000).getUTCDay();
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

    // ── Load all participant mappings (one row per SFP participant) ─────────
    // For dry-run preview: include all mappings so admins see what WILL happen.
    // For real sync: only confirmed, non-ignored mappings drive excusals.
    const mappingsQuery = supabase
      .from('deputy_employee_mappings')
      .select('deputy_employee_id, staff_id, deputy_display_name, is_confirmed, is_ignored')
      .eq('organization_id', orgId)
      .not('staff_id', 'is', null);

    const { data: mappingRows } = dryRun
      ? await mappingsQuery
      : await mappingsQuery.eq('is_confirmed', true).eq('is_ignored', false);

    const mappings = (mappingRows ?? []).filter(
      (m: any) => m.deputy_employee_id != null
    ) as any[];

    // ── Pre-load existing weekly_scores for the target week ─────────────────
    // We never want to mark a metric "excused" if the staff member has already
    // submitted a real score for that week. (e.g., walked in Thursday, filled
    // out both confidence and performance — confidence was technically "excused"
    // by attendance rules but we have the data, so keep it.)
    const staffIdsForWeek = mappings.map((m: any) => m.staff_id);
    const submittedConfidence = new Set<string>();
    const submittedPerformance = new Set<string>();
    if (!dryRun && staffIdsForWeek.length > 0) {
      const { data: existingScores } = await supabase
        .from('weekly_scores')
        .select('staff_id, confidence_score, performance_score')
        .in('staff_id', staffIdsForWeek)
        .eq('week_of', weekOfStr);
      for (const row of existingScores ?? []) {
        if ((row as any).confidence_score != null) submittedConfidence.add((row as any).staff_id);
        if ((row as any).performance_score != null) submittedPerformance.add((row as any).staff_id);
      }
    }

    const syncStartDate: string | null = (connection as any).sync_start_date ?? null;
    const beforeStartFloor = !dryRun && syncStartDate
      ? syncStartDate > weekOfStr
      : false;

    type EmpDecision = {
      deputy_employee_id: number;
      deputy_name: string;
      sfp_staff_id: string;
      days_worked: string[];
      confidence: 'expected' | 'excused' | 'already_submitted';
      performance: 'expected' | 'excused' | 'expected_extended_deadline' | 'already_submitted';
      is_confirmed: boolean;
    };

    const details: EmpDecision[] = [];
    const excusalInserts: Record<string, any>[] = [];
    let absentCount = 0;
    let fridayExtensionCount = 0;
    let confidenceExcusedCount = 0;
    let performanceExcusedCount = 0;
    let skippedAlreadySubmitted = 0;

    for (const mapping of mappings) {
      const days = daysWorkedByEmployee.get(mapping.deputy_employee_id) ?? new Set<number>();
      const hasMonTueWed = days.has(1) || days.has(2) || days.has(3);
      const hasThuFri = days.has(4) || days.has(5);
      const isFridayOnly = days.size === 1 && days.has(5);

      let confidence: EmpDecision['confidence'];
      if (submittedConfidence.has(mapping.staff_id)) confidence = 'already_submitted';
      else confidence = hasMonTueWed ? 'expected' : 'excused';

      let performance: EmpDecision['performance'];
      if (submittedPerformance.has(mapping.staff_id)) performance = 'already_submitted';
      else if (hasThuFri && !isFridayOnly) performance = 'expected';
      else if (isFridayOnly) performance = 'expected_extended_deadline';
      else performance = 'excused';

      if (days.size === 0) absentCount++;
      if (isFridayOnly) fridayExtensionCount++;
      if (confidence === 'excused') confidenceExcusedCount++;
      if (performance === 'excused') performanceExcusedCount++;
      if (confidence === 'already_submitted' || performance === 'already_submitted') {
        skippedAlreadySubmitted++;
      }

      details.push({
        deputy_employee_id: mapping.deputy_employee_id,
        deputy_name: mapping.deputy_display_name,
        sfp_staff_id: mapping.staff_id,
        days_worked: Array.from(days).sort().map((d) => DAY_LABELS[d]),
        confidence,
        performance,
        is_confirmed: !!mapping.is_confirmed,
      });

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

    if (!dryRun) {
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
      participant_count: participants.length,
      mapped_employee_count: mappings.length,
      confirmed_mapping_count: mappings.filter((m: any) => m.is_confirmed).length,
      absent_all_week_count: absentCount,
      friday_only_extension_count: fridayExtensionCount,
      would_excuse_confidence: confidenceExcusedCount,
      would_excuse_performance: performanceExcusedCount,
      skipped_already_submitted: skippedAlreadySubmitted,
      details,
      sync_start_date: syncStartDate,
      skipped_before_start_date: beforeStartFloor || undefined,
      excusal_records_created: dryRun ? 0 : excusalInserts.length,
      note: dryRun
        ? 'DRY RUN — no data was written. Excusals are skipped for staff who already submitted that metric this week.'
        : undefined,
    };

    console.log(
      `Deputy sync complete: ${timesheets.length} timesheets, ${mappings.length} mappings, ` +
      `${absentCount} absent, ${fridayExtensionCount} Fri-only, ${excusalInserts.length} excusals written, ` +
      `${skippedAlreadySubmitted} skipped (already submitted)`
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
