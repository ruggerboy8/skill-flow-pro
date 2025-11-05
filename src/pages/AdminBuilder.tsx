import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Navigate } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SimpleFocusBuilder } from '@/components/admin/SimpleFocusBuilder';
import { ProMoveLibrary } from '@/components/admin/ProMoveLibrary';
import { WeeklyProMovesPanel } from '@/components/admin/WeeklyProMovesPanel';

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
      const { data } = await supabase
        .from('staff')
        .select('is_super_admin')
        .eq('user_id', user.id)
        .single();

      setIsSuperAdmin(data?.is_super_admin || false);
      console.log('=== ADMIN STATUS RESULT ===', data?.is_super_admin);
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
          <SimpleFocusBuilder roleFilter={1} />
        </TabsContent>

        <TabsContent value="rda" className="space-y-6">
          <SimpleFocusBuilder roleFilter={2} />
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