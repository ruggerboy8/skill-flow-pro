import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  RECENCY_HORIZON,
  classifyConfidence,
  compareScoredMoves,
  scoreCandidate,
  scoreCandidateWithAdvancedState,
  type ScoringInputs,
} from '../_shared/sequencerScoring.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RankRequest {
  roleId: 1 | 2;
  // New planner contract
  asOfWeek?: string;
  lookbackWeeks?: number;
  preset?: 'balanced' | 'confidence_recovery' | 'eval_focus' | 'variety_first';
  constraints?: {
    minDistinctDomains?: number;
    cooldownWeeks?: number;
    excludeMoveIds?: number[];
  };
  // Legacy fields (backward compatible)
  effectiveDate?: string;
  timezone?: string;
  weights?: { C: number; R: number; E: number; D: number };
  cooldownWeeks?: number;
  diversityMinDomainsPerWeek?: number;
  recencyHorizonWeeks?: number;
  ebPrior?: number;
  ebK?: number;
  trimPct?: number;
  evalCap?: number;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    const body: RankRequest = await req.json();

    // Support both new planner contract and legacy contract
    const timezone = body.timezone || 'America/Chicago';
    const effectiveDate = body.asOfWeek || body.effectiveDate || new Date().toISOString().split('T')[0];
    const lookbackWeeks = body.lookbackWeeks ?? 9;
    const preset = body.preset || 'balanced';
    
    // Map presets to weights (B = curriculum priority, held constant at 0.10 as tiebreaker)
    const presetWeights: Record<string, { C: number; R: number; E: number; D: number; B: number }> = {
      balanced:            { C: 0.50, R: 0.22, E: 0.13, D: 0.05, B: 0.10 },
      confidence_recovery: { C: 0.62, R: 0.13, E: 0.10, D: 0.05, B: 0.10 },
      eval_focus:          { C: 0.37, R: 0.18, E: 0.30, D: 0.05, B: 0.10 },
      variety_first:       { C: 0.40, R: 0.18, E: 0.05, D: 0.27, B: 0.10 },
    };

    // Use preset weights if no custom weights provided
    // Legacy body.weights (no B) is wrapped to add B: 0.10
    const rawWeights = body.weights
      ? { ...body.weights, B: (body.weights as any).B ?? 0.10 }
      : presetWeights[preset] || presetWeights.balanced;
    let weights = rawWeights;
    const receivedWeights = JSON.stringify(body.weights || preset);
    const sum = weights.C + weights.R + weights.E + weights.D + weights.B;
    if (Math.abs(sum - 1.0) > 0.001) {
      weights = {
        C: weights.C / sum,
        R: weights.R / sum,
        E: weights.E / sum,
        D: weights.D / sum,
        B: weights.B / sum,
      };
    }

    const config = {
      weights,
      cooldownWeeks: body.constraints?.cooldownWeeks ?? body.cooldownWeeks ?? 4,
      diversityMinDomainsPerWeek: body.constraints?.minDistinctDomains ?? body.diversityMinDomainsPerWeek ?? 2,
      recencyHorizonWeeks: body.recencyHorizonWeeks ?? RECENCY_HORIZON,
      ebPrior: body.ebPrior ?? 0.70,
      ebK: body.ebK ?? 20,
      trimPct: body.trimPct ?? 0.05,
      evalCap: body.evalCap ?? 0.25,
      excludeMoveIds: body.constraints?.excludeMoveIds ?? [],
    };

    const logs: string[] = [];
    const rankVersion = 'v5.0-curriculum-priority'; // v5: added B (curriculum_priority) component
    const rulesApplied: string[] = [
      `cooldown=${config.cooldownWeeks}w`,
      `minDistinctDomains=${config.diversityMinDomainsPerWeek}`,
      `lookback=${lookbackWeeks}w`,
    ];
    
    logs.push(`Starting ranking for role ${body.roleId} on ${effectiveDate} (${preset})`);
    logs.push(`Received: ${receivedWeights}`);
    logs.push(`Normalized weights: C=${weights.C.toFixed(3)}, R=${weights.R.toFixed(3)}, E=${weights.E.toFixed(3)}, D=${weights.D.toFixed(3)}, B=${weights.B.toFixed(3)}`);
    if (weights.R === 0) {
      logs.push('Recency disabled (wR=0) - cooldown and diversity still apply');
    }

    // Calculate cutoff dates
    const effectiveDateObj = new Date(effectiveDate);
    const cutoffLookback = new Date(effectiveDateObj);
    cutoffLookback.setDate(cutoffLookback.getDate() - lookbackWeeks * 7);
    const cutoff8w = new Date(effectiveDateObj);
    cutoff8w.setDate(cutoff8w.getDate() - 8 * 7);

    // 1. Fetch eligible moves — prefer org_visible_pro_moves RPC when orgId provided
    const practiceType = (body as any).practiceType as string | undefined;
    const orgId = (body as any).orgId as string | undefined;

    let eligible: any[] = [];

    if (orgId) {
      // Server-resolved: uses org practice_type + hidden overrides + org-custom moves
      const { data: orgMoves, error: orgErr } = await supabase
        .rpc('org_visible_pro_moves', { p_org_id: orgId, p_role_id: body.roleId });
      if (orgErr) throw orgErr;
      eligible = (orgMoves || []).map((m: any) => ({
        actionId: m.action_id,
        statement: m.action_statement,
        competencyId: m.competency_id,
        curriculumPriority: m.curriculum_priority ?? null,
      }));
      logs.push(`Using org_visible_pro_moves RPC for org ${orgId}: ${eligible.length} moves`);

      // Supplement with curriculum_priority if RPC didn't return it
      if (eligible.some((m: any) => m.curriculumPriority === null) && eligible.length > 0) {
        const actionIds = eligible.map((m: any) => m.actionId);
        const { data: cpData } = await supabase
          .from('pro_moves')
          .select('action_id, curriculum_priority')
          .in('action_id', actionIds);
        const cpMap = new Map((cpData || []).map((r: any) => [r.action_id, r.curriculum_priority]));
        eligible = eligible.map((m: any) => ({
          ...m,
          curriculumPriority: cpMap.has(m.actionId) ? cpMap.get(m.actionId) : m.curriculumPriority,
        }));
      }
    } else {
      // Legacy path: client-provided practiceType filter
      let movesQuery = supabase
        .from('pro_moves')
        .select('action_id, action_statement, competency_id, curriculum_priority')
        .eq('active', true)
        .eq('role_id', body.roleId);

      if (practiceType) {
        movesQuery = movesQuery.contains('practice_types', [practiceType]);
        logs.push(`Filtering pro moves by practice_type: ${practiceType}`);
      }

      const { data: eligibleMoves, error: movesError } = await movesQuery;
      if (movesError) throw movesError;

      eligible = (eligibleMoves || []).map((m: any) => ({
        actionId: m.action_id,
        statement: m.action_statement,
        competencyId: m.competency_id,
        curriculumPriority: m.curriculum_priority ?? null,
      }));
    }

    // 1b. Fetch competencies with domains separately
    const competencyIds = [...new Set(eligible.map((m: any) => m.competencyId))];
    const { data: competencies, error: compError } = await supabase
      .from('competencies')
      .select('competency_id, domain_id, domains!competencies_domain_id_fkey(domain_name)')
      .in('competency_id', competencyIds);

    if (compError) throw compError;

    // Build competency lookup map
    const competencyMap = new Map(
      competencies?.map((c: any) => [
        c.competency_id,
        { domainId: c.domain_id, domainName: c.domains.domain_name }
      ]) || []
    );

    let eligibleFinal = eligible.map((m: any) => {
      const comp = competencyMap.get(m.competencyId);
      return {
        id: m.actionId,
        name: m.statement,
        competencyId: m.competencyId,
        domainId: comp?.domainId || 0,
        domainName: comp?.domainName || 'Unknown',
        curriculumPriority: m.curriculumPriority,
      };
    });

    // Apply exclusions
    if (config.excludeMoveIds.length > 0) {
      eligibleFinal = eligibleFinal.filter(m => !config.excludeMoveIds.includes(m.id));
      logs.push(`Excluded ${config.excludeMoveIds.length} moves, ${eligibleFinal.length} remaining`);
    }

    logs.push(`Found ${eligibleFinal.length} eligible moves`);

    // Helper: classify confidence status lives in ../_shared/sequencerScoring.ts

    // 2. Fetch confidence history (lookback weeks).
    // weekly_scores.site_action_id is now backfilled for ALL eras (2026-07-25
    // migration backfill_site_action_id_from_legacy_sources), so scores are
    // self-describing — the retired weekly_focus/weekly_plan tables are no
    // longer consulted. weekly_assignments remains as a safety-net mapping.
    const { data: confData, error: confError } = await supabase
      .from('weekly_scores')
      .select('confidence_score, confidence_date, weekly_focus_id, assignment_id, site_action_id, selected_action_id')
      .not('confidence_score', 'is', null)
      .gte('confidence_date', cutoffLookback.toISOString());

    if (confError) throw confError;

    logs.push(`Fetched ${confData?.length || 0} confidence scores`);

    const focusIdToActionId = new Map<string, number>();

    // Safety-net: map assign:<uuid> ids via weekly_assignments for any row
    // missing site_action_id.
    const allAssignmentIds = [...new Set(
      confData?.filter((r: any) => !r.site_action_id && !r.selected_action_id)
        .map((r: any) => r.assignment_id).filter(Boolean)
    )];
    const assignIds = allAssignmentIds
      .filter(id => id.startsWith('assign:'))
      .map(id => id.replace('assign:', ''));

    if (assignIds.length > 0) {
      const { data: assignRows } = await supabase
        .from('weekly_assignments')
        .select('id, action_id')
        .eq('role_id', body.roleId)
        .in('id', assignIds);
      
      assignRows?.forEach((row: any) => {
        if (row.action_id) focusIdToActionId.set(`assign:${row.id}`, row.action_id);
      });
      logs.push(`Mapped ${assignRows?.length || 0} weekly_assignments IDs to action_ids (for score resolution)`);
    }

    // Group by pro_move and week
    const confidenceMap = new Map<string, { sum: number; count: number }>();
    confData?.forEach((row: any) => {
      // site_action_id is authoritative; selected_action_id covers self-era
      // rows; the assignments map is the safety net.
      const lookupKey = row.assignment_id || row.weekly_focus_id;
      const actionId = row.site_action_id ?? row.selected_action_id ?? focusIdToActionId.get(lookupKey);
      if (!actionId) return; // Skip if we couldn't map to action_id

      const weekStart = new Date(row.confidence_date);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1); // Monday
      const key = `${actionId}-${weekStart.toISOString().split('T')[0]}`;
      const existing = confidenceMap.get(key) || { sum: 0, count: 0 };
      confidenceMap.set(key, {
        // PHASE 1 FIX: Correct confidence normalization (1→0%, 2→33%, 3→67%, 4→100%)
        sum: existing.sum + (row.confidence_score - 1) / 3.0,
        count: existing.count + 1,
      });
    });

    const confidenceHistory = Array.from(confidenceMap.entries()).map(([key, val]) => {
      // Split only on first dash to preserve date format (e.g., "4-2025-10-27")
      const dashIndex = key.indexOf('-');
      const proMoveId = key.substring(0, dashIndex);
      const weekStart = key.substring(dashIndex + 1);
      return {
        proMoveId: Number(proMoveId),
        weekStart,
        avg: val.sum / val.count,
        n: val.count,
      };
    });

    logs.push(`Collected ${confidenceHistory.length} confidence data points`);

    // Track individual low-confidence counts (scores ≤ 2 on 1-4 scale)
    const individualLowCounts = new Map<number, { lowCount: number; totalCount: number }>();
    confData?.forEach((row: any) => {
      const lookupKey = row.assignment_id || row.weekly_focus_id;
      const actionId = row.site_action_id ?? row.selected_action_id ?? focusIdToActionId.get(lookupKey);
      if (!actionId) return;

      const existing = individualLowCounts.get(actionId) || { lowCount: 0, totalCount: 0 };
      const isLow = row.confidence_score <= 2; // 1-4 scale
      individualLowCounts.set(actionId, {
        lowCount: existing.lowCount + (isLow ? 1 : 0),
        totalCount: existing.totalCount + 1
      });
    });

    // 3. Fetch latest quarterly evals (Alcan-wide per role)
    const { data: evalData, error: evalError } = await supabase.rpc(
      'seq_latest_quarterly_evals',
      { role_id_arg: body.roleId }
    );
    if (evalError) console.warn('Eval fetch failed:', evalError);

    const evals = evalData?.map((e: any) => ({
      competencyId: e.competency_id,
      score: e.score, // already 0..1
    })) || [];

    logs.push(`Found ${evals.length} eval scores`);

    // 4. Fetch last selected - UNIFIED: only query weekly_assignments (single source of truth)
    const { data: lastSelectedAssign, error: lsAssignError } = await supabase
      .from('weekly_assignments')
      .select('action_id, week_start_date')
      .eq('role_id', body.roleId)
      .not('action_id', 'is', null)
      .not('week_start_date', 'is', null)
      .order('week_start_date', { ascending: false });

    if (lsAssignError) throw lsAssignError;

    // Build map from unified source (keep most recent per action_id)
    const lastSelectedMap = new Map<number, string>();
    lastSelectedAssign?.forEach((row: any) => {
      if (!lastSelectedMap.has(row.action_id)) {
        lastSelectedMap.set(row.action_id, row.week_start_date);
      }
    });

    const lastSelected = Array.from(lastSelectedMap.entries()).map(([proMoveId, weekStart]) => ({
      proMoveId,
      weekStart,
    }));

    logs.push(`Last selected records: ${lastSelectedAssign?.length || 0} from weekly_assignments, ${lastSelected.length} unique moves`);
    
    // Log never-seen moves
    const neverSeen = eligibleFinal.filter(m => !lastSelected.some(ls => ls.proMoveId === m.id));
    logs.push(`Never assigned moves: ${neverSeen.length} (e.g., ${neverSeen.slice(0, 3).map(m => m.name).join(', ')})`);
    
    // Log sample confidence data
    logs.push(`Total confidence records: ${confidenceHistory.length}`);
    const movesWithConf = new Set(confidenceHistory.map(c => c.proMoveId));
    logs.push(`Moves with confidence data: ${movesWithConf.size}/${eligibleFinal.length}`);

    // 5. Fetch domain coverage (last 8 weeks) - UNIFIED: only query weekly_assignments
    const { data: domainCoverageAssign, error: dcAssignError } = await supabase
      .from('weekly_assignments')
      .select('action_id, week_start_date')
      .eq('role_id', body.roleId)
      .not('action_id', 'is', null)
      .not('week_start_date', 'is', null)
      .gte('week_start_date', cutoff8w.toISOString().split('T')[0]);

    if (dcAssignError) throw dcAssignError;

    const domainCoverageMap = new Map<number, Set<string>>();
    domainCoverageAssign?.forEach((row: any) => {
      const move = eligibleFinal.find(m => m.id === row.action_id);
      if (move) {
        const weeks = domainCoverageMap.get(move.domainId) || new Set();
        weeks.add(row.week_start_date);
        domainCoverageMap.set(move.domainId, weeks);
      }
    });

    const domainCoverage = Array.from(domainCoverageMap.entries()).map(([domainId, weeks]) => ({
      domainId,
      appearances: weeks.size,
    }));

    logs.push(`Domain coverage: ${domainCoverage.length} domains tracked (${domainCoverageAssign?.length || 0} records from weekly_assignments)`);

    // Add sample move logging
    if (eligibleFinal.length > 0) {
      logs.push(`Sample move for introspection: ${eligibleFinal[0].name} (id=${eligibleFinal[0].id})`);
    }

    // Pure scoring inputs for the shared module (see ../_shared/sequencerScoring.ts).
    // All the math lives there so it can be unit tested outside Deno.
    const scoringInputs: ScoringInputs = {
      confidenceHistory,
      individualLowCounts,
      evals,
      lastSelected,
      domainCoverage,
      weights,
      config,
    };

    // Compute Next
    const scored = eligibleFinal.map(move => ({ ...move, ...scoreCandidate(move, effectiveDate, scoringInputs) }));

    // Enhanced deterministic tie-breaks: finalScore → lowConfShare → lastPracticedWeeks desc → actionId asc
    scored.sort(compareScoredMoves);

    // Log sample breakdown
    if (scored.length > 0) {
      const sample = scored[0];
      logs.push(`Sample breakdown [${sample.name}]:`);
      logs.push(`  Raw: C=${sample.C.toFixed(3)}, R=${sample.R.toFixed(3)}, E_raw=${sample.E.toFixed(3)}, D=${sample.D.toFixed(3)}, T=${sample.T.toFixed(3)}`);
      logs.push(`  Weighted: C*w=${(sample.C * weights.C).toFixed(3)}, R*w=${(sample.R * weights.R).toFixed(3)}, E_contrib=${sample.eContrib.toFixed(3)}, D*w=${(sample.D * weights.D).toFixed(3)}, T=${sample.T.toFixed(3)}, B*w=${(sample.B * weights.B).toFixed(3)}`);
      logs.push(`  Final: ${sample.final.toFixed(3)}, Drivers: ${sample.drivers.join(', ')}`);
    }

    // Apply cooldown and pick top 6 for planner
    const eligibleNext = scored.filter(m => m.weeksSince >= config.cooldownWeeks);
    const nextPicks: typeof scored = [];
    const usedDomains = new Set<number>();
    let relaxedConstraintNote: string | null = null;

    if (eligibleNext.length > 0) {
      nextPicks.push(eligibleNext[0]);
      usedDomains.add(eligibleNext[0].domainId);
    }

    // Pick up to 6 with diversity preference
    for (let i = 1; i < eligibleNext.length && nextPicks.length < 6; i++) {
      const candidate = eligibleNext[i];
      if (usedDomains.size < config.diversityMinDomainsPerWeek && usedDomains.has(candidate.domainId)) {
        continue;
      }
      nextPicks.push(candidate);
      usedDomains.add(candidate.domainId);
    }

    // Relax diversity if needed to reach 6
    if (nextPicks.length < 6) {
      logs.push('Relaxing diversity constraint to complete Top 6');
      relaxedConstraintNote = 'Not enough candidates under current constraints; diversity requirements were relaxed to complete Top 6.';
      for (let i = 1; i < eligibleNext.length && nextPicks.length < 6; i++) {
        if (!nextPicks.find(p => p.id === eligibleNext[i].id)) {
          nextPicks.push(eligibleNext[i]);
        }
      }
    }
    
    // If still under 6, note it
    if (nextPicks.length < 6) {
      relaxedConstraintNote = `Only ${nextPicks.length} candidates available after applying cooldown. Consider reducing cooldown weeks or expanding the pro-move library.`;
    }

    // Compute Preview (advance state)
    const previewDate = new Date(effectiveDateObj);
    previewDate.setDate(previewDate.getDate() + 7);
    const previewDateStr = previewDate.toISOString().split('T')[0];

    // Clone and advance lastSelected for preview
    const advancedLastSelected = lastSelected
      .filter(ls => !nextPicks.find(p => p.id === ls.proMoveId))
      .concat(nextPicks.map(p => ({ proMoveId: p.id, weekStart: effectiveDate })));

    // Score all moves for preview
    const previewScored = eligibleFinal.map(move => ({
      ...move,
      ...scoreCandidateWithAdvancedState(move, previewDateStr, advancedLastSelected, scoringInputs),
    }));
    previewScored.sort(compareScoredMoves);

    const previewEligible = previewScored.filter(m => m.weeksSince >= config.cooldownWeeks);
    const previewPicks = [];
    const previewUsedDomains = new Set<number>();

    if (previewEligible.length > 0) {
      previewPicks.push(previewEligible[0]);
      previewUsedDomains.add(previewEligible[0].domainId);
    }

    for (let i = 1; i < previewEligible.length && previewPicks.length < 6; i++) {
      const candidate = previewEligible[i];
      if (previewUsedDomains.size < config.diversityMinDomainsPerWeek && previewUsedDomains.has(candidate.domainId)) {
        continue;
      }
      previewPicks.push(candidate);
      previewUsedDomains.add(candidate.domainId);
    }

    if (previewPicks.length < 6) {
      for (let i = 1; i < previewEligible.length && previewPicks.length < 6; i++) {
        if (!previewPicks.find(p => p.id === previewEligible[i].id)) {
          previewPicks.push(previewEligible[i]);
        }
      }
    }

    logs.push(`Completed ranking: Next ${nextPicks.length} picks, Preview ${previewPicks.length} picks`);

    // Format response (new planner format)
    const formatRow = (m: any, rank: number) => ({
      rank,
      proMoveId: m.id,
      name: m.name,
      domainId: m.domainId,
      domainName: m.domainName,
      parts: {
        C: m.C,
        R: m.R,
        E: m.E,
        D: m.D,
        T: m.T,
        B: m.B,
      },
      finalScore: Math.round(m.final * 100),
      drivers: m.drivers,
      lastSeen: lastSelected.find(ls => ls.proMoveId === m.id)?.weekStart || null,
      weeksSinceSeen: m.weeksSince,
      confidenceN: confidenceHistory.filter(h => h.proMoveId === m.id).reduce((sum, h) => sum + h.n, 0),
      status: classifyConfidence(m.C, confidenceHistory.filter(h => h.proMoveId === m.id)).status,
      lowConfShare: m.lowConfShare,
      avgConfLast: m.avgConfLast,
      lastPracticedWeeks: m.weeksSince,
      retestDue: m.retestDue,
      primaryReasonCode: m.primaryReasonCode,
      primaryReasonValue: m.primaryReasonValue,
    });

    // New planner response format
    const plannerResponse = {
      meta: {
        rankVersion,
        asOfWeek: effectiveDate,
        roleId: body.roleId,
        preset,
        rulesApplied,
        relaxedConstraintNote,
      },
      next: nextPicks.map((m, i) => formatRow(m, i + 1)),
      preview: previewPicks.map((m, i) => formatRow(m, i + 1)),
      full: scored.slice(0, 50).map((m, i) => formatRow(m, i + 1)),
      logs,
    };

    // Legacy response format for backward compatibility
    const legacyResponse = {
      ranked: scored.map((m, i) => ({
        rank: i + 1,
        proMoveId: m.id,
        name: m.name,
        domainId: m.domainId,
        domainName: m.domainName,
        parts: { C: m.C, R: m.R, E: m.E, D: m.D, T: m.T, B: m.B },
        finalScore: Math.round(m.final * 100),
        drivers: m.drivers,
        lastSeen: lastSelected.find(ls => ls.proMoveId === m.id)?.weekStart || null,
        weeksSinceSeen: m.weeksSince,
        confidenceN: confidenceHistory.filter(h => h.proMoveId === m.id).reduce((sum, h) => sum + h.n, 0),
        status: classifyConfidence(m.C, confidenceHistory.filter(h => h.proMoveId === m.id)).status,
        lowConfShare: m.lowConfShare,
        avgConfLast: m.avgConfLast,
        lastPracticedWeeks: m.weeksSince,
        retestDue: m.retestDue,
        primaryReasonCode: m.primaryReasonCode,
        primaryReasonValue: m.primaryReasonValue,
      })),
      next: nextPicks.map((m, i) => formatRow(m, i + 1)),
      preview: previewPicks.map((m, i) => formatRow(m, i + 1)),
      logs,
      meta: {
        rankVersion,
        asOfWeek: effectiveDate,
        roleId: body.roleId,
        preset,
        rulesApplied,
        relaxedConstraintNote,
      },
    };

    // Return combined response (supports both new and legacy consumers)
    return new Response(
      JSON.stringify({ ...legacyResponse, ...plannerResponse }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
