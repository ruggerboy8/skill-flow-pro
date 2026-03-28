// supabase/functions/sequencer-auto-assign/index.ts
// Auto-fills empty weekly assignment slots using sequencer-rank rankings,
// then generates a one-sentence AI rationale for each pick via OpenAI.
// Writes draft assignments to weekly_assignments (status='draft', generated_by='auto').
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const REASON_LABELS: Record<string, string> = {
  LOW_CONF: 'team confidence is low for this skill',
  NEVER: 'this skill has never been practiced',
  STALE: 'this skill has not been practiced recently',
  TIE: 'this skill scored highly in the ranking',
};

interface AutoAssignRequest {
  orgId: string;
  roleId: number;
  weekStartDate: string; // 'YYYY-MM-DD' Monday
  numSlots?: number; // default 3
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  try {
    // ── Auth ─────────────────────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);

    const callerClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: authUser, error: authErr } = await callerClient.auth.getUser();
    if (authErr || !authUser?.user) return json({ error: 'Unauthorized' }, 401);

    const { data: me } = await callerClient
      .from('staff')
      .select('is_super_admin, is_org_admin')
      .eq('user_id', authUser.user.id)
      .maybeSingle();

    if (!me?.is_super_admin && !me?.is_org_admin) {
      return json({ error: 'Forbidden — org admin or super admin required' }, 403);
    }

    // ── Parse + validate input ────────────────────────────────────────────────
    const body: AutoAssignRequest = await req.json();
    const { orgId, roleId, weekStartDate, numSlots = 3 } = body;

    if (!orgId || !roleId || !weekStartDate) {
      return json({ error: 'orgId, roleId, and weekStartDate are required' }, 400);
    }

    // Validate weekStartDate is a Monday
    const weekDate = new Date(`${weekStartDate}T00:00:00Z`);
    if (isNaN(weekDate.getTime())) return json({ error: 'Invalid weekStartDate' }, 400);
    if (weekDate.getUTCDay() !== 1) return json({ error: 'weekStartDate must be a Monday' }, 400);

