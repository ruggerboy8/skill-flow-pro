// supabase/functions/generate-pro-move-weights/index.ts
// Scores every active pro move on three curriculum dimensions using OpenAI.
// Requires platform super-admin JWT.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CONCURRENCY = 10;

const SYSTEM_PROMPT = `You are evaluating a pro move for dental practice staff — a specific behavior they are trained to perform consistently.

Rate its importance on THREE dimensions (0.0–1.0 each):
• Revenue / Case Acceptance (0–1): Does mastering this directly influence treatment acceptance, scheduling efficiency, or practice revenue?
• Patient Experience (0–1): Does this meaningfully improve patient comfort, trust, satisfaction, or retention?
• Foundational Necessity (0–1): Is this a non-negotiable for practice safety, clinical compliance, or team consistency? Would skipping it harm operations?

Scoring anchors:
• "Present treatment costs confidently and offer payment options proactively"
  → revenue: 0.95, patient_exp: 0.60, foundational: 0.20
• "Use the patient's name at least 3 times during their visit"
  → revenue: 0.20, patient_exp: 0.88, foundational: 0.15
• "Complete sterilization logs within 30 minutes of instrument use"
  → revenue: 0.05, patient_exp: 0.20, foundational: 0.95

Provide a single concise sentence explaining the dominant dimension and why.`;

const SCORE_FUNCTION = {
  type: 'function',
  function: {
    name: 'score_pro_move',
    description: 'Score a dental practice pro move on three importance dimensions.',
    parameters: {
      type: 'object',
      required: ['revenue_impact', 'patient_experience_impact', 'foundational_importance', 'rationale'],
      properties: {
        revenue_impact: {
          type: 'number',
          description: 'How strongly this move affects revenue / case acceptance (0.0–1.0)',
        },
        patient_experience_impact: {
          type: 'number',
          description: 'How strongly this move improves patient experience (0.0–1.0)',
        },
        foundational_importance: {
          type: 'number',
          description: 'How foundationally necessary this move is for practice operations (0.0–1.0)',
        },
        rationale: {
          type: 'string',
          description: 'One sentence explaining the dominant dimension.',
        },
      },
    },
  },
};

interface ProMoveRow {
  action_id: number;
  action_statement: string;
  description: string | null;
  role_name: string;
  domain_name: string;
  competency_name: string;
}

