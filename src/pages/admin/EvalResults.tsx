import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { FilterBar } from '@/components/admin/eval-results/FilterBar';
import { SummaryMetrics } from '@/components/admin/eval-results/SummaryMetrics';
import { StrengthsTab } from '@/components/admin/eval-results/StrengthsTab';
import { ProMovesComparisonTab } from '@/components/admin/eval-results/ProMovesComparisonTab';
import { StaffLocationsTab } from '@/components/admin/eval-results/StaffLocationsTab';
import { IndividualResultsTab } from '@/components/admin/eval-results/IndividualResultsTab';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Info } from 'lucide-react';
import type { EvalFilters } from '@/types/analytics';


export default function EvalResults() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [isSuperAdmin, setIsSuperAdmin] = useState<boolean | null>(null);
  const [activeTab, setActiveTab] = useState('locations');
  
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

  // Tab explanations
  const tabExplanations: Record<string, string> = {
    locations: 'Evaluation results grouped by location. View average scores across domains for each location.',
    staff: 'Individual staff evaluation scores across all domains. Click a cell to see competency-level details.',
    alignment: 'Compares staff self-reported confidence and performance scores (from weekly pro-moves submissions) against their evaluation results. Positive deltas indicate self-scores were higher than observer scores.',
    domains: 'Overview of evaluation scores by domain and competency. Expand domains to see individual competency averages.'
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Evaluation Results</h1>
        <p className="text-muted-foreground mt-2">
          Analyze evaluation data across organizations, locations, and staff
        </p>
      </div>

      <FilterBar filters={filters} onFiltersChange={setFilters} />

      <SummaryMetrics filters={filters} />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="locations">By Location</TabsTrigger>
          <TabsTrigger value="staff">By Staff</TabsTrigger>
          <TabsTrigger value="alignment">Pro-Moves Alignment</TabsTrigger>
          <TabsTrigger value="domains">Domain Detail</TabsTrigger>
        </TabsList>

        {/* Tab explanation */}
        <Alert className="mt-4 bg-muted/50 border-muted">
          <Info className="h-4 w-4" />
          <AlertDescription className="text-sm text-muted-foreground">
            {tabExplanations[activeTab]}
          </AlertDescription>
        </Alert>

        <TabsContent value="locations" className="mt-4">
          <StaffLocationsTab filters={filters} />
        </TabsContent>

        <TabsContent value="staff" className="mt-4">
          <IndividualResultsTab filters={filters} />
        </TabsContent>

        <TabsContent value="alignment" className="mt-4">
          <ProMovesComparisonTab filters={filters} />
        </TabsContent>

        <TabsContent value="domains" className="mt-4">
          <StrengthsTab filters={filters} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
