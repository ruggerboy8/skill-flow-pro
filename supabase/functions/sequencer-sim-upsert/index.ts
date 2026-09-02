import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.53.0';
import { corsHeaders } from '../_shared/cors.ts';
import { computeTwoWeeks } from '../_shared/sequencer-engine.ts';
import { defaultEngineConfig } from '../_shared/sequencer-config.ts';
import type { OrgInputs, RoleId } from '../_shared/sequencer-types.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify super admin
    const { data: staff } = await supabase
      .from('staff')
      .select('is_super_admin')
      .eq('user_id', user.id)
      .single();

    if (!staff?.is_super_admin) {
      return new Response(JSON.stringify({ error: 'Forbidden - Super admin required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { roleId, inputs } = await req.json() as { roleId: RoleId; inputs: OrgInputs };

    if (![1, 2].includes(roleId)) {
      return new Response(JSON.stringify({ error: 'Invalid roleId' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Ensure inputs have required fields
    const timezone = inputs.timezone || 'America/Chicago';
    const effectiveDate = inputs.effectiveDate || new Date().toISOString().split('T')[0];
    
    const normalizedInputs: OrgInputs = {
      ...inputs,
      timezone,
      effectiveDate,
    };

    // 1. Store inputs snapshot
    await supabase
      .from('app_kv')
      .upsert({
        key: `sim:inputs:role:${roleId}`,
        value: normalizedInputs,
        updated_at: new Date().toISOString(),
      });

    // 2. Run engine to compute thisWeek + nextWeek
    const result = computeTwoWeeks(normalizedInputs, defaultEngineConfig);

    // 3. Build ranked list (exclude thisWeek picks)
    const thisWeekIds = new Set(result.next.picks.map(p => p.proMoveId));
    const ranked = inputs.eligibleMoves
      .filter(m => !thisWeekIds.has(m.id))
      .map(m => {
        // Score each move using the engine's scoring
        const confSample = inputs.confidenceHistory.find(c => c.proMoveId === m.id);
        const avg = confSample?.avg01 ?? 0.7;
        const finalScore = 1 - avg; // Simplified for now
        
        return {
          proMoveId: m.id,
          name: m.name,
          domainId: m.domainId,
          finalScore,
          drivers: ['C'] as Array<'C'|'R'|'E'|'D'|'M'>,
        };
      })
      .sort((a, b) => b.finalScore - a.finalScore);

    // 4. Store full two-week result
    const twoWeekData = {
      timezone: inputs.timezone,
      thisWeek: {
        weekStart: result.next.weekStart,
        picks: result.next.picks.map(p => ({
          proMoveId: p.proMoveId,
          name: p.name,
          domainId: p.domainId,
          finalScore: p.score,
          drivers: Object.entries(p.drivers)
            .filter(([_, v]) => v > 0)
            .map(([k]) => k) as Array<'C'|'R'|'E'|'D'|'M'>,
        })),
      },
      nextWeek: {
        weekStart: result.preview.weekStart,
        picks: result.preview.picks.map(p => ({
          proMoveId: p.proMoveId,
          name: p.name,
          domainId: p.domainId,
          finalScore: p.score,
          drivers: Object.entries(p.drivers)
            .filter(([_, v]) => v > 0)
            .map(([k]) => k) as Array<'C'|'R'|'E'|'D'|'M'>,
        })),
      },
      ranked,
      effectiveDate: inputs.effectiveDate || new Date().toISOString(),
    };

    await supabase
      .from('app_kv')
      .upsert({
        key: `sim:two_week:role:${roleId}`,
        value: twoWeekData,
        updated_at: new Date().toISOString(),
      });

    return new Response(JSON.stringify(twoWeekData), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('Error in sequencer-sim-upsert:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
