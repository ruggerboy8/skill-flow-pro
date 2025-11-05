import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Navigate } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { SimpleFocusBuilder } from '@/components/admin/SimpleFocusBuilder';
import { ProMoveLibrary } from '@/components/admin/ProMoveLibrary';
import { WeeklyProMovesPanel } from '@/components/admin/WeeklyProMovesPanel';
import { DynamicFocusSection } from '@/components/admin/DynamicFocusSection';

export default function AdminBuilder() {
  console.log('=== NEW ADMINBUILDER LOADING ===');
  const { user } = useAuth();
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [orgId, setOrgId] = useState<string>('');

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

      // Get org_id from location
      if (staffData?.primary_location_id) {
        const { data: locationData } = await supabase
          .from('locations')
          .select('organization_id')
          .eq('id', staffData.primary_location_id)
          .single();
        
        if (locationData?.organization_id) {
          setOrgId(locationData.organization_id);
        }
      }
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
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="dfi">DFI Focus Builder</TabsTrigger>
          <TabsTrigger value="rda">RDA Focus Builder</TabsTrigger>
          <TabsTrigger value="promoves">Pro-Move Library</TabsTrigger>
          <TabsTrigger value="weekly">Weekly Pro Moves</TabsTrigger>
        </TabsList>
        
        <TabsContent value="dfi" className="space-y-6">
          <h2 className="text-xl font-semibold">Onboarding (Cycles 1–3)</h2>
          <SimpleFocusBuilder roleFilter={1} />
          
          <Separator className="my-8" />
          
          <h2 className="text-xl font-semibold">Dynamic (Cycle 4+)</h2>
          {orgId && <DynamicFocusSection roleId={1} orgId={orgId} />}
        </TabsContent>

        <TabsContent value="rda" className="space-y-6">
          <h2 className="text-xl font-semibold">Onboarding (Cycles 1–3)</h2>
          <SimpleFocusBuilder roleFilter={2} />
          
          <Separator className="my-8" />
          
          <h2 className="text-xl font-semibold">Dynamic (Cycle 4+)</h2>
          {orgId && <DynamicFocusSection roleId={2} orgId={orgId} />}
        </TabsContent>
        
        <TabsContent value="promoves" className="space-y-6">
          <ProMoveLibrary />
        </TabsContent>
        
        <TabsContent value="weekly" className="space-y-6">
          <WeeklyProMovesPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}