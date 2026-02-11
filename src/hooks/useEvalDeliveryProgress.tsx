import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { EvaluationPeriod } from '@/lib/evalPeriods';

export type StaffDeliveryStatus = 'no_eval' | 'draft' | 'not_released' | 'released' | 'viewed' | 'reviewed' | 'focus_set';

export interface StaffDetail {
  staffId: string;
  staffName: string;
  evalId: string | null;
  status: StaffDeliveryStatus;
}

export interface LocationProgress {
  locationId: string;
  locationName: string;
  organizationId: string;
  organizationName: string;
  totalStaff: number;
  submittedCount: number;
  visibleCount: number;
  coveragePercent: number;
  allVisible: boolean;
  draftCount: number;
  staffDetails: StaffDetail[];
}

interface UseEvalDeliveryProgressResult {
  locations: LocationProgress[];
  isLoading: boolean;
  refetch: () => void;
}

function deriveStatus(eval_: {
  status: string;
  is_visible_to_staff: boolean;
  viewed_at: string | null;
  acknowledged_at: string | null;
  focus_selected_at: string | null;
} | null): StaffDeliveryStatus {
  if (!eval_) return 'no_eval';
  if (eval_.status === 'draft') return 'draft';
  if (!eval_.is_visible_to_staff) return 'not_released';
  if (eval_.focus_selected_at) return 'focus_set';
  if (eval_.acknowledged_at) return 'reviewed';
  if (eval_.viewed_at) return 'viewed';
  return 'released';
}

export function useEvalDeliveryProgress(
  period: EvaluationPeriod | null
): UseEvalDeliveryProgressResult {
  const query = useQuery({
    queryKey: ['eval-delivery-progress', period?.type, period?.quarter, period?.year],
    queryFn: async (): Promise<LocationProgress[]> => {
      if (!period) return [];

      // 1. Get all active locations with org info
      const { data: locations, error: locError } = await supabase
        .from('locations')
        .select('id, name, organization_id, organizations!locations_organization_id_fkey(name)')
        .eq('active', true)
        .order('name');

      if (locError) throw locError;
      if (!locations || locations.length === 0) return [];

      const locationIds = locations.map(l => l.id);

      // 2. Get all active participants with their names
      const { data: staffRows, error: staffError } = await supabase
        .from('staff')
        .select('id, name, primary_location_id')
        .in('primary_location_id', locationIds)
        .in('role_id', [1, 2, 3])
        .eq('is_participant', true)
        .eq('is_paused', false);

      if (staffError) throw staffError;

      // Build staff by location
      const staffByLocation = new Map<string, { id: string; name: string }[]>();
      for (const s of staffRows || []) {
        if (s.primary_location_id) {
          const list = staffByLocation.get(s.primary_location_id) || [];
          list.push({ id: s.id, name: s.name });
          staffByLocation.set(s.primary_location_id, list);
        }
      }

      // 3. Query evaluations for this period
      let evalQuery = supabase
        .from('evaluations')
        .select('id, location_id, staff_id, status, is_visible_to_staff, viewed_at, acknowledged_at, focus_selected_at')
        .in('location_id', locationIds)
        .eq('program_year', period.year);

      if (period.type === 'Quarterly' && period.quarter) {
        evalQuery = evalQuery.eq('quarter', period.quarter).eq('type', 'Quarterly');
      } else {
        evalQuery = evalQuery.eq('type', 'Baseline');
      }

      const { data: evaluations, error: evalError } = await evalQuery;
      if (evalError) throw evalError;

      // Index evals by staff_id within location
      const evalByStaff = new Map<string, typeof evaluations extends (infer T)[] | null ? T : never>();
      for (const e of evaluations || []) {
        // Key by staff_id (one eval per staff per period)
        evalByStaff.set(e.staff_id, e);
      }

      // 4. Build result
      const result: LocationProgress[] = locations.map(loc => {
        const staff = staffByLocation.get(loc.id) || [];
        const totalStaff = staff.length;

        let submittedCount = 0;
        let visibleCount = 0;
        let draftCount = 0;

        const staffDetails: StaffDetail[] = staff
          .sort((a, b) => a.name.localeCompare(b.name))
          .map(s => {
            const eval_ = evalByStaff.get(s.id) || null;
            const status = deriveStatus(eval_);

            if (eval_) {
              if (eval_.status === 'draft') draftCount++;
              if (eval_.status === 'submitted') {
                submittedCount++;
                if (eval_.is_visible_to_staff) visibleCount++;
              }
            }

            return {
              staffId: s.id,
              staffName: s.name,
              evalId: eval_?.id ?? null,
              status,
            };
          });

        const coveragePercent = totalStaff > 0
          ? Math.round((submittedCount / totalStaff) * 100)
          : 0;

        const orgData = loc.organizations as { name: string } | null;

        return {
          locationId: loc.id,
          locationName: loc.name,
          organizationId: loc.organization_id,
          organizationName: orgData?.name || 'Unknown',
          totalStaff,
          submittedCount,
          visibleCount,
          coveragePercent,
          allVisible: submittedCount > 0 && visibleCount === submittedCount,
          draftCount,
          staffDetails,
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
