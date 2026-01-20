import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Skeleton } from '@/components/ui/skeleton';
import { FilterBar } from '@/components/admin/eval-results/FilterBar';
import { OrgSummaryStrip } from '@/components/admin/eval-results-v2/OrgSummaryStrip';
import { LocationCardGrid } from '@/components/admin/eval-results-v2/LocationCardGrid';
import { LocationDetailV2 } from '@/components/admin/eval-results-v2/LocationDetailV2';
import type { EvalFilters } from '@/types/analytics';
import type { EvalResultsV2View } from '@/types/evalMetricsV2';

export default function EvalResultsV2() {
  const { user, isSuperAdmin: authIsSuperAdmin, isOrgAdmin } = useAuth();
  const navigate = useNavigate();
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);
  
  // Hierarchical view state
  const [view, setView] = useState<EvalResultsV2View>({ level: 'org-snapshot' });
  
  // Initialize with period-based filters
  const currentYear = new Date().getFullYear();
  const currentQuarter = `Q${Math.ceil((new Date().getMonth() + 1) / 3)}` as 'Q1' | 'Q2' | 'Q3' | 'Q4';
  
  const [filters, setFilters] = useState<EvalFilters>({
    organizationId: '',
    evaluationPeriod: {
      type: 'Quarterly',
      quarter: currentQuarter,
      year: currentYear
    },
    locationIds: [],
    roleIds: [],
    includeNoEvals: true,
    windowDays: 42
  });

  // Check if user has admin access (super admin OR org admin)
  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }

    // Use auth roles directly - no need for extra RPC call
    if (authIsSuperAdmin || isOrgAdmin) {
      setHasAccess(true);
    } else {
      setHasAccess(false);
      navigate('/');
    }
  }, [user, authIsSuperAdmin, isOrgAdmin, navigate]);

  // Reset view when org changes
  useEffect(() => {
    setView({ level: 'org-snapshot' });
  }, [filters.organizationId]);

  const handleLocationClick = (locationId: string, locationName: string) => {
    setView({ level: 'location-detail', locationId, locationName });
  };

  const handleBackToOrg = () => {
    setView({ level: 'org-snapshot' });
  };

  if (hasAccess === null) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!hasAccess) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold text-muted-foreground">Access Denied</h2>
        <p className="text-muted-foreground mt-2">You don't have permission to view this page.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Evaluation Results 2.0</h1>
        <p className="text-muted-foreground mt-1">
          Distribution-based metrics for actionable insights
        </p>
      </div>

      <FilterBar filters={filters} onFiltersChange={setFilters} />

      {view.level === 'org-snapshot' && (
        <>
          <OrgSummaryStrip filters={filters} />
          <LocationCardGrid 
            filters={filters} 
            onLocationClick={handleLocationClick} 
          />
        </>
      )}

      {view.level === 'location-detail' && (
        <LocationDetailV2
          filters={filters}
          locationId={view.locationId}
          locationName={view.locationName}
          onBack={handleBackToOrg}
        />
      )}
    </div>
  );
}
