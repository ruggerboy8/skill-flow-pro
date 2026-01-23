import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft } from 'lucide-react';
import { type EvalFilters } from '@/types/analytics';
import { LocationDomainDistribution } from './LocationDomainDistribution';
import { StaffResultsTableV2 } from './StaffResultsTableV2';
import { LocationSummaryPanel } from './LocationSummaryPanel';
import { StaffDetailDrawerV2 } from './StaffDetailDrawerV2';
import { type EvalDistributionRow } from '@/types/evalMetricsV2';

interface LocationDetailV2Props {
  filters: EvalFilters;
  locationId: string;
  locationName: string;
  onBack: () => void;
}

interface LocationStaff {
  id: string;
  name: string;
  role_id: number | null;
  role_name: string | null;
}

export function LocationDetailV2({ filters, locationId, locationName, onBack }: LocationDetailV2Props) {
  const { organizationId, evaluationPeriod, roleIds } = filters;
  
  // Staff detail drawer state
  const [drawerState, setDrawerState] = useState<{
    open: boolean;
    staffId: string;
    staffName: string;
    evaluationId: string | null;
  }>({ open: false, staffId: '', staffName: '', evaluationId: null });
  
  const types = evaluationPeriod.type === 'Baseline' ? ['Baseline'] : ['Quarterly'];
  const quarter = evaluationPeriod.type === 'Quarterly' ? evaluationPeriod.quarter : null;
  
  // Fetch all active staff for this location (excluding paused)
  const { data: locationStaff } = useQuery({
    queryKey: ['location-staff', locationId, roleIds],
    queryFn: async () => {
      let query = supabase
        .from('staff')
        .select('id, name, role_id, roles:roles!staff_role_id_fkey(role_name)')
        .eq('primary_location_id', locationId)
        .eq('is_participant', true)
        .eq('is_paused', false)
        .eq('is_org_admin', false);
      
      if (roleIds.length > 0) {
        query = query.in('role_id', roleIds);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      
      return (data || []).map(s => ({
        id: s.id,
        name: s.name,
        role_id: s.role_id,
        role_name: (s.roles as any)?.role_name || null
      })) as LocationStaff[];
    },
    enabled: !!locationId
  });
  
  // Fetch evaluation data
  const { data: rawData, isLoading, error } = useQuery({
    queryKey: ['eval-distribution-location-detail', organizationId, locationId, evaluationPeriod, roleIds],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_eval_distribution_metrics', {
        p_org_id: organizationId,
        p_types: types,
        p_program_year: evaluationPeriod.year,
        p_quarter: quarter,
        p_location_ids: [locationId],
        p_role_ids: roleIds.length > 0 ? roleIds : null
      });
      
      if (error) throw error;
      return data as EvalDistributionRow[];
    },
    enabled: !!organizationId && !!locationId
  });

  // Merge: all location staff + evaluation data
  const mergedData = useMemo(() => {
    if (!locationStaff) return rawData || [];
    
    // Get staff IDs that have evaluation data
    const staffWithEvals = new Set((rawData || []).map(r => r.staff_id));
    
    // Create placeholder rows for staff without evals
    const placeholderRows: EvalDistributionRow[] = locationStaff
      .filter(s => !staffWithEvals.has(s.id))
      .map(s => ({
        staff_id: s.id,
        staff_name: s.name,
        role_id: s.role_id || 0,
        role_name: s.role_name || 'Unknown',
        location_id: locationId,
        location_name: locationName,
        domain_id: 0,
        domain_name: '__placeholder__', // Special marker for no eval
        evaluation_id: null,
        evaluation_status: null,
        obs_top_box: 0,
        obs_bottom_box: 0,
        self_top_box: 0,
        self_bottom_box: 0,
        mismatch_count: 0,
        obs_mean: null,
        self_mean: null,
        n_items: 0
      }));
    
    return [...(rawData || []), ...placeholderRows];
  }, [rawData, locationStaff, locationId, locationName]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-3 gap-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <Skeleton className="h-64" />
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

  return (
    <div className="space-y-6">
      {/* Header with Back Button */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Locations
        </Button>
        <div>
          <h2 className="text-2xl font-bold">{locationName}</h2>
          <p className="text-sm text-muted-foreground">
            {evaluationPeriod.type === 'Baseline' 
              ? `Baseline ${evaluationPeriod.year}`
              : `${evaluationPeriod.quarter} ${evaluationPeriod.year}`
            }
          </p>
        </div>
      </div>

      {/* Domain Performance with Distribution Charts (Top) */}
      <LocationDomainDistribution data={rawData || []} />

      {/* Calibration and Weekly Practice Cards */}
      <LocationSummaryPanel data={rawData || []} locationId={locationId} evaluationPeriod={evaluationPeriod} />

      {/* Staff Results Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Staff Results</CardTitle>
        </CardHeader>
        <CardContent>
          <StaffResultsTableV2 
            data={mergedData} 
            filters={filters}
            onRowClick={(staffId, staffName, evaluationId) => setDrawerState({ open: true, staffId, staffName, evaluationId })}
          />
        </CardContent>
      </Card>

      {/* Staff Detail Drawer */}
      <StaffDetailDrawerV2
        open={drawerState.open}
        onOpenChange={(open) => setDrawerState(prev => ({ ...prev, open }))}
        staffId={drawerState.staffId}
        staffName={drawerState.staffName}
        evaluationId={drawerState.evaluationId}
        locationName={locationName}
        filters={filters}
      />
    </div>
  );
}
