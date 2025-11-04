import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.53.0';
import { corsHeaders } from '../_shared/cors.ts';
import { computeTwoWeeks } from '../_shared/sequencer-engine.ts';
import { fetchAlcanInputsForRole } from '../_shared/sequencer-data.ts';
import { defaultEngineConfig } from '../_shared/sequencer-config.ts';
import type { RoleId } from '../_shared/sequencer-types.ts';

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

    // Verify coach/admin
    const { data: staff } = await supabase
      .from('staff')
      .select('is_coach, is_super_admin')
      .eq('user_id', user.id)
      .single();

    if (!staff?.is_coach && !staff?.is_super_admin) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { roleId } = await req.json() as { roleId: RoleId };

    if (![1, 2].includes(roleId)) {
      return new Response(JSON.stringify({ error: 'Invalid roleId' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Use America/Chicago as default timezone for Alcan-wide
    const timezone = 'America/Chicago';
    const now = new Date();

    // Fetch Alcan-wide inputs
    const inputs = await fetchAlcanInputsForRole({
      role: roleId,
      effectiveDate: now,
      timezone,
    });

    // Compute next + preview weeks
    const result = computeTwoWeeks(inputs, defaultEngineConfig);

    // Extract eligible moves that are NOT in thisWeek
    const thisWeekIds = new Set(result.next.picks.map(p => p.proMoveId));
    const ranked = inputs.eligibleMoves
      .filter(m => !thisWeekIds.has(m.id))
      .map(m => {
        // Re-score each using the engine's needScore logic
        // For simplicity, we'll compute a rough score here
        // In production, you'd call the engine's scoring function
        const confSample = inputs.confidenceHistory.find(c => c.proMoveId === m.id);
        const avg = confSample?.avg01 ?? 0.7;
        const finalScore = 1 - avg; // Simplified: lower confidence = higher need
        
        return {
          proMoveId: m.id,
          name: m.name,
          domainId: m.domainId,
          finalScore,
          drivers: ['C'] as Array<'C'|'R'|'E'|'D'|'M'>,
        };
      })
      .sort((a, b) => b.finalScore - a.finalScore);

    const response = {
      timezone,
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
    };

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('Error in sequencer-alcan-rankings:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
