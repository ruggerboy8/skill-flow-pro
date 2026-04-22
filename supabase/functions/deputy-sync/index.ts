// Deputy sync — four-mode architecture.
//
//   mode=preview_data        → returns shifts-per-person for date range. No writes.
//   mode=preview_excusals    → computes per-week excusal diff. No writes.
//   mode=apply_week          → writes excusals for one specific week.
//   mode=apply_retroactive   → walks every Mon–Sun week from start_date → today, writes excusals.
//
// All modes use the same per-day excusal logic:
//   confidence_excused        → no Mon/Tue/Wed in daysWorked
//   performance_excused       → no Thu/Fri in daysWorked AND not Friday-only
//   friday_extension (flag)   → daysWorked === {Fri}; deadline shifts, no excusal record
//   already_submitted         → existing weekly_scores row; never overwrite with an excusal
//
// All apply modes are idempotent — `excused_submissions` upserts use
// ignoreDuplicates so re-runs are safe.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CALLBACK_URL = 'https://yeypngaufuualdfzcjpk.supabase.co/functions/v1/deputy-oauth-callback';
const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

// ─── Helpers ────────────────────────────────────────────────────────────────

function cleanInstall(s: string) {
  return String(s).replace(/^https?:\/\//i, '').replace(/\.deputy\.com.*$/i, '').replace(/\..*$/, '').trim();
}
function cleanRegion(s: string) {
  return String(s).replace(/[^a-z0-9-]/gi, '').trim();
}

function getWeekMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getUTCDay();
  const daysToMonday = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + daysToMonday);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function isoDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

