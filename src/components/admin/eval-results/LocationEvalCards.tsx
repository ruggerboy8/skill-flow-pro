import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { LocationEvalCard, LocationEvalStats, RoleDomainScore } from './LocationEvalCard';
import type { EvalFilters } from '@/types/analytics';
import { periodToDateRange } from '@/types/analytics';

interface LocationEvalCardsProps {
  filters: EvalFilters;
  onLocationClick: (locationId: string, locationName: string) => void;
}

interface StaffLocationData {
  location_id: string;
  location_name: string;
  staff_id: string;
  staff_name: string;
  role_id: number | null;
  role_name: string | null;
  domain_id: number;
  domain_name: string;
  n_items: number;
  avg_observer: number;
  has_eval: boolean;
}

// Canonical role names for grouping
const DFI_ROLE = 'DFI';
const RDA_ROLE = 'RDA';

export function LocationEvalCards({ filters, onLocationClick }: LocationEvalCardsProps) {
  const { data: rawData, isLoading, error } = useQuery({
    queryKey: ['location-eval-cards', filters],
    queryFn: async () => {
      if (!filters.organizationId) return [];

      const dateRange = periodToDateRange(filters.evaluationPeriod);
      const evalTypes = filters.evaluationPeriod.type === 'Baseline' 
        ? ['Baseline'] 
        : ['Quarterly'];

      const params = {
        p_org_id: filters.organizationId,
        p_start: dateRange.start.toISOString(),
        p_end: dateRange.end.toISOString(),
        p_include_no_eval: filters.includeNoEvals,
        ...(filters.locationIds?.length ? { p_location_ids: filters.locationIds } : {}),
        ...(filters.roleIds?.length ? { p_role_ids: filters.roleIds } : {}),
        p_types: evalTypes,
      };

      const { data, error } = await supabase.rpc('get_location_domain_staff_averages', params);

      if (error) throw error;
      return data as StaffLocationData[];
    },
    enabled: !!filters.organizationId
  });

  // Aggregate raw data by location with role breakdown
  const locationStats = useMemo<LocationEvalStats[]>(() => {
    if (!rawData || rawData.length === 0) return [];

    // Group by location
    const byLocation = new Map<string, {
      locationName: string;
      staffIds: Set<string>;
      staffWithEval: Set<string>;
      dfiStaffIds: Set<string>;
      rdaStaffIds: Set<string>;
      observerScores: number[];
      selfScores: number[];
      // domainName -> role -> scores[]
      roleDomainScores: Map<string, { dfi: number[]; rda: number[] }>;
    }>();

    rawData.forEach(row => {
      if (!byLocation.has(row.location_id)) {
        byLocation.set(row.location_id, {
          locationName: row.location_name,
          staffIds: new Set(),
          staffWithEval: new Set(),
          dfiStaffIds: new Set(),
          rdaStaffIds: new Set(),
          observerScores: [],
          selfScores: [],
          roleDomainScores: new Map(),
        });
      }
      
      const loc = byLocation.get(row.location_id)!;
      loc.staffIds.add(row.staff_id);
      
      // Track role counts (unique staff per role)
      const roleName = row.role_name?.toUpperCase() || '';
      if (roleName.includes(DFI_ROLE)) {
        loc.dfiStaffIds.add(row.staff_id);
      } else if (roleName.includes(RDA_ROLE)) {
        loc.rdaStaffIds.add(row.staff_id);
      }
      
      if (row.has_eval) {
        loc.staffWithEval.add(row.staff_id);
      }
      
      if (row.avg_observer !== null && row.domain_name) {
        loc.observerScores.push(row.avg_observer);
        
        // Track per-domain-per-role scores
        if (!loc.roleDomainScores.has(row.domain_name)) {
          loc.roleDomainScores.set(row.domain_name, { dfi: [], rda: [] });
        }
        const domainBucket = loc.roleDomainScores.get(row.domain_name)!;
        
        if (roleName.includes(DFI_ROLE)) {
          domainBucket.dfi.push(row.avg_observer);
        } else if (roleName.includes(RDA_ROLE)) {
          domainBucket.rda.push(row.avg_observer);
        }
      }
    });

    // Convert to stats array
    const stats: LocationEvalStats[] = Array.from(byLocation.entries()).map(([locId, data]) => {
      const avgObserver = data.observerScores.length > 0
        ? data.observerScores.reduce((a, b) => a + b, 0) / data.observerScores.length
        : null;
      
      const avgSelf = data.selfScores.length > 0
        ? data.selfScores.reduce((a, b) => a + b, 0) / data.selfScores.length
        : null;
      
      // Build role-domain scores array
      const roleDomainScores: RoleDomainScore[] = [];
      data.roleDomainScores.forEach((scores, domainName) => {
        const dfiAvg = scores.dfi.length > 0 
          ? scores.dfi.reduce((a, b) => a + b, 0) / scores.dfi.length 
          : null;
        const rdaAvg = scores.rda.length > 0 
          ? scores.rda.reduce((a, b) => a + b, 0) / scores.rda.length 
          : null;
        
        // Only include if at least one role has data
        if (dfiAvg !== null || rdaAvg !== null) {
          roleDomainScores.push({ domainName, dfiAvg, rdaAvg });
        }
      });
      
      return {
        locationId: locId,
        locationName: data.locationName,
        dfiCount: data.dfiStaffIds.size,
        rdaCount: data.rdaStaffIds.size,
        staffCount: data.staffIds.size,
        staffWithEval: data.staffWithEval.size,
        avgObserver,
        avgSelf,
        gap: avgObserver !== null && avgSelf !== null ? avgObserver - avgSelf : null,
        roleDomainScores,
        accountabilityRate: null, // Placeholder for Phase 2
      };
    });

    // Sort by avg observer score (lowest first - needs attention)
    stats.sort((a, b) => {
      if (a.avgObserver === null && b.avgObserver === null) return 0;
      if (a.avgObserver === null) return 1;
      if (b.avgObserver === null) return -1;
      return a.avgObserver - b.avgObserver;
    });

    return stats;
  }, [rawData]);

  if (!filters.organizationId) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground">Please select an organization to view data.</p>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3, 4, 5, 6].map(i => (
          <Skeleton key={i} className="h-52" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-destructive">Error loading data: {error.message}</p>
        </CardContent>
      </Card>
    );
  }

  if (locationStats.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground">No location data found for the selected filters.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {locationStats.map(stats => (
        <LocationEvalCard
          key={stats.locationId}
          stats={stats}
          onClick={() => onLocationClick(stats.locationId, stats.locationName)}
        />
      ))}
    </div>
  );
}
