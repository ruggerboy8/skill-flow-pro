import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Navigate, useNavigate } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { SimpleFocusBuilder } from '@/components/admin/SimpleFocusBuilder';
import { ProMoveLibrary } from '@/components/admin/ProMoveLibrary';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { RecommenderPanel } from '@/components/planner/RecommenderPanel';
import { HistoryPanel } from '@/components/planner/HistoryPanel';
import { WeekBuilderPanel } from '@/components/planner/WeekBuilderPanel';
import { usePlannerParams } from '@/hooks/usePlannerParams';

export default function AdminBuilder() {
  console.log('=== NEW ADMINBUILDER LOADING ===');
  const { user } = useAuth();
  const navigate = useNavigate();
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAdminStatus();
  }, [user]);

  const checkAdminStatus = async () => {
    console.log('=== CHECKING ADMIN STATUS ===', user?.email);
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      const { data: staffData } = await supabase
        .from('staff')
        .select('is_super_admin, primary_location_id')
        .eq('user_id', user.id)
        .single();

      setIsSuperAdmin(staffData?.is_super_admin || false);
      console.log('=== ADMIN STATUS RESULT ===', staffData?.is_super_admin);
    } catch (error) {
      setIsSuperAdmin(false);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    console.log('=== ADMINBUILDER LOADING ===');
    return (
      <div className="container mx-auto p-6">
        <div className="text-center">Loading...</div>
      </div>
    );
  }

  if (!user || !isSuperAdmin) {
    console.log('=== ACCESS DENIED ===', { user: !!user, isSuperAdmin });
    return <Navigate to="/" replace />;
  }

  console.log('=== RENDERING NEW TABBED INTERFACE ===');

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Admin Builder</h1>
        <Button variant="outline" onClick={() => navigate('/admin')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Admin
        </Button>
      </div>
      
      <Tabs defaultValue="onboarding" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="onboarding">Onboarding</TabsTrigger>
          <TabsTrigger value="dfi-planner">DFI Planner</TabsTrigger>
          <TabsTrigger value="rda-planner">RDA Planner</TabsTrigger>
          <TabsTrigger value="library">Pro-Move Library</TabsTrigger>
        </TabsList>
        
        <TabsContent value="onboarding" className="space-y-6">
          <div className="space-y-8">
            {/* DFI Section */}
            <Card>
              <CardHeader className="bg-muted/30">
                <h2 className="text-lg font-semibold">DFI Onboarding Builder</h2>
                <p className="text-sm text-muted-foreground">Configure week-by-week pro-move assignments for DFI onboarding (Cycles 1–3)</p>
              </CardHeader>
              <CardContent className="pt-6">
                <SimpleFocusBuilder roleFilter={1} />
              </CardContent>
            </Card>
            
            {/* RDA Section */}
            <Card>
              <CardHeader className="bg-muted/30">
                <h2 className="text-lg font-semibold">RDA Onboarding Builder</h2>
                <p className="text-sm text-muted-foreground">Configure week-by-week pro-move assignments for RDA onboarding (Cycles 1–3)</p>
              </CardHeader>
              <CardContent className="pt-6">
                <SimpleFocusBuilder roleFilter={2} />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="dfi-planner" className="space-y-6">
          <PlannerTabContent roleId={1} roleName="DFI" />
        </TabsContent>

        <TabsContent value="rda-planner" className="space-y-6">
          <PlannerTabContent roleId={2} roleName="RDA" />
        </TabsContent>
        
        <TabsContent value="library" className="space-y-6">
          <h2 className="text-xl font-semibold">Pro-Move Library</h2>
          <ProMoveLibrary />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function PlannerTabContent({ roleId, roleName }: { roleId: number; roleName: string }) {
  const { asOfWeek, preset, setAsOfWeek, setPreset } = usePlannerParams();

  return (
    <div className="space-y-6">
      <RecommenderPanel
        roleId={roleId}
        roleName={roleName}
        asOfWeek={asOfWeek}
        preset={preset}
        onWeekChange={setAsOfWeek}
        onPresetChange={setPreset}
      />

      <WeekBuilderPanel roleId={roleId} roleName={roleName} />

      <HistoryPanel roleId={roleId} roleName={roleName} />
    </div>
  );
}