async function scoreMove(
  move: ProMoveRow,
  openaiKey: string,
): Promise<{
  revenue: number;
  patient_exp: number;
  foundational: number;
  rationale: string;
} | null> {
  const userPrompt = [
    `Role: ${move.role_name}`,
    `Domain: ${move.domain_name}`,
    `Competency: ${move.competency_name}`,
    `Pro move: "${move.action_statement}"`,
    move.description ? `Context: "${move.description}"` : null,
  ]
    .filter(Boolean)
    .join('\n');

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openaiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        tools: [SCORE_FUNCTION],
        tool_choice: { type: 'function', function: { name: 'score_pro_move' } },
      }),
    });

    if (!res.ok) {
      console.error(`[generate-pro-move-weights] OpenAI error ${res.status} for action_id ${move.action_id}`);
      return null;
    }

    const data = await res.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      console.error(`[generate-pro-move-weights] No tool call for action_id ${move.action_id}`);
      return null;
    }

    const scores = JSON.parse(toolCall.function.arguments);
    const clamp = (v: number) => Math.min(1, Math.max(0, Number(v) || 0));

    return {
      revenue: clamp(scores.revenue_impact),
      patient_exp: clamp(scores.patient_experience_impact),
      foundational: clamp(scores.foundational_importance),
      rationale: String(scores.rationale || '').slice(0, 500),
    };
  } catch (err) {
    console.error(`[generate-pro-move-weights] Exception for action_id ${move.action_id}:`, err);
    return null;
  }
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
      .select('is_super_admin')
      .eq('user_id', authUser.user.id)
      .maybeSingle();

    if (!me?.is_super_admin) return json({ error: 'Forbidden — super admin only' }, 403);

    // ── Config ────────────────────────────────────────────────────────────────
    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    if (!OPENAI_API_KEY) return json({ error: 'OPENAI_API_KEY not configured' }, 500);

    // Service-role client for DB reads/writes
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } },
    );

    // ── Parse input ───────────────────────────────────────────────────────────
    const body = await req.json().catch(() => ({}));
    const actionIds: number[] | null = Array.isArray(body.action_ids) ? body.action_ids : null;

    // ── Fetch pro_moves ───────────────────────────────────────────────────────
    let movesQuery = admin
      .from('pro_moves')
      .select('action_id, action_statement, description, competency_id, role_id')
      .eq('active', true);

    if (actionIds) movesQuery = movesQuery.in('action_id', actionIds);

    const { data: rawMoves, error: movesErr } = await movesQuery;
    if (movesErr) throw movesErr;
    if (!rawMoves?.length) return json({ processed: 0, errors: [] });

    // ── Fetch roles (id → name) ───────────────────────────────────────────────
    const roleIds = [...new Set(rawMoves.map((m) => m.role_id).filter(Boolean))];
    const { data: rolesData } = await admin
      .from('roles')
      .select('role_id, role_name')
      .in('role_id', roleIds);
    const roleMap = new Map<number, string>(
      (rolesData || []).map((r) => [r.role_id, r.role_name]),
    );

    // ── Fetch competencies + domains ──────────────────────────────────────────
    const compIds = [...new Set(rawMoves.map((m) => m.competency_id).filter(Boolean))];
    const { data: compsData } = await admin
      .from('competencies')
      .select('competency_id, name, domain_id')
      .in('competency_id', compIds);

    const domainIds = [...new Set((compsData || []).map((c) => c.domain_id).filter(Boolean))];
    const { data: domainsData } = await admin
      .from('domains')
      .select('domain_id, domain_name')
      .in('domain_id', domainIds);

    const domainMap = new Map<number, string>(
      (domainsData || []).map((d) => [d.domain_id, d.domain_name]),
    );
    const compMap = new Map<number, { name: string; domain_name: string }>(
      (compsData || []).map((c) => [
        c.competency_id,
        { name: c.name, domain_name: domainMap.get(c.domain_id) ?? 'General' },
      ]),
    );

    // ── Build enriched move list ──────────────────────────────────────────────
    const moves: ProMoveRow[] = rawMoves.map((m) => ({
      action_id: m.action_id,
      action_statement: m.action_statement,
      description: m.description ?? null,
      role_name: roleMap.get(m.role_id) ?? 'Staff',
      domain_name: compMap.get(m.competency_id)?.domain_name ?? 'General',
      competency_name: compMap.get(m.competency_id)?.name ?? '',
    }));

    // ── Score in batches of CONCURRENCY ───────────────────────────────────────
    let processed = 0;
    const errors: { action_id: number; error: string }[] = [];

    for (let i = 0; i < moves.length; i += CONCURRENCY) {
      const batch = moves.slice(i, i + CONCURRENCY);
      const results = await Promise.allSettled(
        batch.map((move) => scoreMove(move, OPENAI_API_KEY)),
      );

      const upserts: object[] = [];
      results.forEach((result, idx) => {
        const move = batch[idx];
        if (result.status === 'fulfilled' && result.value) {
          const s = result.value;
          // Weighted: 60% best of revenue/PX, 30% other of revenue/PX, 10% foundational
          const rpMax = Math.max(s.revenue, s.patient_exp);
          const rpMin = Math.min(s.revenue, s.patient_exp);
          const priority = 0.60 * rpMax + 0.30 * rpMin + 0.10 * s.foundational;
          upserts.push({
            action_id: move.action_id,
            curriculum_priority: Math.round(priority * 100) / 100,
            curriculum_priority_revenue: Math.round(s.revenue * 100) / 100,
            curriculum_priority_patient_exp: Math.round(s.patient_exp * 100) / 100,
            curriculum_priority_foundational: Math.round(s.foundational * 100) / 100,
            curriculum_priority_rationale: s.rationale,
            curriculum_priority_generated_at: new Date().toISOString(),
          });
          processed++;
        } else {
          errors.push({
            action_id: move.action_id,
            error: result.status === 'rejected' ? String(result.reason) : 'null result',
          });
        }
      });

      if (upserts.length > 0) {
        const { error: upsertErr } = await admin
          .from('pro_moves')
          .upsert(upserts as any, { onConflict: 'action_id' });
        if (upsertErr) {
          console.error('[generate-pro-move-weights] Upsert error:', upsertErr);
          batch.forEach((m) => {
            if (upserts.some((u: any) => u.action_id === m.action_id)) {
              errors.push({ action_id: m.action_id, error: upsertErr.message });
              processed--;
            }
          });
        }
      }
    }

    console.log(`[generate-pro-move-weights] Processed ${processed}/${moves.length}, errors: ${errors.length}`);
    return json({ processed, total: moves.length, errors });
  } catch (err) {
    console.error('[generate-pro-move-weights] Unhandled error:', err);
    return json({ error: String(err) }, 500);
  }
});
