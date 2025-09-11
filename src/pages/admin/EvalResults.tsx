import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { FilterBar } from '@/components/admin/eval-results/FilterBar';
import { StrengthsTab } from '@/components/admin/eval-results/StrengthsTab';
import { ProMovesComparisonTab } from '@/components/admin/eval-results/ProMovesComparisonTab';
import { StaffLocationsTab } from '@/components/admin/eval-results/StaffLocationsTab';
import type { EvalFilters } from '@/types/analytics';


export default function EvalResults() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [isSuperAdmin, setIsSuperAdmin] = useState<boolean | null>(null);
  const [activeTab, setActiveTab] = useState('overview');
   
  const [filters, setFilters] = useState<EvalFilters>({
    organizationId: '',
    evaluationTypes: [],
    dateRange: {
      start: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), // 90 days ago
      end: new Date()
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Evaluation Results</h1>
        <p className="text-muted-foreground mt-2">
          Analyze evaluation data across organizations, domains, and competencies
        </p>
      </div>

      <FilterBar filters={filters} onFiltersChange={setFilters} />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="promoves">Pro-Moves vs Eval</TabsTrigger>
          <TabsTrigger value="individual">Individual Results</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6">
          <StrengthsTab filters={filters} />
        </TabsContent>

        <TabsContent value="promoves" className="mt-6">
          <ProMovesComparisonTab filters={filters} />
        </TabsContent>

        <TabsContent value="individual" className="mt-6">
          <StaffLocationsTab filters={filters} />
        </TabsContent>
      </Tabs>
    </div>
  );
}