async function refreshDeputyToken(
  connection: any,
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
    refresh_token: connection.refresh_token,
    scope: 'longlife_refresh_token',
  });
  const r = await fetch(`${baseUrl}/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!r.ok) throw new Error(`Deputy token refresh failed (${r.status}): ${(await r.text()).slice(0, 300)}`);
  const d = await r.json();
  const expiresAt = new Date(Date.now() + (d.expires_in ?? 86400) * 1000).toISOString();
  await (admin as any)
    .from('deputy_connections')
    .update({
      access_token: d.access_token,
      refresh_token: d.refresh_token ?? connection.refresh_token,
      token_expires_at: expiresAt,
    })
    .eq('organization_id', orgId);
  return d.access_token;
}

async function fetchTimesheets(
  baseUrl: string,
  accessToken: string,
  startUnix: number,
  endUnix: number
): Promise<any[]> {
  const PAGE_SIZE = 500;
  const MAX_PAGES = 40; // hard safety cap → up to 20k shifts
  const all: any[] = [];
  let start = 0;

  for (let page = 0; page < MAX_PAGES; page++) {
    const r = await fetch(`${baseUrl}/api/v1/resource/Timesheet/QUERY`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        search: {
          s1: { field: 'StartTime', data: startUnix, type: 'gt' },
          s2: { field: 'StartTime', data: endUnix, type: 'lt' },
        },
        sort: { StartTime: 'asc' },
        max: PAGE_SIZE,
        start,
      }),
    });
    if (!r.ok) throw new Error(`Deputy timesheet query failed (${r.status}): ${(await r.text()).slice(0, 500)}`);
    const batch = await r.json();
    if (!Array.isArray(batch) || batch.length === 0) break;
    all.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    start += PAGE_SIZE;
  }

  console.log(`fetchTimesheets: paginated ${all.length} shifts across ${Math.ceil(all.length / PAGE_SIZE)} page(s)`);
  return all;
}

/** Bucket non-discarded timesheets into Map<empId, Map<weekISO, Set<dow 1..5>>>. */
function bucketTimesheetsByWeek(timesheets: any[]): Map<number, Map<string, Set<number>>> {
  const out = new Map<number, Map<string, Set<number>>>();
  for (const ts of timesheets) {
    if (ts.Discarded || !ts.StartTime) continue;
    const empId: number = ts.Employee;
    if (!empId) continue;
    const start = new Date(ts.StartTime * 1000);
    const dow = start.getUTCDay();
    if (dow < 1 || dow > 5) continue;
    const weekKey = isoDate(getWeekMonday(start));
    let byWeek = out.get(empId);
    if (!byWeek) { byWeek = new Map(); out.set(empId, byWeek); }
    let dows = byWeek.get(weekKey);
    if (!dows) { dows = new Set(); byWeek.set(weekKey, dows); }
    dows.add(dow);
  }
  return out;
}

type Decision = {
  confidence: 'expected' | 'excused' | 'already_submitted';
  performance: 'expected' | 'excused' | 'expected_extended_deadline' | 'already_submitted';
  isFridayOnly: boolean;
  isAbsent: boolean;
};

function decide(days: Set<number>, hasConfSubmission: boolean, hasPerfSubmission: boolean): Decision {
  const hasMonTueWed = days.has(1) || days.has(2) || days.has(3);
  const hasThuFri = days.has(4) || days.has(5);
  const isFridayOnly = days.size === 1 && days.has(5);
  const isAbsent = days.size === 0;

  let confidence: Decision['confidence'];
  if (hasConfSubmission) confidence = 'already_submitted';
  else confidence = hasMonTueWed ? 'expected' : 'excused';

  let performance: Decision['performance'];
  if (hasPerfSubmission) performance = 'already_submitted';
  else if (isFridayOnly) performance = 'expected_extended_deadline';
  else if (hasThuFri) performance = 'expected';
  else performance = 'excused';

  return { confidence, performance, isFridayOnly, isAbsent };
}

function daysToLabels(days: Set<number>): string[] {
  return Array.from(days).sort((a, b) => a - b).map((d) => DAY_LABELS[d]);
}

/** Iterate every Monday from `start` to `end` (inclusive of weeks that contain `end`). */
function* mondaysBetween(start: Date, end: Date): Generator<Date> {
  const cur = getWeekMonday(start);
  const stop = getWeekMonday(end);
  while (cur.getTime() <= stop.getTime()) {
    yield new Date(cur);
    cur.setUTCDate(cur.getUTCDate() + 7);
  }
}

// ─── Main handler ────────────────────────────────────────────────────────────

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

    // ── Parse body ──────────────────────────────────────────────────────────
    let body: Record<string, any> = {};
    try { body = await req.json(); } catch { /* allow empty */ }

    type Mode = 'preview_data' | 'preview_excusals' | 'apply_week' | 'apply_retroactive';
    const mode: Mode = (body.mode as Mode) ?? 'preview_data';
    if (!['preview_data', 'preview_excusals', 'apply_week', 'apply_retroactive'].includes(mode)) {
      return json(400, { ok: false, error: `Invalid mode "${mode}"` });
    }

    // Default date ranges
    const now = new Date();
    const defaultStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    let startDate = body.start_date ? new Date(`${body.start_date}T00:00:00Z`) : defaultStart;
    let endDate = body.end_date ? new Date(`${body.end_date}T23:59:59Z`) : now;

    // For apply_week, narrow to that single week regardless of incoming end_date
    if (mode === 'apply_week') {
      const weekMon = getWeekMonday(body.week_of ? new Date(`${body.week_of}T00:00:00Z`) : now);
      startDate = weekMon;
      endDate = new Date(weekMon);
      endDate.setUTCDate(endDate.getUTCDate() + 7);
    }

    // ── Load Deputy connection ─────────────────────────────────────────────
    const { data: conn, error: cErr } = await admin
      .from('deputy_connections')
      .select('*')
      .eq('organization_id', orgId)
      .maybeSingle();
    if (cErr) return json(500, { ok: false, error: `Connection lookup failed: ${cErr.message}` });
    if (!conn) return json(400, { ok: false, error: 'No Deputy connection. Connect first.' });

    const baseUrl = `https://${cleanInstall((conn as any).deputy_install)}.${cleanRegion((conn as any).deputy_region)}.deputy.com`;

    let accessToken = (conn as any).access_token as string;
    const expMs = new Date((conn as any).token_expires_at).getTime();
    if (Date.now() > expMs - 60_000) {
      accessToken = await refreshDeputyToken(conn, baseUrl, clientId, clientSecret, admin, orgId);
    }

    // ── Load mappings (participant ↔ Deputy employee) ─────────────────────
    const { data: mappingRows } = await admin
      .from('deputy_employee_mappings')
      .select('staff_id, deputy_employee_id, deputy_display_name, is_confirmed, is_ignored')
      .eq('organization_id', orgId)
      .not('staff_id', 'is', null);

    const allMappings = (mappingRows ?? []) as Array<{
      staff_id: string;
      deputy_employee_id: number | null;
      deputy_display_name: string;
      is_confirmed: boolean;
      is_ignored: boolean;
    }>;

    // For apply modes, only mapped + confirmed + non-ignored participants drive writes.
    // For preview modes, include everyone with a deputy_employee_id (so admins can see
    // "this would happen if you confirmed the suggestion") and surface unmapped participants
    // separately in the response shape.
    const isApply = mode === 'apply_week' || mode === 'apply_retroactive';
    const activeMappings = allMappings.filter((m) => {
      if (!m.deputy_employee_id) return false;
      if (m.is_ignored) return false;
      if (isApply && !m.is_confirmed) return false;
      return true;
    });

    // Fast lookups
    const empToStaff = new Map<number, { staff_id: string; deputy_display_name: string; is_confirmed: boolean }>();
    for (const m of activeMappings) {
      empToStaff.set(m.deputy_employee_id!, {
        staff_id: m.staff_id,
        deputy_display_name: m.deputy_display_name,
        is_confirmed: m.is_confirmed,
      });
    }

    // ── Resolve participant names for display ─────────────────────────────
    const staffIds = activeMappings.map((m) => m.staff_id);
    const staffNameById = new Map<string, string>();
    if (staffIds.length > 0) {
      const { data: staffRows2 } = await admin
        .from('staff')
        .select('id, name')
        .in('id', staffIds);
      for (const s of staffRows2 ?? []) staffNameById.set((s as any).id, (s as any).name);
    }

    // ── Fetch timesheets for the requested window ─────────────────────────
    const startUnix = Math.floor(startDate.getTime() / 1000);
    const endUnix = Math.floor(endDate.getTime() / 1000);
    console.log(`deputy-sync mode=${mode} org=${orgId} window=${startDate.toISOString()}..${endDate.toISOString()}`);

    const timesheets = await fetchTimesheets(baseUrl, accessToken, startUnix, endUnix);
    console.log(`Retrieved ${timesheets.length} timesheets`);

    const bucketed = bucketTimesheetsByWeek(timesheets);

    // Total shifts per employee (counts non-discarded only)
    const shiftCountByEmp = new Map<number, number>();
    for (const ts of timesheets) {
      if (ts.Discarded) continue;
      const empId: number = ts.Employee;
      if (!empId) continue;
      shiftCountByEmp.set(empId, (shiftCountByEmp.get(empId) ?? 0) + 1);
    }

    // ── Pre-load existing excusals for the window so previews can flag duplicates
    const existingExcusalKey = new Set<string>(); // `${staff_id}|${week_of}|${metric}`
    if (staffIds.length > 0) {
      const { data: excs } = await admin
        .from('excused_submissions')
        .select('staff_id, week_of, metric')
        .in('staff_id', staffIds)
        .gte('week_of', isoDate(startDate))
        .lte('week_of', isoDate(endDate));
      for (const e of excs ?? []) {
        existingExcusalKey.add(`${(e as any).staff_id}|${(e as any).week_of}|${(e as any).metric}`);
      }
    }

    // ── Pre-load weekly_scores so we never overwrite a real submission ────
    const submittedConf = new Set<string>(); // `${staff_id}|${week_of}`
    const submittedPerf = new Set<string>();
    if (staffIds.length > 0) {
      const { data: scores } = await admin
        .from('weekly_scores')
        .select('staff_id, week_of, confidence_score, performance_score')
        .in('staff_id', staffIds)
        .gte('week_of', isoDate(startDate))
        .lte('week_of', isoDate(endDate));
      for (const r of scores ?? []) {
        if ((r as any).confidence_score != null) submittedConf.add(`${(r as any).staff_id}|${(r as any).week_of}`);
        if ((r as any).performance_score != null) submittedPerf.add(`${(r as any).staff_id}|${(r as any).week_of}`);
      }
    }

    // ─────────────────────────────────────────────────────────────────────
    // MODE: preview_data
    // ─────────────────────────────────────────────────────────────────────
    if (mode === 'preview_data') {
      const staffOut: any[] = [];
      for (const m of activeMappings) {
        const empId = m.deputy_employee_id!;
        const byWeek = bucketed.get(empId) ?? new Map();
        const weeks: any[] = [];

        // Also count per-week shift totals
        const shiftCountByWeek = new Map<string, number>();
        for (const ts of timesheets) {
          if (ts.Discarded || ts.Employee !== empId || !ts.StartTime) continue;
          const wk = isoDate(getWeekMonday(new Date(ts.StartTime * 1000)));
          shiftCountByWeek.set(wk, (shiftCountByWeek.get(wk) ?? 0) + 1);
        }

        for (const [weekIso, dows] of byWeek.entries()) {
          weeks.push({
            week_of: weekIso,
            days_worked: daysToLabels(dows),
            shift_count: shiftCountByWeek.get(weekIso) ?? 0,
          });
        }
        weeks.sort((a, b) => a.week_of.localeCompare(b.week_of));

        staffOut.push({
          staff_id: m.staff_id,
          staff_name: staffNameById.get(m.staff_id) ?? '(unknown)',
          deputy_display_name: m.deputy_display_name,
          deputy_employee_id: empId,
          is_confirmed: m.is_confirmed,
          total_shifts: shiftCountByEmp.get(empId) ?? 0,
          weeks,
        });
      }
      staffOut.sort((a, b) => (b.total_shifts - a.total_shifts) || a.staff_name.localeCompare(b.staff_name));

      return json(200, {
        ok: true,
        mode,
        date_range: { start: isoDate(startDate), end: isoDate(endDate) },
        timesheet_count: timesheets.length,
        mapped_participant_count: activeMappings.length,
        staff: staffOut,
      });
    }

    // ─────────────────────────────────────────────────────────────────────
    // MODE: preview_excusals
    // ─────────────────────────────────────────────────────────────────────
    if (mode === 'preview_excusals') {
      const staffOut: any[] = [];
      let totalWouldCreate = 0;
      let totalAlreadyExist = 0;

      for (const m of activeMappings) {
        const empId = m.deputy_employee_id!;
        const byWeek = bucketed.get(empId) ?? new Map();

        const wouldCreate: any[] = [];
        let alreadyExist = 0;

        for (const monday of mondaysBetween(startDate, endDate)) {
          const weekIso = isoDate(monday);
          const days = byWeek.get(weekIso) ?? new Set<number>();
          const dec = decide(
            days,
            submittedConf.has(`${m.staff_id}|${weekIso}`),
            submittedPerf.has(`${m.staff_id}|${weekIso}`)
          );

          if (dec.confidence === 'excused') {
            const key = `${m.staff_id}|${weekIso}|confidence`;
            if (existingExcusalKey.has(key)) alreadyExist++;
            else wouldCreate.push({
              week_of: weekIso, metric: 'confidence',
              days_worked: daysToLabels(days),
              action: 'create',
            });
          }
          if (dec.performance === 'excused') {
            const key = `${m.staff_id}|${weekIso}|performance`;
            if (existingExcusalKey.has(key)) alreadyExist++;
            else wouldCreate.push({
              week_of: weekIso, metric: 'performance',
              days_worked: daysToLabels(days),
              action: 'create',
            });
          }
          if (dec.performance === 'expected_extended_deadline') {
            wouldCreate.push({
              week_of: weekIso, metric: 'performance',
              days_worked: daysToLabels(days),
              action: 'friday_extension',
            });
          }
        }

        wouldCreate.sort((a, b) => a.week_of.localeCompare(b.week_of));
        const realCreates = wouldCreate.filter((w) => w.action === 'create').length;
        totalWouldCreate += realCreates;
        totalAlreadyExist += alreadyExist;

        if (wouldCreate.length > 0 || alreadyExist > 0) {
          staffOut.push({
            staff_id: m.staff_id,
            staff_name: staffNameById.get(m.staff_id) ?? '(unknown)',
            deputy_display_name: m.deputy_display_name,
            deputy_employee_id: empId,
            is_confirmed: m.is_confirmed,
            total_shifts_in_range: shiftCountByEmp.get(empId) ?? 0,
            excusals_already_exist: alreadyExist,
            excusals_would_create: wouldCreate,
          });
        }
      }
      staffOut.sort((a, b) => b.excusals_would_create.length - a.excusals_would_create.length);

      return json(200, {
        ok: true,
        mode,
        date_range: { start: isoDate(startDate), end: isoDate(endDate) },
        staff: staffOut,
        total_excusals_would_create: totalWouldCreate,
        total_excusals_already_exist: totalAlreadyExist,
      });
    }

    // ─────────────────────────────────────────────────────────────────────
    // MODE: apply_week / apply_retroactive
    // ─────────────────────────────────────────────────────────────────────
    const inserts: Array<{ staff_id: string; week_of: string; metric: string; reason: string; created_by: null }> = [];
    const perStaffSummary: any[] = [];

    for (const m of activeMappings) {
      const empId = m.deputy_employee_id!;
      const byWeek = bucketed.get(empId) ?? new Map();

      let confExcused = 0;
      let perfExcused = 0;
      let fridayExt = 0;

      for (const monday of mondaysBetween(startDate, endDate)) {
        const weekIso = isoDate(monday);
        const days = byWeek.get(weekIso) ?? new Set<number>();
        const dec = decide(
          days,
          submittedConf.has(`${m.staff_id}|${weekIso}`),
          submittedPerf.has(`${m.staff_id}|${weekIso}`)
        );

        if (dec.confidence === 'excused' && !existingExcusalKey.has(`${m.staff_id}|${weekIso}|confidence`)) {
          inserts.push({
            staff_id: m.staff_id,
            week_of: weekIso,
            metric: 'confidence',
            reason: dec.isAbsent
              ? 'Absent all week per Deputy attendance'
              : 'Did not work Mon–Wed per Deputy attendance',
            created_by: null,
          });
          confExcused++;
        }
        if (dec.performance === 'excused' && !existingExcusalKey.has(`${m.staff_id}|${weekIso}|performance`)) {
          inserts.push({
            staff_id: m.staff_id,
            week_of: weekIso,
            metric: 'performance',
            reason: dec.isAbsent
              ? 'Absent all week per Deputy attendance'
              : 'Did not work Thu–Fri per Deputy attendance',
            created_by: null,
          });
          perfExcused++;
        }
        if (dec.performance === 'expected_extended_deadline') fridayExt++;
      }

      if (confExcused || perfExcused || fridayExt) {
        perStaffSummary.push({
          staff_id: m.staff_id,
          staff_name: staffNameById.get(m.staff_id) ?? '(unknown)',
          confidence_excused: confExcused,
          performance_excused: perfExcused,
          friday_extensions: fridayExt,
        });
      }
    }

    let inserted = 0;
    if (inserts.length > 0) {
      const { error: insErr, count } = await admin
        .from('excused_submissions')
        .upsert(inserts, { onConflict: 'staff_id,week_of,metric', ignoreDuplicates: true, count: 'exact' });
      if (insErr) {
        console.error('Excusal insert error:', insErr);
        await admin.from('deputy_connections').update({
          last_sync_at: new Date().toISOString(),
          last_sync_status: 'error',
          last_sync_error: insErr.message.slice(0, 500),
        }).eq('organization_id', orgId);
        return json(500, { ok: false, error: `Excusal insert failed: ${insErr.message}` });
      }
      inserted = count ?? inserts.length;
    }

    await admin.from('deputy_connections').update({
      last_sync_at: new Date().toISOString(),
      last_sync_status: 'success',
      last_sync_error: null,
    }).eq('organization_id', orgId);

    return json(200, {
      ok: true,
      mode,
      date_range: { start: isoDate(startDate), end: isoDate(endDate) },
      mapped_participant_count: activeMappings.length,
      timesheet_count: timesheets.length,
      excusals_inserted: inserted,
      excusals_attempted: inserts.length,
      excusals_already_existed: inserts.length - inserted,
      per_staff: perStaffSummary,
    });
  } catch (err: any) {
    console.error('deputy-sync error:', err);
    return json(500, { ok: false, error: err?.message ?? 'Unexpected error' });
  }
});
