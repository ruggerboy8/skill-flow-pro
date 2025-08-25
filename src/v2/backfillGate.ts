import { supabase } from '@/integrations/supabase/client';

type GateResult = {
  missingCount: number;
  missingWeeks: number[]; // week_in_cycle numbers (1..6)
};

// A week counts as "complete" when ALL focus rows for that (cycle=1, week=1..6, role)
// have BOTH confidence_score and performance_score for this staff member.
export async function needsBackfill(staffId: string, roleId: number): Promise<GateResult> {
  // Pull all weekly_focus ids for Cycle 1, Weeks 1..6 for this role
  const { data: focus } = await supabase
    .from('weekly_focus')
    .select('id, week_in_cycle')
    .eq('cycle', 1)
    .eq('role_id', roleId)
    .in('week_in_cycle', [1,2,3,4,5,6]);

  if (!focus || focus.length === 0) {
    return { missingCount: 0, missingWeeks: [] }; // nothing configured
  }

  // Group focus ids by week
  const byWeek = new Map<number, string[]>();
  for (const row of focus) {
    const wk = row.week_in_cycle!;
    if (!byWeek.has(wk)) byWeek.set(wk, []);
    byWeek.get(wk)!.push(row.id);
  }

  const missingWeeks: number[] = [];

  // For each week, check if all focus rows have both scores
  for (const [week, ids] of byWeek.entries()) {
    const { data: scores } = await supabase
      .from('weekly_scores')
      .select('weekly_focus_id, confidence_score, performance_score')
      .eq('staff_id', staffId)
      .in('weekly_focus_id', ids);

    // Must have one score row per focus id AND both scores present
    const scoreMap = new Map(scores?.map(s => [s.weekly_focus_id, s]) ?? []);
    const allComplete = ids.every(id => {
      const s = scoreMap.get(id);
      return s && s.confidence_score != null && s.performance_score != null;
    });

    if (!allComplete) missingWeeks.push(week);
  }

  return { missingCount: missingWeeks.length, missingWeeks: missingWeeks.sort((a,b)=>a-b) };
}