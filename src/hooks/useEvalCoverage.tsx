import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { EvalFilters } from '@/types/analytics';
import { computeEligibleStaffIds } from '@/lib/evaluationEligibility';

interface EvalCoverageResult {
  eligibleCount: number;
  evaluatedCount: number;
  draftCount: number;
  draftIds: string[];
  isLoading: boolean;
  error: Error | null;
}

export function useEvalCoverage(filters: EvalFilters): EvalCoverageResult {
  const { organizationId, evaluationPeriod } = filters;
  
  const evalTypes = evaluationPeriod.type === 'Baseline' ? ['Baseline'] : ['Quarterly'];
  
  const { data, isLoading, error } = useQuery({
    queryKey: ['eval-coverage-v2', organizationId, evaluationPeriod],
    queryFn: async () => {
      if (!organizationId) return null;
      
      // Get locations for this org
      const { data: locationsData, error: locError } = await supabase
        .from('locations')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('active', true);
      
      if (locError) throw locError;
      const locationIds = (locationsData || []).map(l => l.id);
      
      if (locationIds.length === 0) return null;
      
      // Get evaluations for this period
      let evalsQuery = supabase
        .from('evaluations')
        .select('id, staff_id, status')
        .in('location_id', locationIds)
        .in('type', evalTypes)
        .eq('program_year', evaluationPeriod.year);
      
      if (evaluationPeriod.type === 'Quarterly' && evaluationPeriod.quarter) {
        evalsQuery = evalsQuery.eq('quarter', evaluationPeriod.quarter);
      }
      
      const { data: evals, error: evalsError } = await evalsQuery;
      if (evalsError) throw evalsError;
      
      // Get active staff for eligibility calculation
      const staffQuery = supabase
        .from('staff')
        .select('id, hire_date')
        .in('location_id', locationIds)
        .eq('is_participant', true)
        .eq('is_org_admin', false)
        .eq('paused', false);
      
      const { data: allStaff, error: staffError } = await staffQuery;
      if (staffError) throw staffError;
      
      const submittedEvals = (evals || []).filter(e => e.status === 'submitted');
      const draftEvals = (evals || []).filter(e => e.status === 'draft');
      
      const allEvaluatedStaffIds = new Set((evals || []).map(e => e.staff_id));
      const submittedStaffIds = new Set(submittedEvals.map(e => e.staff_id));
      
      const eligibleStaffIds = computeEligibleStaffIds(
        allStaff || [],
        allEvaluatedStaffIds,
        evaluationPeriod
      );
      
      return {
        eligibleCount: eligibleStaffIds.size,
        evaluatedCount: submittedStaffIds.size,
        draftCount: draftEvals.length,
        draftIds: draftEvals.map(e => e.id)
      };
    },
    enabled: !!organizationId
  });
  
  return {
    eligibleCount: data?.eligibleCount ?? 0,
    evaluatedCount: data?.evaluatedCount ?? 0,
    draftCount: data?.draftCount ?? 0,
    draftIds: data?.draftIds ?? [],
    isLoading,
    error: error as Error | null
  };
}
