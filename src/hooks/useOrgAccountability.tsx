import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { EvalFilters } from '@/types/analytics';
import { subWeeks, endOfQuarter, endOfYear } from 'date-fns';

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
    // For baseline, use Dec 31 of the year
    return endOfYear(new Date(year, 0, 1));
  }
  
  // For quarterly: end of that quarter
  const quarterEndMonths: Record<string, number> = {
    Q1: 2,  // Mar
    Q2: 5,  // Jun
    Q3: 8,  // Sep
    Q4: 11  // Dec
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
      
      // Calculate the 6-week window ending at period end
      const periodEnd = getPeriodEndDate(evaluationPeriod);
      const windowStart = subWeeks(periodEnd, 6);
      
      // Get locations for this org
      const { data: locationsData, error: locError } = await supabase
        .from('locations')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('active', true);
      
      if (locError) throw locError;
      const locationIds = (locationsData || []).map(l => l.id);
      
      if (locationIds.length === 0) return null;
      
      // Get active staff for this org
      const staffQuery = supabase
        .from('staff')
        .select('id')
        .in('location_id', locationIds)
        .eq('is_participant', true)
        .eq('paused', false);
      
      const { data: staffData, error: staffError } = await staffQuery;
      if (staffError) throw staffError;
      const staffIds = (staffData || []).map((s: { id: string }) => s.id);
      
      if (staffIds.length === 0) return null;
      
      // Query weekly_scores for the 6-week window
      const { data: scores, error: scoresError } = await supabase
        .from('weekly_scores')
        .select('staff_id, week_of, confidence_score, performance_score')
        .in('staff_id', staffIds)
        .gte('week_of', windowStart.toISOString().split('T')[0])
        .lte('week_of', periodEnd.toISOString().split('T')[0])
        .returns<{ staff_id: string; week_of: string; confidence_score: number | null; performance_score: number | null }[]>();
      
      if (scoresError) throw scoresError;
      
      if (!scores || scores.length === 0) return null;
      
      // Calculate completion rate (how many weeks have both scores)
      let totalWeeks = scores.length;
      let completedWeeks = 0;
      
      for (const score of scores) {
        const hasConfidence = score.confidence_score !== null;
        const hasPerformance = score.performance_score !== null;
        if (hasConfidence && hasPerformance) completedWeeks++;
      }
      
      const completionRate = totalWeeks > 0 
        ? Math.round((completedWeeks / totalWeeks) * 100) 
        : null;
      
      return {
        completionRate,
        onTimeRate: null, // Not available without submitted_at column
        totalSubmissions: completedWeeks
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
