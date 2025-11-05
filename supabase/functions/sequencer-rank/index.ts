import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RankRequest {
  roleId: 1 | 2;
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

    // Default values
    const timezone = body.timezone || 'America/Chicago';
    const effectiveDate = body.effectiveDate || new Date().toISOString().split('T')[0];
    
    // Normalize weights
    let weights = body.weights || { C: 0.65, R: 0.15, E: 0.15, D: 0.05 };
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
      cooldownWeeks: body.cooldownWeeks ?? 2,
      diversityMinDomainsPerWeek: body.diversityMinDomainsPerWeek ?? 2,
      recencyHorizonWeeks: body.recencyHorizonWeeks ?? 0,
      ebPrior: body.ebPrior ?? 0.70,
      ebK: body.ebK ?? 20,
      trimPct: body.trimPct ?? 0.05,
      evalCap: body.evalCap ?? 0.25,
    };

    const logs: string[] = [];
    logs.push(`Starting ranking for role ${body.roleId} on ${effectiveDate}`);
    if (weights.R === 0) {
      logs.push('Recency disabled (wR=0) - cooldown and diversity still apply');
    }

    // Calculate cutoff dates
    const effectiveDateObj = new Date(effectiveDate);
    const cutoff18w = new Date(effectiveDateObj);
    cutoff18w.setDate(cutoff18w.getDate() - 18 * 7);
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

    const eligible = eligibleMoves?.map((m: any) => {
      const comp = competencyMap.get(m.competency_id);
      return {
        id: m.action_id,
        name: m.action_statement,
        competencyId: m.competency_id,
        domainId: comp?.domainId || 0,
        domainName: comp?.domainName || 'Unknown',
      };
    }) || [];

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

    // 2. Fetch confidence history (last 18 weeks)
    const { data: confData, error: confError } = await supabase
      .from('weekly_scores')
      .select(`
        confidence_score,
        confidence_date,
        weekly_focus!inner(action_id, role_id)
      `)
      .eq('weekly_focus.role_id', body.roleId)
      .not('confidence_score', 'is', null)
      .gte('confidence_date', cutoff18w.toISOString());

    if (confError) throw confError;

    // Group by pro_move and week
    const confidenceMap = new Map<string, { sum: number; count: number }>();
    confData?.forEach((row: any) => {
      const weekStart = new Date(row.confidence_date);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1); // Monday
      const key = `${row.weekly_focus.action_id}-${weekStart.toISOString().split('T')[0]}`;
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

    // 3. Fetch latest quarterly evals
    const { data: evalData, error: evalError } = await supabase.rpc('get_latest_quarterly_evals');
    if (evalError) console.warn('Eval fetch failed:', evalError);

    const evals = evalData?.map((e: any) => ({
      competencyId: e.competency_id,
      score: e.score,
    })) || [];

    logs.push(`Found ${evals.length} eval scores`);

    // 4. Fetch last selected (approximate using cycle/week)
    const { data: lastSelectedData, error: lsError } = await supabase
      .from('weekly_focus')
      .select('action_id, cycle, week_in_cycle')
      .eq('role_id', body.roleId)
      .not('action_id', 'is', null)
      .order('cycle', { ascending: false })
      .order('week_in_cycle', { ascending: false });

    if (lsError) throw lsError;

    // Approximate week start dates (assuming 6-week cycles starting from a base date)
    const baseDate = new Date('2024-01-01'); // Adjust as needed
    const lastSelectedMap = new Map<number, string>();
    lastSelectedData?.forEach((row: any) => {
      if (lastSelectedMap.has(row.action_id)) return;
      const weekOffset = (row.cycle - 1) * 6 + (row.week_in_cycle - 1);
      const weekStart = new Date(baseDate);
      weekStart.setDate(weekStart.getDate() + weekOffset * 7);
      lastSelectedMap.set(row.action_id, weekStart.toISOString().split('T')[0]);
    });

    const lastSelected = Array.from(lastSelectedMap.entries()).map(([proMoveId, weekStart]) => ({
      proMoveId,
      weekStart,
    }));

    logs.push(`Found ${lastSelected.length} last-selected records`);

    // 5. Fetch domain coverage (last 8 weeks)
    const domainCoverageMap = new Map<number, Set<string>>();
    lastSelectedData?.forEach((row: any) => {
      const move = eligible.find(m => m.id === row.action_id);
      if (!move) return;

      const weekOffset = (row.cycle - 1) * 6 + (row.week_in_cycle - 1);
      const weekStart = new Date(baseDate);
      weekStart.setDate(weekStart.getDate() + weekOffset * 7);

      const weeksSince = Math.floor((effectiveDateObj.getTime() - weekStart.getTime()) / (7 * 24 * 60 * 60 * 1000));
      if (weeksSince <= 8 && weeksSince >= 0) {
        const weeks = domainCoverageMap.get(move.domainId) || new Set();
        weeks.add(weekStart.toISOString().split('T')[0]);
        domainCoverageMap.set(move.domainId, weeks);
      }
    });

    const domainCoverage = Array.from(domainCoverageMap.entries()).map(([domainId, weeks]) => ({
      domainId,
      appearances: weeks.size,
    }));

    logs.push(`Domain coverage: ${domainCoverage.length} domains tracked`);

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

      // R (Recency)
      const lastSeenRecord = lastSelected.find(ls => ls.proMoveId === move.id);
      const weeksSince = lastSeenRecord
        ? Math.floor((new Date(referenceDate).getTime() - new Date(lastSeenRecord.weekStart).getTime()) / (7 * 24 * 60 * 60 * 1000))
        : 999;
      const horizon = config.recencyHorizonWeeks === 0 ? 12 : config.recencyHorizonWeeks;
      const R = weeksSince >= horizon ? 1.0 : Math.exp(-weeksSince / horizon);

      // E (Eval)
      const evalRecord = evals.find(e => e.competencyId === move.competencyId);
      const evalScore = evalRecord ? evalRecord.score : 0;
      const E = Math.min(evalScore, config.evalCap);

      // D (Domain)
      const domainRecord = domainCoverage.find(dc => dc.domainId === move.domainId);
      const appearances = domainRecord ? domainRecord.appearances : 0;
      const D = 1 - Math.min(appearances / 8, 1);

      const final = C * weights.C + R * weights.R + E * weights.E + D * weights.D;

      const components = [
        { key: 'C', value: C * weights.C },
        { key: 'R', value: R * weights.R },
        { key: 'E', value: E * weights.E },
        { key: 'D', value: D * weights.D },
      ];
      components.sort((a, b) => b.value - a.value);
      const drivers = components.slice(0, 2).map(c => c.key);

      return { C, R, E, D, final, drivers, weeksSince };
    };

    // Compute Next
    const scored = eligible.map(move => ({ ...move, ...scoreCandidate(move, effectiveDate) }));
    scored.sort((a, b) => {
      if (Math.abs(b.final - a.final) < 0.0001) return a.id - b.id;
      return b.final - a.final;
    });

    // Apply cooldown and pick 3
    const eligibleNext = scored.filter(m => m.weeksSince >= config.cooldownWeeks);
    const nextPicks = [];
    const usedDomains = new Set<number>();

    if (eligibleNext.length > 0) {
      nextPicks.push(eligibleNext[0]);
      usedDomains.add(eligibleNext[0].domainId);
    }

    for (let i = 1; i < eligibleNext.length && nextPicks.length < 3; i++) {
      const candidate = eligibleNext[i];
      if (usedDomains.size < config.diversityMinDomainsPerWeek && usedDomains.has(candidate.domainId)) {
        continue;
      }
      nextPicks.push(candidate);
      usedDomains.add(candidate.domainId);
    }

    if (nextPicks.length < 3) {
      logs.push('Relaxing diversity constraint for Next');
      for (let i = 1; i < eligibleNext.length && nextPicks.length < 3; i++) {
        if (!nextPicks.find(p => p.id === eligibleNext[i].id)) {
          nextPicks.push(eligibleNext[i]);
        }
      }
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
      const R = weeksSince >= horizon ? 1.0 : Math.exp(-weeksSince / horizon);

      const evalRecord = evals.find(e => e.competencyId === move.competencyId);
      const evalScore = evalRecord ? evalRecord.score : 0;
      const E = Math.min(evalScore, config.evalCap);

      const domainRecord = domainCoverage.find(dc => dc.domainId === move.domainId);
      const appearances = domainRecord ? domainRecord.appearances : 0;
      const D = 1 - Math.min(appearances / 8, 1);

      const final = C * weights.C + R * weights.R + E * weights.E + D * weights.D;

      const components = [
        { key: 'C', value: C * weights.C },
        { key: 'R', value: R * weights.R },
        { key: 'E', value: E * weights.E },
        { key: 'D', value: D * weights.D },
      ];
      components.sort((a, b) => b.value - a.value);
      const drivers = components.slice(0, 2).map(c => c.key);

      return { ...move, C, R, E, D, final, drivers, weeksSince };
    });

    scoredPreview.sort((a, b) => {
      if (Math.abs(b.final - a.final) < 0.0001) return a.id - b.id;
      return b.final - a.final;
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
        parts: { C: pick.C, R: pick.R, E: pick.E, D: pick.D },
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

    const response = {
      timezone,
      weekStartNext: new Date(effectiveDateObj).toLocaleDateString('en-US'),
      weekStartPreview: new Date(previewDate).toLocaleDateString('en-US'),
      next,
      preview,
      ranked,
      logs,
    };

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
