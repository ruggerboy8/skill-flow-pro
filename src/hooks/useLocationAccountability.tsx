import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { EvalFilters } from '@/types/analytics';
import { startOfQuarter, endOfQuarter, subQuarters, format } from 'date-fns';
import { fetchQuarterAccountability, quarterCompletionRates } from '@/lib/quarterAccountability';

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

      // See src/lib/quarterAccountability.ts (PRF-1) for why this couldn't be
      // collapsed into a single batched query under this ticket's constraints.
      const endDateStr = format(range.end, 'yyyy-MM-dd');
      const tally = await fetchQuarterAccountability(staffIds, startStr, endDateStr);
      const { completionRate, onTimeRate } = quarterCompletionRates(tally);

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
