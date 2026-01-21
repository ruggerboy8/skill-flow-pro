import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { EvalFilters } from '@/types/analytics';
import { startOfQuarter, endOfQuarter, subQuarters, format } from 'date-fns';

interface LocationAccountabilityResult {
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
  if (period.type === 'Baseline') return null;
  
  const quarterStartMonths: Record<string, number> = {
    Q1: 0,
    Q2: 3,
    Q3: 6,
    Q4: 9
  };
  
  const startMonth = quarterStartMonths[period.quarter || 'Q1'];
  const currentQuarterStart = new Date(period.year, startMonth, 1);
  
  const prevQuarterStart = startOfQuarter(subQuarters(currentQuarterStart, 1));
  const prevQuarterEnd = endOfQuarter(prevQuarterStart);
  
  const prevYear = prevQuarterStart.getFullYear();
  const prevQuarterNum = Math.floor(prevQuarterStart.getMonth() / 3) + 1;
  const label = `Q${prevQuarterNum} ${prevYear}`;
  
  return { start: prevQuarterStart, end: prevQuarterEnd, label };
}

export function useLocationAccountability(
  locationId: string | null, 
  evaluationPeriod: EvalFilters['evaluationPeriod']
): LocationAccountabilityResult {
  const isBaseline = evaluationPeriod.type === 'Baseline';
  
  const { data, isLoading, error } = useQuery({
    queryKey: ['location-accountability-quarter', locationId, evaluationPeriod],
    queryFn: async () => {
      if (!locationId) return null;
      
      const range = getPreviousQuarterRange(evaluationPeriod);
      if (!range) return null;
      
      const startStr = format(range.start, 'yyyy-MM-dd');
      
      // Get active staff for this location
      const staffResult = await supabase
        .from('staff')
        .select('id')
        .eq('primary_location_id', locationId)
        .eq('is_participant', true)
        .eq('is_paused', false);
      
      if (staffResult.error) throw staffResult.error;
      const staffIds = (staffResult.data || []).map(s => s.id);
      
      if (staffIds.length === 0) return null;
      
      let totalExpected = 0;
      let totalCompleted = 0;
      let totalOnTime = 0;
      
      // Process in batches
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
            
            const endDateStr = format(range.end, 'yyyy-MM-dd');
            const pastDueInQuarter = data.filter((w: any) => {
              const dueAt = new Date(w.due_at);
              return dueAt <= new Date() && w.week_of <= endDateStr;
            });
            
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
    enabled: !!locationId && !isBaseline
  });
  
  return {
    completionRate: data?.completionRate ?? null,
    onTimeRate: data?.onTimeRate ?? null,
    previousQuarterLabel: data?.label ?? null,
    isLoading,
    error: error as Error | null
  };
}
