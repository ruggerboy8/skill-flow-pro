import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Navigate } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { GlobalPlanManager } from '@/components/admin/GlobalPlanManager';
import { SimpleFocusBuilder } from '@/components/admin/SimpleFocusBuilder';
import { ProMoveLibrary } from '@/components/admin/ProMoveLibrary';
import { WeeklyProMovesPanel } from '@/components/admin/WeeklyProMovesPanel';
import { GlobalSequencerTest } from '@/components/admin/GlobalSequencerTest';

export default function AdminBuilder() {
  console.log('=== NEW ADMINBUILDER LOADING ===');
  const { user } = useAuth();
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
      <h1 className="text-3xl font-bold">Admin Builder</h1>
      
      <Tabs defaultValue="dfi" className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="dfi">DFI Plan</TabsTrigger>
          <TabsTrigger value="rda">RDA Plan</TabsTrigger>
          <TabsTrigger value="dfi-legacy">DFI Onboarding</TabsTrigger>
          <TabsTrigger value="rda-legacy">RDA Onboarding</TabsTrigger>
          <TabsTrigger value="library">Pro-Move Library</TabsTrigger>
        </TabsList>
        
        <TabsContent value="dfi" className="space-y-6">
          <GlobalPlanManager roleId={1} roleName="DFI" />
        </TabsContent>

        <TabsContent value="rda" className="space-y-6">
          <GlobalPlanManager roleId={2} roleName="RDA" />
        </TabsContent>
        
        <TabsContent value="dfi-legacy" className="space-y-6">
          <h2 className="text-xl font-semibold">Static Onboarding Builder - DFI (Cycles 1–3)</h2>
          <GlobalSequencerTest roleId={1} roleName="DFI" />
          <SimpleFocusBuilder roleFilter={1} />
        </TabsContent>

        <TabsContent value="rda-legacy" className="space-y-6">
          <h2 className="text-xl font-semibold">Static Onboarding Builder - RDA (Cycles 1–3)</h2>
          <GlobalSequencerTest roleId={2} roleName="RDA" />
          <SimpleFocusBuilder roleFilter={2} />
        </TabsContent>
        
        <TabsContent value="library" className="space-y-6">
          <h2 className="text-xl font-semibold">Pro-Move Library</h2>
          <ProMoveLibrary />
        </TabsContent>
      </Tabs>
    </div>
  );
}