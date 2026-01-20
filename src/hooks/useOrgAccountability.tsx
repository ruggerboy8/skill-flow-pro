import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { EvalFilters } from '@/types/analytics';
import { startOfQuarter, endOfQuarter, subQuarters, format } from 'date-fns';

interface OrgAccountabilityResult {
  completionRate: number | null;
  onTimeRate: number | null;
  previousQuarterLabel: string | null;
  isLoading: boolean;
  error: Error | null;
}

/**
 * Get the previous quarter date range for a given evaluation period.
 * E.g., Q1 2026 eval → Q4 2025 data
 */
function getPreviousQuarterRange(period: EvalFilters['evaluationPeriod']): { start: Date; end: Date; label: string } | null {
  // Only works for Quarterly evaluations
  if (period.type === 'Baseline') return null;
  
  const quarterStartMonths: Record<string, number> = {
    Q1: 0,   // Jan
    Q2: 3,   // Apr
    Q3: 6,   // Jul
    Q4: 9    // Oct
  };
  
  const startMonth = quarterStartMonths[period.quarter || 'Q1'];
  const currentQuarterStart = new Date(period.year, startMonth, 1);
  
  // Get previous quarter
  const prevQuarterStart = startOfQuarter(subQuarters(currentQuarterStart, 1));
  const prevQuarterEnd = endOfQuarter(prevQuarterStart);
  
  // Build label like "Q4 2025"
  const prevYear = prevQuarterStart.getFullYear();
  const prevQuarterNum = Math.floor(prevQuarterStart.getMonth() / 3) + 1;
  const label = `Q${prevQuarterNum} ${prevYear}`;
  
  return { start: prevQuarterStart, end: prevQuarterEnd, label };
}

export function useOrgAccountability(filters: EvalFilters): OrgAccountabilityResult {
  const { organizationId, evaluationPeriod } = filters;
  
  // Don't run for baseline evaluations
  const isBaseline = evaluationPeriod.type === 'Baseline';
  
  const { data, isLoading, error } = useQuery({
    queryKey: ['org-accountability-quarter', organizationId, evaluationPeriod],
    queryFn: async () => {
      if (!organizationId) return null;
      
      const range = getPreviousQuarterRange(evaluationPeriod);
      if (!range) return null;
      
      const startStr = format(range.start, 'yyyy-MM-dd');
      const endStr = format(range.end, 'yyyy-MM-dd');
      
      // Get locations for this org
      const locationsResult = await supabase
        .from('locations')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('active', true);
      
      if (locationsResult.error) throw locationsResult.error;
      const locationIds = (locationsResult.data || []).map(l => l.id);
      
      if (locationIds.length === 0) return null;
      
      // Get active staff for this org
      const staffResult = await supabase
        .from('staff')
        .select('id')
        .in('primary_location_id', locationIds)
        .eq('is_participant', true)
        .eq('is_paused', false);
      
      if (staffResult.error) throw staffResult.error;
      const staffIds = (staffResult.data || []).map(s => s.id);
      
      if (staffIds.length === 0) return null;
      
      // Query weekly_scores for the previous quarter
      const scoresResult = await supabase
        .from('weekly_scores')
        .select('staff_id, week_of, confidence_score, performance_score, confidence_late, performance_late')
        .in('staff_id', staffIds)
        .gte('week_of', startStr)
        .lte('week_of', endStr);
      
      if (scoresResult.error) throw scoresResult.error;
      const scores = scoresResult.data || [];
      
      if (scores.length === 0) return { completionRate: null, onTimeRate: null, label: range.label };
      
      // Calculate metrics - count individual submissions (confidence + performance)
      let totalExpected = 0;
      let completedCount = 0;
      let onTimeCount = 0;
      
      for (const score of scores) {
        // Each score row represents one week
        // We expect 2 submissions per week: confidence + performance
        totalExpected += 2;
        
        if (score.confidence_score !== null) {
          completedCount++;
          if (!score.confidence_late) onTimeCount++;
        }
        if (score.performance_score !== null) {
          completedCount++;
          if (!score.performance_late) onTimeCount++;
        }
      }
      
      const completionRate = totalExpected > 0 
        ? Math.round((completedCount / totalExpected) * 100) 
        : null;
      
      const onTimeRate = completedCount > 0
        ? Math.round((onTimeCount / completedCount) * 100)
        : null;
      
      return {
        completionRate,
        onTimeRate,
        label: range.label
      };
    },
    enabled: !!organizationId && !isBaseline
  });
  
  return {
    completionRate: data?.completionRate ?? null,
    onTimeRate: data?.onTimeRate ?? null,
    previousQuarterLabel: data?.label ?? null,
    isLoading,
    error: error as Error | null
  };
}
