import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { AlertCircle, Clock, CheckCircle, Trash2, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useSim } from '@/devtools/SimProvider';
import { enforceWeeklyRolloverNow } from '@/v2/rollover';
import { getOpenBacklogV2 } from '@/lib/backlog';
import { toast } from 'sonner';

interface BacklogItem {
  id: string;
  action_id: number;
  assigned_on: string;
  resolved_on?: string;
  source_cycle?: number;
  source_week?: number;
  pro_move?: {
    action_statement: string;
    competency?: {
      name: string;
      domain?: {
        domain_name: string;
      } | null;
    } | null;
  } | null;
}

export function BacklogDebugPanel() {
  const { user } = useAuth();
  const { simulatedTime } = useSim();
  const [backlogItems, setBacklogItems] = useState<any[]>([]);
  const [staff, setStaff] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [rolloverResult, setRolloverResult] = useState<any>(null);

  const loadData = async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      // Get staff info
      const { data: staffData } = await supabase
        .from('staff')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();
      
      setStaff(staffData);
      
      if (!staffData) return;

      // Get backlog items with pro_move details
      const { data: backlog } = await supabase
        .from('user_backlog_v2')
        .select(`
          *,
          pro_move:pro_moves!user_backlog_v2_action_id_fkey(
            action_statement,
            competency:competencies(
              name,
              domain:domains(domain_name)
            )
          )
        `)
        .eq('staff_id', staffData.id)
        .order('assigned_on', { ascending: true });
      
      setBacklogItems((backlog || []) as any[]);
    } catch (error) {
      console.error('Error loading backlog data:', error);
      toast.error('Failed to load backlog data');
    } finally {
      setLoading(false);
    }
  };

  const testRollover = async () => {
    if (!staff) return;
    
    setLoading(true);
    try {
      const now = simulatedTime || new Date();
      const result = await enforceWeeklyRolloverNow({
        userId: user!.id,
        staffId: staff.id,
        roleId: staff.role_id,
        locationId: staff.primary_location_id,
        now,
        debug: true
      });
      
      setRolloverResult(result);
      await loadData(); // Refresh data
      toast.success('Rollover test completed');
    } catch (error) {
      console.error('Rollover test failed:', error);
      toast.error('Rollover test failed');
    } finally {
      setLoading(false);
    }
  };

  const clearBacklog = async () => {
    if (!staff) return;
    
    setLoading(true);
    try {
      await supabase
        .from('user_backlog_v2')
        .update({ resolved_on: new Date().toISOString().split('T')[0] })
        .eq('staff_id', staff.id)
        .is('resolved_on', null);
      
      await loadData();
      toast.success('Backlog cleared');
    } catch (error) {
      console.error('Failed to clear backlog:', error);
      toast.error('Failed to clear backlog');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [user]);

  const openItems = backlogItems.filter(item => !item.resolved_on);
  const resolvedItems = backlogItems.filter(item => item.resolved_on);

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertCircle className="h-5 w-5" />
          Backlog Debug Panel
        </CardTitle>
        <CardDescription>
          Debug and test the backlog rollover system
        </CardDescription>
        <div className="flex gap-2">
          <Button onClick={loadData} disabled={loading} size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button onClick={testRollover} disabled={loading} size="sm" variant="outline">
            Test Rollover
          </Button>
          <Button onClick={clearBacklog} disabled={loading} size="sm" variant="destructive">
            <Trash2 className="h-4 w-4 mr-2" />
            Clear Backlog
          </Button>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Rollover Result */}
        {rolloverResult && (
          <div className="p-3 bg-muted rounded-lg">
            <h4 className="font-medium mb-2">Last Rollover Test Result:</h4>
            <div className="text-sm space-y-1">
              <div>Executed: <Badge variant={rolloverResult.executed ? "default" : "secondary"}>{rolloverResult.executed ? "Yes" : "No"}</Badge></div>
              <div>Reason: {rolloverResult.reason}</div>
              {rolloverResult.prevWeek && (
                <div>Previous Week: C{rolloverResult.prevWeek.cycle}W{rolloverResult.prevWeek.week}</div>
              )}
            </div>
          </div>
        )}

        {/* Open Backlog Items */}
        <div>
          <h4 className="font-medium mb-2 flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Open Items ({openItems.length})
          </h4>
          {openItems.length === 0 ? (
            <p className="text-sm text-muted-foreground">No open backlog items</p>
          ) : (
            <div className="space-y-2">
              {openItems.map((item) => (
                <div key={item.id} className="p-2 border rounded text-sm">
                  <div className="font-medium">{item.pro_move?.action_statement || `Action ID: ${item.action_id}`}</div>
                  <div className="text-muted-foreground">
                    {item.pro_move?.competency?.domain?.domain_name} • {item.pro_move?.competency?.name}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Added: {item.assigned_on} 
                    {item.source_cycle && item.source_week && (
                      <span> • From C{item.source_cycle}W{item.source_week}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {resolvedItems.length > 0 && (
          <>
            <Separator />
            <div>
              <h4 className="font-medium mb-2 flex items-center gap-2">
                <CheckCircle className="h-4 w-4" />
                Resolved Items ({resolvedItems.length})
              </h4>
              <div className="space-y-2">
                {resolvedItems.slice(0, 5).map((item) => (
                  <div key={item.id} className="p-2 border rounded text-sm opacity-60">
                    <div className="font-medium">{item.pro_move?.action_statement || `Action ID: ${item.action_id}`}</div>
                    <div className="text-xs text-muted-foreground">
                      Resolved: {item.resolved_on}
                    </div>
                  </div>
                ))}
                {resolvedItems.length > 5 && (
                  <p className="text-xs text-muted-foreground">...and {resolvedItems.length - 5} more</p>
                )}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}