import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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
    
    // Map presets to weights
    const presetWeights: Record<string, { C: number; R: number; E: number; D: number }> = {
      balanced: { C: 0.50, R: 0.30, E: 0.15, D: 0.05 },
      confidence_recovery: { C: 0.70, R: 0.15, E: 0.10, D: 0.05 },
      eval_focus: { C: 0.35, R: 0.20, E: 0.40, D: 0.05 },
      variety_first: { C: 0.40, R: 0.20, E: 0.10, D: 0.30 },
    };
    
    // Use preset weights if no custom weights provided
    let weights = body.weights || presetWeights[preset] || presetWeights.balanced;
    const receivedWeights = JSON.stringify(body.weights || preset);
    const sum = weights.C + weights.R + weights.E + weights.D;
    if (Math.abs(sum - 1.0) > 0.001) {
      weights = {
        C: weights.C / sum,
        R: weights.R / sum,
        E: weights.E / sum,
        D: weights.D / sum,
      };
    }

    const config = {
      weights,
      cooldownWeeks: body.constraints?.cooldownWeeks ?? body.cooldownWeeks ?? 4,
      diversityMinDomainsPerWeek: body.constraints?.minDistinctDomains ?? body.diversityMinDomainsPerWeek ?? 2,
      recencyHorizonWeeks: body.recencyHorizonWeeks ?? 0,
      ebPrior: body.ebPrior ?? 0.70,
      ebK: body.ebK ?? 20,
      trimPct: body.trimPct ?? 0.05,
      evalCap: body.evalCap ?? 0.25,
      excludeMoveIds: body.constraints?.excludeMoveIds ?? [],
    };

    const logs: string[] = [];
    const rankVersion = 'v3.3';
    const rulesApplied: string[] = [
      `cooldown=${config.cooldownWeeks}w`,
      `minDistinctDomains=${config.diversityMinDomainsPerWeek}`,
      `lookback=${lookbackWeeks}w`,
    ];
    
    logs.push(`Starting ranking for role ${body.roleId} on ${effectiveDate} (${preset})`);
    logs.push(`Received: ${receivedWeights}`);
    logs.push(`Normalized weights: C=${weights.C.toFixed(3)}, R=${weights.R.toFixed(3)}, E=${weights.E.toFixed(3)}, D=${weights.D.toFixed(3)}`);
    if (weights.R === 0) {
      logs.push('Recency disabled (wR=0) - cooldown and diversity still apply');
    }

    // Calculate cutoff dates
    const effectiveDateObj = new Date(effectiveDate);
    const cutoffLookback = new Date(effectiveDateObj);
    cutoffLookback.setDate(cutoffLookback.getDate() - lookbackWeeks * 7);
    const cutoff8w = new Date(effectiveDateObj);
    cutoff8w.setDate(cutoff8w.getDate() - 8 * 7);

    // 1. Fetch eligible moves with competencies
    const { data: eligibleMoves, error: movesError } = await supabase
      .from('pro_moves')
      .select('action_id, action_statement, competency_id')
      .eq('active', true)
      .eq('role_id', body.roleId);

    if (movesError) throw movesError;

    // 1b. Fetch competencies with domains separately
    const competencyIds = eligibleMoves?.map((m: any) => m.competency_id) || [];
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

    let eligible = eligibleMoves?.map((m: any) => {
      const comp = competencyMap.get(m.competency_id);
      return {
        id: m.action_id,
        name: m.action_statement,
        competencyId: m.competency_id,
        domainId: comp?.domainId || 0,
        domainName: comp?.domainName || 'Unknown',
      };
    }) || [];

    // Apply exclusions
    if (config.excludeMoveIds.length > 0) {
      eligible = eligible.filter(m => !config.excludeMoveIds.includes(m.id));
      logs.push(`Excluded ${config.excludeMoveIds.length} moves, ${eligible.length} remaining`);
    }

    logs.push(`Found ${eligible.length} eligible moves`);

    // Helper: classify confidence status
    const classifyConfidence = (
      confEB: number,
      recent: { avg: number; n: number }[]
    ): { status: 'critical'|'watch'|'ok'; severity?: number; n2w?: number; recentMeans?: number[] } => {
      const lastTwo = recent.slice(-2);
      const n2w = lastTwo.reduce((s,r)=>s+(r?.n||0), 0);
      const recentMeans = lastTwo.map(r => r?.avg ?? 0);

      const isCritical = confEB <= 0.20 && n2w >= 10;
      if (isCritical) {
        const severity = Math.max(0, Math.min(1, (0.25 - confEB) / 0.25));
        return { status: 'critical', severity, n2w, recentMeans };
      }

      const anyVeryLow = lastTwo.some(r => (r?.avg ?? 1) <= 0.20 && (r?.n ?? 0) >= 5);
      const isWatch = confEB <= 0.30 || anyVeryLow;
      if (isWatch) return { status: 'watch', n2w, recentMeans };

      return { status: 'ok', n2w, recentMeans };
    };

    // 2. Fetch confidence history (lookback weeks) - handle both weekly_focus and weekly_plan
    // Note: We explicitly select columns to avoid PostgREST auto-join attempts
    const { data: confData, error: confError } = await supabase
      .from('weekly_scores')
      .select('confidence_score, confidence_date, weekly_focus_id')
      .not('confidence_score', 'is', null)
      .gte('confidence_date', cutoffLookback.toISOString());

    if (confError) throw confError;

    logs.push(`Fetched ${confData?.length || 0} confidence scores`);

    // Parse weekly_focus_id to get action_id (handles both UUID and plan:XXX formats)
    const focusIdToActionId = new Map<string, number>();
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    
    // Collect all unique focus IDs
    const allFocusIds = [...new Set(confData?.map((r: any) => r.weekly_focus_id).filter(Boolean))];
    
    // Split into UUID and plan:XXX formats
    const uuidIds = allFocusIds.filter(id => uuidPattern.test(id));
    const planIds = allFocusIds
      .filter(id => id.startsWith('plan:'))
      .map(id => id.replace('plan:', ''));

    // Batch fetch action_ids from weekly_focus (Cycles 1-3)
    if (uuidIds.length > 0) {
      const { data: focusRows } = await supabase
        .from('weekly_focus')
        .select('id, action_id')
        .eq('role_id', body.roleId)
        .in('id', uuidIds);
      
      focusRows?.forEach((row: any) => {
        if (row.action_id) focusIdToActionId.set(row.id, row.action_id);
      });
      logs.push(`Mapped ${focusRows?.length || 0} weekly_focus IDs to action_ids`);
    }

    // Batch fetch action_ids from weekly_plan (Cycle 4+)
    if (planIds.length > 0) {
      const { data: planRows } = await supabase
        .from('weekly_plan')
        .select('id, action_id')
        .eq('role_id', body.roleId)
        .in('id', planIds);
      
      planRows?.forEach((row: any) => {
        if (row.action_id) focusIdToActionId.set(`plan:${row.id}`, row.action_id);
      });
      logs.push(`Mapped ${planRows?.length || 0} weekly_plan IDs to action_ids`);
    }

    // Group by pro_move and week
    const confidenceMap = new Map<string, { sum: number; count: number }>();
    confData?.forEach((row: any) => {
      const actionId = focusIdToActionId.get(row.weekly_focus_id);
      if (!actionId) return; // Skip if we couldn't map to action_id
      
      const weekStart = new Date(row.confidence_date);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1); // Monday
      const key = `${actionId}-${weekStart.toISOString().split('T')[0]}`;
      const existing = confidenceMap.get(key) || { sum: 0, count: 0 };
      confidenceMap.set(key, {
        sum: existing.sum + row.confidence_score / 10.0,
        count: existing.count + 1,
      });
    });

    const confidenceHistory = Array.from(confidenceMap.entries()).map(([key, val]) => {
      const [proMoveId, weekStart] = key.split('-');
      return {
        proMoveId: Number(proMoveId),
        weekStart,
        avg: val.sum / val.count,
        n: val.count,
      };
    });

    logs.push(`Collected ${confidenceHistory.length} confidence data points`);

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

    // 4. Fetch last selected - handle both weekly_focus and weekly_plan
    // For weekly_focus: use week_start_date if available
    const { data: lastSelectedFocus, error: lsFocusError } = await supabase
      .from('weekly_focus')
      .select('action_id, week_start_date')
      .eq('role_id', body.roleId)
      .not('action_id', 'is', null)
      .not('week_start_date', 'is', null)
      .order('week_start_date', { ascending: false });

    if (lsFocusError) throw lsFocusError;

    // For weekly_plan: use week_start_date (global plans)
    const { data: lastSelectedPlan, error: lsPlanError } = await supabase
      .from('weekly_plan')
      .select('action_id, week_start_date')
      .eq('role_id', body.roleId)
      .is('org_id', null)
      .not('action_id', 'is', null)
      .not('week_start_date', 'is', null)
      .order('week_start_date', { ascending: false });

    if (lsPlanError) throw lsPlanError;

    // Merge and deduplicate (keep most recent per action_id)
    const lastSelectedMap = new Map<number, string>();
    
    // Add from focus first
    lastSelectedFocus?.forEach((row: any) => {
      if (!lastSelectedMap.has(row.action_id)) {
        lastSelectedMap.set(row.action_id, row.week_start_date);
      }
    });

    // Add from plan (may override if more recent)
    lastSelectedPlan?.forEach((row: any) => {
      const existing = lastSelectedMap.get(row.action_id);
      if (!existing || row.week_start_date > existing) {
        lastSelectedMap.set(row.action_id, row.week_start_date);
      }
    });

    const lastSelected = Array.from(lastSelectedMap.entries()).map(([proMoveId, weekStart]) => ({
      proMoveId,
      weekStart,
    }));

    logs.push(`Found ${lastSelected.length} last-selected records (${lastSelectedFocus?.length || 0} focus + ${lastSelectedPlan?.length || 0} plan)`);

    // 5. Fetch domain coverage (last 8 weeks) - handle both weekly_focus and weekly_plan
    // From weekly_focus
    const { data: domainCoverageFocus, error: dcFocusError } = await supabase
      .from('weekly_focus')
      .select('action_id, week_start_date')
      .eq('role_id', body.roleId)
      .not('action_id', 'is', null)
      .not('week_start_date', 'is', null)
      .gte('week_start_date', cutoff8w.toISOString().split('T')[0]);

    if (dcFocusError) throw dcFocusError;

    // From weekly_plan (global)
    const { data: domainCoveragePlan, error: dcPlanError } = await supabase
      .from('weekly_plan')
      .select('action_id, week_start_date')
      .eq('role_id', body.roleId)
      .is('org_id', null)
      .not('action_id', 'is', null)
      .not('week_start_date', 'is', null)
      .gte('week_start_date', cutoff8w.toISOString().split('T')[0]);

    if (dcPlanError) throw dcPlanError;

    // Merge both sources
    const allCoverageData = [
      ...(domainCoverageFocus || []),
      ...(domainCoveragePlan || [])
    ];

    const domainCoverageMap = new Map<number, Set<string>>();
    allCoverageData.forEach((row: any) => {
      const move = eligible.find(m => m.id === row.action_id);
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

    logs.push(`Domain coverage: ${domainCoverage.length} domains tracked (${domainCoverageFocus?.length || 0} focus + ${domainCoveragePlan?.length || 0} plan)`);

    // Add sample move logging
    if (eligible.length > 0) {
      logs.push(`Sample move for introspection: ${eligible[0].name} (id=${eligible[0].id})`);
    }

    // Import and run engine (inline for now since we can't import from src/)
    // We'll compute directly here
    const inputs = {
      eligibleMoves: eligible,
      confidenceHistory,
      evals,
      lastSelected,
      domainCoverage,
      effectiveDate,
      timezone,
    };

    // Score function
    const scoreCandidate = (move: any, referenceDate: string) => {
      // C (Confidence)
      const confData = confidenceHistory.filter(h => h.proMoveId === move.id);
      let smoothedConf = config.ebPrior;
      if (confData.length > 0) {
        const trimCount = Math.floor(confData.length * config.trimPct);
        const sorted = confData.map(d => d.avg).sort((a, b) => a - b);
        const trimmed = sorted.slice(trimCount, sorted.length - trimCount);
        const sampleMean = trimmed.reduce((sum, v) => sum + v, 0) / trimmed.length;
        const totalN = confData.reduce((sum, d) => sum + d.n, 0);
        smoothedConf = (config.ebPrior * config.ebK + sampleMean * totalN) / (config.ebK + totalN);
      }
      const C = 1 - smoothedConf;

      // R (Recency) - Linear post-cooldown
      const lastSeenRecord = lastSelected.find(ls => ls.proMoveId === move.id);
      const weeksSince = lastSeenRecord
        ? Math.floor((new Date(referenceDate).getTime() - new Date(lastSeenRecord.weekStart).getTime()) / (7 * 24 * 60 * 60 * 1000))
        : 999;
      const horizon = config.recencyHorizonWeeks === 0 ? 12 : config.recencyHorizonWeeks;
      const cooldown = config.cooldownWeeks;
      const R = weeksSince <= cooldown ? 0
              : weeksSince >= horizon  ? 1
              : (weeksSince - cooldown) / (horizon - cooldown);

      // E (Eval) - Deficit with capped contribution
      const evalRecord = evals.find(e => e.competencyId === move.competencyId);
      const evalScore01 = evalRecord?.score; // 0..1 (1=good, undefined=no data)
      const E_raw = evalScore01 == null ? 0 : Math.max(0, 1 - evalScore01); // deficit
      const eContrib = Math.min(E_raw * weights.E, config.evalCap); // cap contribution

      // D (Domain)
      const domainRecord = domainCoverage.find(dc => dc.domainId === move.domainId);
      const appearances = domainRecord ? domainRecord.appearances : 0;
      const D = 1 - Math.min(appearances / 8, 1);

      const final = (C * weights.C) + (R * weights.R) + (D * weights.D) + eContrib;

      const components = [
        { key: 'C', value: C * weights.C },
        { key: 'R', value: R * weights.R },
        { key: 'E', value: eContrib }, // Use capped contribution for drivers
        { key: 'D', value: D * weights.D },
      ];
      components.sort((a, b) => b.value - a.value);
      const drivers = components.slice(0, 2).map(c => c.key);

      return { C, R, E: E_raw, D, eContrib, final, drivers, weeksSince };
    };

    // Compute Next
    const scored = eligible.map(move => ({ ...move, ...scoreCandidate(move, effectiveDate) }));
    
    // Enhanced deterministic tie-breaks
    scored.sort((a, b) => {
      // 1. Final score desc
      if (Math.abs(b.final - a.final) >= 0.0001) return b.final - a.final;
      // 2. Eval contribution desc (bigger gap wins)
      if (Math.abs(b.eContrib - a.eContrib) >= 0.0001) return b.eContrib - a.eContrib;
      // 3. Confidence component desc
      const cA = a.C * weights.C;
      const cB = b.C * weights.C;
      if (Math.abs(cB - cA) >= 0.0001) return cB - cA;
      // 4. Weeks since seen desc (longer = higher priority)
      if (a.weeksSince !== b.weeksSince) return b.weeksSince - a.weeksSince;
      // 5. ID asc (deterministic)
      return a.id - b.id;
    });

    // Log sample breakdown
    if (scored.length > 0) {
      const sample = scored[0];
      logs.push(`Sample breakdown [${sample.name}]:`);
      logs.push(`  Raw: C=${sample.C.toFixed(3)}, R=${sample.R.toFixed(3)}, E_raw=${sample.E.toFixed(3)}, D=${sample.D.toFixed(3)}`);
      logs.push(`  Weighted: C*w=${(sample.C * weights.C).toFixed(3)}, R*w=${(sample.R * weights.R).toFixed(3)}, E_contrib=${sample.eContrib.toFixed(3)}, D*w=${(sample.D * weights.D).toFixed(3)}`);
      logs.push(`  Final: ${sample.final.toFixed(3)}, Drivers: ${sample.drivers.join(', ')}`);
    }

    // Apply cooldown and pick top 6 for planner
    const eligibleNext = scored.filter(m => m.weeksSince >= config.cooldownWeeks);
    const nextPicks = [];
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

    const advancedLastSelected = [
      ...lastSelected.filter(ls => !nextPicks.find(p => p.id === ls.proMoveId)),
      ...nextPicks.map(p => ({ proMoveId: p.id, weekStart: effectiveDate })),
    ];

    const scoredPreview = eligible.map(move => {
      const ls = advancedLastSelected.find(l => l.proMoveId === move.id);
      const weeksSince = ls
        ? Math.floor((new Date(previewDateStr).getTime() - new Date(ls.weekStart).getTime()) / (7 * 24 * 60 * 60 * 1000))
        : 999;
      
      // Recompute with advanced lastSelected
      const confData = confidenceHistory.filter(h => h.proMoveId === move.id);
      let smoothedConf = config.ebPrior;
      if (confData.length > 0) {
        const trimCount = Math.floor(confData.length * config.trimPct);
        const sorted = confData.map(d => d.avg).sort((a, b) => a - b);
        const trimmed = sorted.slice(trimCount, sorted.length - trimCount);
        const sampleMean = trimmed.reduce((sum, v) => sum + v, 0) / trimmed.length;
        const totalN = confData.reduce((sum, d) => sum + d.n, 0);
        smoothedConf = (config.ebPrior * config.ebK + sampleMean * totalN) / (config.ebK + totalN);
      }
      const C = 1 - smoothedConf;

      const horizon = config.recencyHorizonWeeks === 0 ? 12 : config.recencyHorizonWeeks;
      const cooldown = config.cooldownWeeks;
      const R = weeksSince <= cooldown ? 0
              : weeksSince >= horizon  ? 1
              : (weeksSince - cooldown) / (horizon - cooldown);

      const evalRecord = evals.find(e => e.competencyId === move.competencyId);
      const evalScore01 = evalRecord?.score;
      const E_raw = evalScore01 == null ? 0 : Math.max(0, 1 - evalScore01);
      const eContrib = Math.min(E_raw * weights.E, config.evalCap);

      const domainRecord = domainCoverage.find(dc => dc.domainId === move.domainId);
      const appearances = domainRecord ? domainRecord.appearances : 0;
      const D = 1 - Math.min(appearances / 8, 1);

      const final = (C * weights.C) + (R * weights.R) + (D * weights.D) + eContrib;

      const components = [
        { key: 'C', value: C * weights.C },
        { key: 'R', value: R * weights.R },
        { key: 'E', value: eContrib },
        { key: 'D', value: D * weights.D },
      ];
      components.sort((a, b) => b.value - a.value);
      const drivers = components.slice(0, 2).map(c => c.key);

      return { ...move, C, R, E: E_raw, D, eContrib, final, drivers, weeksSince };
    });

    scoredPreview.sort((a, b) => {
      if (Math.abs(b.final - a.final) >= 0.0001) return b.final - a.final;
      if (Math.abs(b.eContrib - a.eContrib) >= 0.0001) return b.eContrib - a.eContrib;
      const cA = a.C * weights.C;
      const cB = b.C * weights.C;
      if (Math.abs(cB - cA) >= 0.0001) return cB - cA;
      if (a.weeksSince !== b.weeksSince) return b.weeksSince - a.weeksSince;
      return a.id - b.id;
    });

    const eligiblePreview = scoredPreview.filter(m => m.weeksSince >= config.cooldownWeeks);
    const previewPicks = [];
    const usedDomainsPreview = new Set<number>();

    if (eligiblePreview.length > 0) {
      previewPicks.push(eligiblePreview[0]);
      usedDomainsPreview.add(eligiblePreview[0].domainId);
    }

    for (let i = 1; i < eligiblePreview.length && previewPicks.length < 3; i++) {
      const candidate = eligiblePreview[i];
      if (usedDomainsPreview.size < config.diversityMinDomainsPerWeek && usedDomainsPreview.has(candidate.domainId)) {
        continue;
      }
      previewPicks.push(candidate);
      usedDomainsPreview.add(candidate.domainId);
    }

    if (previewPicks.length < 3) {
      logs.push('Relaxing diversity constraint for Preview');
      for (let i = 1; i < eligiblePreview.length && previewPicks.length < 3; i++) {
        if (!previewPicks.find(p => p.id === eligiblePreview[i].id)) {
          previewPicks.push(eligiblePreview[i]);
        }
      }
    }

    // Format response with CLC detection
    const formatRow = (pick: any, refDate: string) => {
      const ls = lastSelected.find(l => l.proMoveId === pick.id);
      const moveConfData = confidenceHistory.filter(h => h.proMoveId === pick.id);
      const confidenceN = moveConfData.reduce((sum, h) => sum + h.n, 0);
      
      // Get last 2 completed weeks before refDate for CLC detection
      const refDateObj = new Date(refDate);
      const recentWeeks = moveConfData
        .filter(h => new Date(h.weekStart) < refDateObj)
        .sort((a, b) => new Date(b.weekStart).getTime() - new Date(a.weekStart).getTime())
        .slice(0, 2);
      
      const classification = classifyConfidence(1 - pick.C, recentWeeks);
      
      return {
        proMoveId: pick.id,
        name: pick.name,
        domainId: pick.domainId,
        domainName: pick.domainName,
        parts: { C: pick.C, R: pick.R, E: pick.E, D: pick.D }, // E is E_raw for introspection
        evalContrib: pick.eContrib, // Show capped contribution
        finalScore: pick.final,
        drivers: pick.drivers,
        lastSeen: ls ? new Date(ls.weekStart).toLocaleDateString('en-US') : undefined,
        weeksSinceSeen: pick.weeksSince,
        confidenceN,
        status: classification.status,
        severity: classification.severity,
        n2w: classification.n2w,
        recentMeans: classification.recentMeans,
      };
    };

    const next = nextPicks.map(p => formatRow(p, effectiveDate));
    const preview = previewPicks.map(p => {
      const ls = advancedLastSelected.find(l => l.proMoveId === p.id);
      const moveConfData = confidenceHistory.filter(h => h.proMoveId === p.id);
      const confidenceN = moveConfData.reduce((sum, h) => sum + h.n, 0);
      const ws = ls ? Math.floor((new Date(previewDateStr).getTime() - new Date(ls.weekStart).getTime()) / (7 * 24 * 60 * 60 * 1000)) : 999;
      
      // Get last 2 completed weeks before preview date for CLC detection
      const previewDateObj = new Date(previewDateStr);
      const recentWeeks = moveConfData
        .filter(h => new Date(h.weekStart) < previewDateObj)
        .sort((a, b) => new Date(b.weekStart).getTime() - new Date(a.weekStart).getTime())
        .slice(0, 2);
      
      const classification = classifyConfidence(1 - p.C, recentWeeks);
      
      return {
        proMoveId: p.id,
        name: p.name,
        domainId: p.domainId,
        domainName: p.domainName,
        parts: { C: p.C, R: p.R, E: p.E, D: p.D },
        finalScore: p.final,
        drivers: p.drivers,
        lastSeen: ls ? new Date(ls.weekStart).toLocaleDateString('en-US') : undefined,
        weeksSinceSeen: ws,
        confidenceN,
        status: classification.status,
        severity: classification.severity,
        n2w: classification.n2w,
        recentMeans: classification.recentMeans,
      };
    });

    const ranked = scored.map(p => formatRow(p, effectiveDate));
    
    // Log any critical detections
    const criticalMoves = [...next, ...preview].filter(r => r.status === 'critical');
    if (criticalMoves.length > 0) {
      logs.push(`⚠️ ${criticalMoves.length} CRITICAL low-confidence moves detected`);
      criticalMoves.forEach(m => {
        logs.push(`  • ${m.name}: confEB=${(1-m.parts.C).toFixed(2)}, n2w=${m.n2w}, severity=${m.severity?.toFixed(2)}`);
      });
    }

    // Format top 6 for planner UI
    const top6 = nextPicks.map((pick, idx) => {
      const formatted = formatRow(pick, effectiveDate);
      
      // Build competency tag
      const competencies = competencyMap.get(pick.competencyId);
      const competencyTag = `${formatted.domainName.split('.')[1] || 'UNK'}.${pick.competencyId}`;
      
      // Build reason summary
      const reasons = [];
      if (formatted.parts.C > 0.3) reasons.push(`Low avg confidence`);
      if (formatted.weeksSinceSeen > 4) reasons.push(`not practiced in ${formatted.weeksSinceSeen} weeks`);
      if (pick.eContrib > 0.05) reasons.push(`eval gap (${competencyTag})`);
      if (formatted.parts.D > 0.1) reasons.push(`underrepresented domain`);
      const reasonSummary = reasons.join('; ') || 'Balanced priority';
      
      return {
        proMoveId: formatted.proMoveId,
        name: formatted.name,
        domain: formatted.domainName,
        competencyTag,
        score: formatted.finalScore,
        breakdown: {
          C: formatted.parts.C * weights.C,
          R: formatted.parts.R * weights.R,
          E: pick.eContrib,
          D: formatted.parts.D * weights.D,
        },
        lastSeenWeeksAgo: formatted.weeksSinceSeen < 999 ? formatted.weeksSinceSeen : null,
        cooldownOk: formatted.weeksSinceSeen >= config.cooldownWeeks,
        cooldownReason: formatted.weeksSinceSeen < config.cooldownWeeks 
          ? `Used ${config.cooldownWeeks - formatted.weeksSinceSeen}w ago` 
          : null,
        reasonSummary,
      };
    });

    // New planner response format
    const plannerResponse = {
      roleId: body.roleId,
      asOfWeek: effectiveDate,
      preset,
      weights,
      rankVersion,
      poolSize: eligible.length,
      rulesApplied,
      relaxedConstraintNote,
      top6,
    };

    // Legacy response format (for backward compatibility)
    const legacyResponse = {
      timezone,
      weekStartNext: new Date(effectiveDateObj).toLocaleDateString('en-US'),
      weekStartPreview: new Date(previewDate).toLocaleDateString('en-US'),
      next,
      preview,
      ranked,
      logs,
    };

    // Return planner format if asOfWeek is provided, otherwise legacy
    const response = body.asOfWeek ? plannerResponse : legacyResponse;

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in sequencer-rank:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
