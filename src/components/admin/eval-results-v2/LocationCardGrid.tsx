import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { periodToDateRange, type EvalFilters } from '@/types/analytics';
import { LocationCardV2 } from './LocationCardV2';
import { 
  calcRate, 
  type EvalDistributionRow, 
  type LocationCardData 
} from '@/types/evalMetricsV2';

interface LocationCardGridProps {
  filters: EvalFilters;
  onLocationClick: (locationId: string, locationName: string) => void;
}

export function LocationCardGrid({ filters, onLocationClick }: LocationCardGridProps) {
  const { organizationId, evaluationPeriod, locationIds, roleIds } = filters;
  
  const types = evaluationPeriod.type === 'Baseline' ? ['Baseline'] : ['Quarterly'];
  const quarter = evaluationPeriod.type === 'Quarterly' ? evaluationPeriod.quarter : null;
  
  const { data: rawData, isLoading, error } = useQuery({
    queryKey: ['eval-distribution-metrics-locations', organizationId, evaluationPeriod, locationIds, roleIds],
    queryFn: async () => {
      if (!organizationId) return null;
      
      const { data, error } = await supabase.rpc('get_eval_distribution_metrics', {
        p_org_id: organizationId,
        p_types: types,
        p_program_year: evaluationPeriod.year,
        p_quarter: quarter,
        p_location_ids: locationIds.length > 0 ? locationIds : null,
        p_role_ids: roleIds.length > 0 ? roleIds : null
      });
      
      if (error) throw error;
      return data as EvalDistributionRow[];
    },
    enabled: !!organizationId
  });

  // Aggregate by location
  const locationCards: LocationCardData[] = rawData ? aggregateByLocation(rawData) : [];

  if (!organizationId) {
    return null;
  }

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3, 4, 5, 6].map(i => (
          <Card key={i}>
            <CardContent className="p-6">
              <Skeleton className="h-5 w-32 mb-4" />
              <Skeleton className="h-4 w-24 mb-2" />
              <Skeleton className="h-8 w-16 mb-2" />
              <Skeleton className="h-3 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-destructive">
        <CardContent className="py-8 text-center text-destructive">
          Error loading location data
        </CardContent>
      </Card>
    );
  }

  if (locationCards.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-8 text-center text-muted-foreground">
          No locations with evaluation data for this period
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {locationCards.map(card => (
        <LocationCardV2
          key={card.locationId}
          data={card}
          onClick={() => onLocationClick(card.locationId, card.locationName)}
        />
      ))}
    </div>
  );
}

function aggregateByLocation(rows: EvalDistributionRow[]): LocationCardData[] {
  const locationMap = new Map<string, {
    locationName: string;
    staffIds: Set<string>;
    staffWithEval: Set<string>;
    dfiCount: number;
    rdaCount: number;
    nItems: number;
    obsTopBox: number;
    obsBottomBox: number;
    mismatchCount: number;
    obsSum: number;
    obsCount: number;
    domainBottomBox: Map<string, { name: string; bottomBox: number; n: number }>;
  }>();

  for (const row of rows) {
    if (!locationMap.has(row.location_id)) {
      locationMap.set(row.location_id, {
        locationName: row.location_name,
        staffIds: new Set(),
        staffWithEval: new Set(),
        dfiCount: 0,
        rdaCount: 0,
        nItems: 0,
        obsTopBox: 0,
        obsBottomBox: 0,
        mismatchCount: 0,
        obsSum: 0,
        obsCount: 0,
        domainBottomBox: new Map()
      });
    }

    const loc = locationMap.get(row.location_id)!;
    loc.staffIds.add(row.staff_id);
    
    if (row.evaluation_id) {
      loc.staffWithEval.add(row.staff_id);
    }
    
    // Count roles (dedupe by staff)
    if (!loc.staffIds.has(row.staff_id)) {
      if (row.role_id === 1) loc.dfiCount++;
      else if (row.role_id === 2) loc.rdaCount++;
    }

    loc.nItems += row.n_items;
    loc.obsTopBox += row.obs_top_box;
    loc.obsBottomBox += row.obs_bottom_box;
    loc.mismatchCount += row.mismatch_count;
    
    if (row.obs_mean !== null) {
      loc.obsSum += row.obs_mean * row.n_items;
      loc.obsCount += row.n_items;
    }

    // Track domain bottom-box rates for "weakest domain"
    if (!loc.domainBottomBox.has(row.domain_name)) {
      loc.domainBottomBox.set(row.domain_name, { name: row.domain_name, bottomBox: 0, n: 0 });
    }
    const domain = loc.domainBottomBox.get(row.domain_name)!;
    domain.bottomBox += row.obs_bottom_box;
    domain.n += row.n_items;
  }

  // Convert to array and sort by top-box rate descending
  const cards: LocationCardData[] = [];
  
  for (const [locationId, loc] of locationMap) {
    const topBoxRate = calcRate(loc.obsTopBox, loc.nItems);
    const bottomBoxRate = calcRate(loc.obsBottomBox, loc.nItems);
    const mismatchRate = calcRate(loc.mismatchCount, loc.nItems);
    const obsMean = loc.obsCount > 0 ? loc.obsSum / loc.obsCount : null;
    
    // Find weakest domain (highest bottom-box rate)
    let weakestDomain: string | null = null;
    let worstRate = 0;
    for (const [_, domain] of loc.domainBottomBox) {
      if (domain.n > 0) {
        const rate = domain.bottomBox / domain.n;
        if (rate > worstRate) {
          worstRate = rate;
          weakestDomain = domain.name;
        }
      }
    }

    cards.push({
      locationId,
      locationName: loc.locationName,
      dfiCount: loc.dfiCount,
      rdaCount: loc.rdaCount,
      staffWithEval: loc.staffWithEval.size,
      topBoxRate,
      bottomBoxRate,
      mismatchRate,
      obsMean,
      weakestDomain,
      nItems: loc.nItems
    });
  }

  // Sort by top-box rate descending (best first)
  cards.sort((a, b) => b.topBoxRate - a.topBoxRate);
  
  return cards;
}
