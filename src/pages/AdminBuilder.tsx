import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Navigate, useNavigate } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Calendar } from 'lucide-react';
import { SimpleFocusBuilder } from '@/components/admin/SimpleFocusBuilder';
import { ProMoveLibrary } from '@/components/admin/ProMoveLibrary';
import { SequencerDevPanel } from '@/components/admin/SequencerDevPanel';

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
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate('/admin')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Admin
          </Button>
          <Button variant="outline" onClick={() => navigate('/planner/dfi')} className="gap-2">
            <Calendar className="h-4 w-4" />
            DFI Planner
          </Button>
          <Button variant="outline" onClick={() => navigate('/planner/rda')} className="gap-2">
            <Calendar className="h-4 w-4" />
            RDA Planner
          </Button>
        </div>
      </div>
      
      <Tabs defaultValue="dfi" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="dfi">DFI</TabsTrigger>
          <TabsTrigger value="rda">RDA</TabsTrigger>
          <TabsTrigger value="library">Pro-Move Library</TabsTrigger>
        </TabsList>
        
        <TabsContent value="dfi" className="space-y-6">
          <h2 className="text-xl font-semibold">Legacy Week Builder (Cycles 1–3)</h2>
          <SimpleFocusBuilder roleFilter={1} />
          
          <h2 className="text-xl font-semibold mt-8">Pro-Move Recommender</h2>
          <SequencerDevPanel roleId={1} roleName="DFI" />
        </TabsContent>

        <TabsContent value="rda" className="space-y-6">
          <h2 className="text-xl font-semibold">Legacy Week Builder (Cycles 1–3)</h2>
          <SimpleFocusBuilder roleFilter={2} />
          
          <h2 className="text-xl font-semibold mt-8">Pro-Move Recommender</h2>
          <SequencerDevPanel roleId={2} roleName="RDA" />
        </TabsContent>
        
        <TabsContent value="library" className="space-y-6">
          <h2 className="text-xl font-semibold">Pro-Move Library</h2>
          <ProMoveLibrary />
        </TabsContent>
      </Tabs>
    </div>
  );
}