import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ChevronDown, LayoutGrid, List } from 'lucide-react';
import { FilterBar } from '@/components/admin/eval-results/FilterBar';
import { SummaryMetrics } from '@/components/admin/eval-results/SummaryMetrics';
import { LocationEvalCards } from '@/components/admin/eval-results/LocationEvalCards';
import { LocationEvalDetail } from '@/components/admin/eval-results/LocationEvalDetail';
import { StrengthsTab } from '@/components/admin/eval-results/StrengthsTab';
import type { EvalFilters } from '@/types/analytics';

type ViewLevel = 
  | { level: 'locations' }
  | { level: 'location-detail'; locationId: string; locationName: string };

type ViewMode = 'locations' | 'domains';

export default function EvalResults() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [isSuperAdmin, setIsSuperAdmin] = useState<boolean | null>(null);
  
  // View state: replaces tabs with hierarchical navigation
  const [view, setView] = useState<ViewLevel>({ level: 'locations' });
  const [viewMode, setViewMode] = useState<ViewMode>('locations');
  
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

  // Check if user is super admin
  useEffect(() => {
    async function checkSuperAdmin() {
      if (!user) {
        navigate('/login');
        return;
      }

      try {
        const { data, error } = await supabase.rpc('is_super_admin', {
          _user_id: user.id
        });

        if (error) throw error;

        if (!data) {
          navigate('/');
          return;
        }

        setIsSuperAdmin(true);
      } catch (error) {
        console.error('Error checking super admin status:', error);
        navigate('/');
      }
    }

    checkSuperAdmin();
  }, [user, navigate]);

  // Reset view when filters change (org changes should go back to locations)
  useEffect(() => {
    setView({ level: 'locations' });
  }, [filters.organizationId]);

  const handleLocationClick = (locationId: string, locationName: string) => {
    setView({ level: 'location-detail', locationId, locationName });
  };

  const handleBackToLocations = () => {
    setView({ level: 'locations' });
  };

  if (isSuperAdmin === null) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!isSuperAdmin) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold text-muted-foreground">Access Denied</h2>
        <p className="text-muted-foreground mt-2">You don't have permission to view this page.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold">Evaluation Results</h1>
          <p className="text-muted-foreground mt-1">
            Analyze evaluation data across organizations and locations
          </p>
        </div>
        
        {/* View mode selector - only show on locations view */}
        {view.level === 'locations' && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                {viewMode === 'locations' ? (
                  <>
                    <LayoutGrid className="mr-2 h-4 w-4" />
                    By Location
                  </>
                ) : (
                  <>
                    <List className="mr-2 h-4 w-4" />
                    By Domain
                  </>
                )}
                <ChevronDown className="ml-2 h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => setViewMode('locations')}>
                <LayoutGrid className="mr-2 h-4 w-4" />
                By Location
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setViewMode('domains')}>
                <List className="mr-2 h-4 w-4" />
                By Domain
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <FilterBar filters={filters} onFiltersChange={setFilters} />

      <SummaryMetrics filters={filters} />

      {/* Hierarchical content based on view state */}
      {view.level === 'locations' && viewMode === 'locations' && (
        <LocationEvalCards 
          filters={filters} 
          onLocationClick={handleLocationClick} 
        />
      )}

      {view.level === 'locations' && viewMode === 'domains' && (
        <StrengthsTab filters={filters} />
      )}

      {view.level === 'location-detail' && (
        <LocationEvalDetail
          filters={filters}
          locationId={view.locationId}
          locationName={view.locationName}
          onBack={handleBackToLocations}
        />
      )}
    </div>
  );
}