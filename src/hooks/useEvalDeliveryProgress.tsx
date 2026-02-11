import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { EvaluationPeriod } from '@/lib/evalPeriods';

export interface LocationProgress {
  locationId: string;
  locationName: string;
  organizationId: string;
  organizationName: string;
  totalStaff: number;
  draftCount: number;
  submittedCount: number;
  visibleCount: number;
  coveragePercent: number;
  allVisible: boolean;
  // Delivery tracking (only counts released evals)
  viewedCount: number;
  acknowledgedCount: number;
  focusSelectedCount: number;
}

interface UseEvalDeliveryProgressResult {
  locations: LocationProgress[];
  isLoading: boolean;
  refetch: () => void;
}

/**
 * Hook to fetch evaluation delivery progress data for ALL locations
 * Optionally filter by organization client-side
 */
export function useEvalDeliveryProgress(
  period: EvaluationPeriod | null
): UseEvalDeliveryProgressResult {
  const query = useQuery({
    queryKey: ['eval-delivery-progress', period?.type, period?.quarter, period?.year],
    queryFn: async (): Promise<LocationProgress[]> => {
      if (!period) return [];

      // 1. Get all active locations with their organization info
      const { data: locations, error: locError } = await supabase
        .from('locations')
        .select('id, name, organization_id, organizations!locations_organization_id_fkey(name)')
        .eq('active', true)
        .order('name');

      if (locError) throw locError;
      if (!locations || locations.length === 0) return [];

      // 2. For each location, count total active participants (role_id IN 1,2,3 = DFI, RDA, OM)
      const locationIds = locations.map(l => l.id);
      
      const { data: staffCounts, error: staffError } = await supabase
        .from('staff')
        .select('primary_location_id')
        .in('primary_location_id', locationIds)
        .in('role_id', [1, 2, 3]) // DFI, RDA, OM
        .eq('is_participant', true)
        .eq('is_paused', false);

      if (staffError) throw staffError;

      // Build staff count map
      const staffCountByLocation = new Map<string, number>();
      for (const s of staffCounts || []) {
        if (s.primary_location_id) {
          staffCountByLocation.set(
            s.primary_location_id, 
            (staffCountByLocation.get(s.primary_location_id) || 0) + 1
          );
        }
      }

      // 3. Query evaluations for this period across all locations
      //    Include delivery tracking fields
      let evalQuery = supabase
        .from('evaluations')
        .select('id, location_id, status, is_visible_to_staff, viewed_at, acknowledged_at, focus_selected_at')
        .in('location_id', locationIds)
        .eq('program_year', period.year);

      if (period.type === 'Quarterly' && period.quarter) {
        evalQuery = evalQuery.eq('quarter', period.quarter).eq('type', 'Quarterly');
      } else {
        evalQuery = evalQuery.eq('type', 'Baseline');
      }

      const { data: evaluations, error: evalError } = await evalQuery;
      if (evalError) throw evalError;

      // Build eval counts by location
      const evalsByLocation = new Map<string, { 
        drafts: number; 
        submitted: number; 
        visible: number;
        viewed: number;
        acknowledged: number;
        focusSelected: number;
      }>();

      for (const e of evaluations || []) {
        const locId = e.location_id;
        const current = evalsByLocation.get(locId) || { 
          drafts: 0, submitted: 0, visible: 0, viewed: 0, acknowledged: 0, focusSelected: 0 
        };
        
        if (e.status === 'draft') {
          current.drafts++;
        } else if (e.status === 'submitted') {
          current.submitted++;
          if (e.is_visible_to_staff) {
            current.visible++;
            // Only count delivery metrics for released (visible) evals
            if (e.viewed_at) current.viewed++;
            if (e.acknowledged_at) current.acknowledged++;
            if (e.focus_selected_at) current.focusSelected++;
          }
        }
        
        evalsByLocation.set(locId, current);
      }

      // 4. Build final result
      const result: LocationProgress[] = locations.map(loc => {
        const totalStaff = staffCountByLocation.get(loc.id) || 0;
        const evals = evalsByLocation.get(loc.id) || { 
          drafts: 0, submitted: 0, visible: 0, viewed: 0, acknowledged: 0, focusSelected: 0 
        };
        const coveragePercent = totalStaff > 0 
          ? Math.round((evals.submitted / totalStaff) * 100) 
          : 0;
        
        // Extract org name from the joined data
        const orgData = loc.organizations as { name: string } | null;
        
        return {
          locationId: loc.id,
          locationName: loc.name,
          organizationId: loc.organization_id,
          organizationName: orgData?.name || 'Unknown',
          totalStaff,
          draftCount: evals.drafts,
          submittedCount: evals.submitted,
          visibleCount: evals.visible,
          coveragePercent,
          allVisible: evals.submitted > 0 && evals.visible === evals.submitted,
          viewedCount: evals.viewed,
          acknowledgedCount: evals.acknowledged,
          focusSelectedCount: evals.focusSelected,
        };
      });

      return result;
    },
    enabled: !!period
  });

  return {
    locations: query.data || [],
    isLoading: query.isLoading,
    refetch: query.refetch
  };
}