    // ── Service-role client ───────────────────────────────────────────────────
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } },
    );

    // ── Fetch existing assignments for this week ───────────────────────────────
    const { data: existing, error: existErr } = await admin
      .from('weekly_assignments')
      .select('id, display_order, action_id, status')
      .eq('org_id', orgId)
      .eq('role_id', roleId)
      .eq('week_start_date', weekStartDate)
      .is('superseded_at', null);

    if (existErr) throw existErr;

    // Determine which display_order slots are already locked (have weekly_scores)
    const lockedOrders = new Set<number>();
    for (const row of existing || []) {
      const { count } = await admin
        .from('weekly_scores')
        .select('*', { count: 'exact', head: true })
        .eq('assignment_id', `assign:${row.id}`);
      if (count && count > 0) lockedOrders.add(row.display_order);
    }

    // Build the list of display_orders to fill
    const allOrders = Array.from({ length: numSlots }, (_, i) => i + 1);
    const emptyOrders = allOrders.filter((o) => !lockedOrders.has(o));

    if (emptyOrders.length === 0) {
      return json({
        assigned: [],
        skippedLocked: lockedOrders.size,
        message: 'All slots are locked — nothing to fill',
      });
    }

    // ── Call sequencer-rank (forward caller's JWT so RLS resolves correctly) ──
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;

    const rankRes = await fetch(`${SUPABASE_URL}/functions/v1/sequencer-rank`, {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
        apikey: Deno.env.get('SUPABASE_ANON_KEY')!,
      },
      body: JSON.stringify({
        roleId,
        orgId,
        asOfWeek: weekStartDate,
        preset: 'balanced',
        constraints: { cooldownWeeks: 4 },
      }),
    });

    if (!rankRes.ok) {
      console.error('[sequencer-auto-assign] sequencer-rank failed:', rankRes.status);
      return json({ error: 'Ranking service unavailable' }, 503);
    }

    const rankData = await rankRes.json();

    // Build excluded action_ids (already assigned to any slot this week, locked or not)
    const existingActionIds = new Set<number>(
      (existing || []).map((r) => r.action_id).filter(Boolean),
    );

    // Take top picks from `next`, excluding already-assigned moves
    const candidates = (rankData.next || rankData.ranked || []).filter(
      (m: any) => !existingActionIds.has(m.proMoveId),
    );

    const picks = candidates.slice(0, emptyOrders.length);
    if (picks.length === 0) {
      return json({ assigned: [], skippedLocked: lockedOrders.size, message: 'No eligible moves found' });
    }

    // ── Generate rationale for each pick (graceful degradation) ───────────────
    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');

    async function generateRationale(pick: any): Promise<string | null> {
      if (!OPENAI_API_KEY) return null;
      try {
        const reasonLabel = REASON_LABELS[pick.primaryReasonCode] || REASON_LABELS.TIE;
        const weeksSince =
          pick.weeksSinceSeen === 999 ? 'never' : `${pick.weeksSinceSeen} week(s) ago`;
        const avgConf = pick.avgConfLast != null ? pick.avgConfLast.toFixed(2) : 'unknown';

        const prompt = [
          `In one sentence, explain why this pro move is recommended this week for the team.`,
          `Move: "${pick.name}"`,
          `Primary signal: ${reasonLabel}`,
          `Team data: average confidence ${avgConf}/4, last practiced ${weeksSince}.`,
          `Be concise, specific, and encouraging. Do not start with "This".`,
        ].join('\n');

        const res = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${OPENAI_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 100,
            temperature: 0.7,
          }),
        });

        if (!res.ok) return null;
        const data = await res.json();
        return data.choices?.[0]?.message?.content?.trim() ?? null;
      } catch {
        return null;
      }
    }

    const rationales = await Promise.all(picks.map(generateRationale));

    // ── Fetch competency_id for each pick ─────────────────────────────────────
    async function getCompetencyId(actionId: number): Promise<number | null> {
      const { data } = await admin
        .from('pro_moves')
        .select('competency_id')
        .eq('action_id', actionId)
        .maybeSingle();
      return data?.competency_id ?? null;
    }

    const competencyIds = await Promise.all(picks.map((p: any) => getCompetencyId(p.proMoveId)));

    // ── Delete any existing draft rows for empty orders, then insert new ones ─
    if (emptyOrders.length > 0) {
      // Delete previous drafts in empty slots (non-locked)
      const nonLockedIds = (existing || [])
        .filter((r) => !lockedOrders.has(r.display_order))
        .map((r) => r.id);
      if (nonLockedIds.length > 0) {
        await admin.from('weekly_assignments').delete().in('id', nonLockedIds);
      }
    }

    // ── Insert new draft assignments ──────────────────────────────────────────
    const assigned: Array<{
      slot: number;
      actionId: number;
      actionStatement: string;
      rationale: string | null;
    }> = [];

    for (let i = 0; i < picks.length; i++) {
      const pick = picks[i];
      const displayOrder = emptyOrders[i];
      const rationale = rationales[i];
      const competencyId = competencyIds[i];

      const { data: inserted, error: insertErr } = await admin
        .from('weekly_assignments')
        .insert({
          org_id: orgId,
          location_id: null,
          role_id: roleId,
          week_start_date: weekStartDate,
          display_order: displayOrder,
          action_id: pick.proMoveId,
          competency_id: competencyId,
          source: 'global',
          status: 'draft',
          self_select: false,
          generated_by: 'auto',
          ai_rationale: rationale,
          rank_snapshot: {
            parts: pick.parts,
            finalScore: pick.finalScore,
            drivers: pick.drivers,
            version: 'v5',
          },
        })
        .select('id')
        .single();

      if (insertErr) {
        console.error(`[sequencer-auto-assign] Insert error for slot ${displayOrder}:`, insertErr);
        continue;
      }

      assigned.push({
        slot: displayOrder,
        actionId: pick.proMoveId,
        actionStatement: pick.name,
        rationale,
      });
    }

    console.log(
      `[sequencer-auto-assign] Assigned ${assigned.length} slots, skipped ${lockedOrders.size} locked`,
    );

    return json({
      assigned,
      skippedLocked: lockedOrders.size,
    });
  } catch (err) {
    console.error('[sequencer-auto-assign] Unhandled error:', err);
    return json({ error: String(err) }, 500);
  }
});
