import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { EvalFilters } from '@/types/analytics';
import { subWeeks, endOfQuarter, endOfYear, format } from 'date-fns';

interface OrgAccountabilityResult {
  completionRate: number | null;
  onTimeRate: number | null;
  totalSubmissions: number;
  isLoading: boolean;
  error: Error | null;
}

/**
 * Get the end date for a given evaluation period.
 * Used to determine the 6-week accountability window.
 */
function getPeriodEndDate(period: EvalFilters['evaluationPeriod']): Date {
  const year = period.year;
  
  if (period.type === 'Baseline') {
    return endOfYear(new Date(year, 0, 1));
  }
  
  const quarterEndMonths: Record<string, number> = {
    Q1: 2,
    Q2: 5,
    Q3: 8,
    Q4: 11
  };
  
  const endMonth = quarterEndMonths[period.quarter || 'Q1'];
  return endOfQuarter(new Date(year, endMonth, 1));
}

export function useOrgAccountability(filters: EvalFilters): OrgAccountabilityResult {
  const { organizationId, evaluationPeriod } = filters;
  
  const { data, isLoading, error } = useQuery({
    queryKey: ['org-accountability', organizationId, evaluationPeriod],
    queryFn: async () => {
      if (!organizationId) return null;
      
      const periodEnd = getPeriodEndDate(evaluationPeriod);
      const windowStart = subWeeks(periodEnd, 6);
      
      const startStr = format(windowStart, 'yyyy-MM-dd');
      const endStr = format(periodEnd, 'yyyy-MM-dd');
      
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
      
      // Query weekly_scores for the 6-week window
      const scoresResult = await supabase
        .from('weekly_scores')
        .select('staff_id, week_of, confidence_score, performance_score, confidence_late')
        .in('staff_id', staffIds)
        .gte('week_of', startStr)
        .lte('week_of', endStr);
      
      if (scoresResult.error) throw scoresResult.error;
      const scores = scoresResult.data || [];
      
      if (scores.length === 0) return null;
      
      // Calculate metrics
      let completedCount = 0;
      let onTimeCount = 0;
      
      for (const score of scores) {
        const hasConfidence = score.confidence_score !== null;
        const hasPerformance = score.performance_score !== null;
        if (hasConfidence && hasPerformance) {
          completedCount++;
          if (!score.confidence_late) onTimeCount++;
        }
      }
      
      // Expected = staff * 6 weeks * 3 slots (approximate)
      const expectedSubmissions = staffIds.length * 6 * 3;
      
      const completionRate = expectedSubmissions > 0 
        ? Math.round((completedCount / expectedSubmissions) * 100) 
        : null;
      
      const onTimeRate = completedCount > 0
        ? Math.round((onTimeCount / completedCount) * 100)
        : null;
      
      return {
        completionRate,
        onTimeRate,
        totalSubmissions: completedCount
      };
    },
    enabled: !!organizationId
  });
  
  return {
    completionRate: data?.completionRate ?? null,
    onTimeRate: data?.onTimeRate ?? null,
    totalSubmissions: data?.totalSubmissions ?? 0,
    isLoading,
    error: error as Error | null
  };
}
