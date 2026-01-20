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
      
      // Use the same RPC as OnTimeRateWidget for each staff member
      // This properly tracks each individual assignment slot (3 conf + 3 perf = 6 per week)
      let totalExpected = 0;
      let totalCompleted = 0;
      let totalOnTime = 0;
      
      // Process in batches to avoid overwhelming the API
      const batchSize = 20;
      for (let i = 0; i < staffIds.length; i += batchSize) {
        const batch = staffIds.slice(i, i + batchSize);
        
        const results = await Promise.all(batch.map(async (staffId) => {
          try {
            const { data, error } = await supabase.rpc('get_staff_submission_windows', {
              p_staff_id: staffId,
              p_since: startStr,
            });
            
            if (error || !data) return { expected: 0, completed: 0, onTime: 0 };
            
            // Filter to previous quarter end date and past due only
            // Compare week_of as strings to avoid timezone issues
            const endDateStr = format(range.end, 'yyyy-MM-dd');
            const pastDueInQuarter = data.filter((w: any) => {
              const dueAt = new Date(w.due_at);
              return dueAt <= new Date() && w.week_of <= endDateStr;
            });
            
            // Count each assignment slot individually (matches OnTimeRateWidget logic)
            let expected = 0;
            let completed = 0;
            let onTime = 0;
            
            for (const row of pastDueInQuarter) {
              expected++;
              if (row.status === 'submitted') {
                completed++;
                if (row.on_time === true) {
                  onTime++;
                }
              }
            }
            
            return { expected, completed, onTime };
          } catch {
            return { expected: 0, completed: 0, onTime: 0 };
          }
        }));
        
        for (const r of results) {
          totalExpected += r.expected;
          totalCompleted += r.completed;
          totalOnTime += r.onTime;
        }
      }
      
      const completionRate = totalExpected > 0 
        ? Math.round((totalCompleted / totalExpected) * 100) 
        : null;
      
      const onTimeRate = totalExpected > 0
        ? Math.round((totalOnTime / totalExpected) * 100)
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
