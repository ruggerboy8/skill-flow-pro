import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Navigate } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SimpleFocusBuilder } from '@/components/admin/SimpleFocusBuilder';
import { ProMoveLibrary } from '@/components/admin/ProMoveLibrary';
import { OrgSequencerPanel } from '@/components/admin/sequencer/OrgSequencerPanel';
import { WeeklyPlansPanel } from '@/components/admin/WeeklyPlansPanel';

export default function AdminBuilder() {
  const { user } = useAuth();
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAdminStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const checkAdminStatus = async () => {
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

      setIsSuperAdmin(Boolean(data?.is_super_admin));
    } catch {
      setIsSuperAdmin(false);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center text-sm text-muted-foreground">Loading…</div>
      </div>
    );
  }

  if (!user || !isSuperAdmin) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <h1 className="text-3xl font-bold">Admin Builder</h1>

      {/* Top-level tabs: Static Cycles / Pro-Move Library / Org Sequencer / Weekly Plans */}
      <Tabs defaultValue="static" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="static">Static Cycles</TabsTrigger>
          <TabsTrigger value="library">Pro-Move Library</TabsTrigger>
          <TabsTrigger value="sequencer">Org Sequencer</TabsTrigger>
          <TabsTrigger value="weekly-plans">Weekly Plans</TabsTrigger>
        </TabsList>

        {/* Static Cycles: nested role tabs */}
        <TabsContent value="static" className="space-y-6">
          <div className="space-y-2">
            <h2 className="text-xl font-semibold">Static Cycles</h2>
            <p className="text-sm text-muted-foreground">
              Manage the initial static cycles for each role. (No changes to behavior—just moved here.)
            </p>
          </div>

          <Tabs defaultValue="dfi" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="dfi">DFI</TabsTrigger>
              <TabsTrigger value="rda">RDA</TabsTrigger>
            </TabsList>

            <TabsContent value="dfi" className="space-y-6">
              <SimpleFocusBuilder roleFilter={1} />
            </TabsContent>

            <TabsContent value="rda" className="space-y-6">
              <SimpleFocusBuilder roleFilter={2} />
            </TabsContent>
          </Tabs>
        </TabsContent>

        {/* Pro-Move Library (unchanged) */}
        <TabsContent value="library" className="space-y-6">
          <div className="space-y-2">
            <h2 className="text-xl font-semibold">Pro-Move Library</h2>
            <p className="text-sm text-muted-foreground">
              Browse and maintain the library of Pro Moves.
            </p>
          </div>
          <ProMoveLibrary />
        </TabsContent>

        {/* Org Sequencer */}
        <TabsContent value="sequencer" className="space-y-6">
          <div className="space-y-2">
            <h2 className="text-xl font-semibold">Org Sequencer</h2>
            <p className="text-sm text-muted-foreground">
              Run dry-runs to preview next week and N+1 using NeedScore v1 algorithm. No database writes.
            </p>
          </div>
          <OrgSequencerPanel />
        </TabsContent>

        {/* Weekly Plans */}
        <TabsContent value="weekly-plans" className="space-y-6">
          <div className="space-y-2">
            <h2 className="text-xl font-semibold">Weekly Plans</h2>
            <p className="text-sm text-muted-foreground">
              View computed weekly plans and override the preview week if needed.
            </p>
          </div>
          <WeeklyPlansPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}