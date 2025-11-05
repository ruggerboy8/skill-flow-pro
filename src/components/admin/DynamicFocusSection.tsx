import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { format, startOfWeek, addWeeks } from 'date-fns';
import { EditNextWeekModal } from './EditNextWeekModal';

interface WeekPlan {
  id: number;
  action_id: number | null;
  display_order: number;
  self_select: boolean;
  overridden: boolean;
  status: string;
  pro_moves?: { action_statement: string };
}

interface HealthStatus {
  ok: boolean;
  mode: string;
  enabled: boolean;
  gate_open: boolean;
  first_location_ready: any;
  first_dynamic_week_seeded: boolean;
  has_current_locked: { dfi: boolean; rda: boolean };
  has_next_proposed: { dfi: boolean; rda: boolean };
  org_timezone: string;
}

interface DynamicFocusSectionProps {
  roleId: number;
  orgId: string;
}

export function DynamicFocusSection({ roleId, orgId }: DynamicFocusSectionProps) {
  const { toast } = useToast();
  const [autoEnabled, setAutoEnabled] = useState(false);
  const [healthStatus, setHealthStatus] = useState<HealthStatus | null>(null);
  const [currentWeek, setCurrentWeek] = useState<WeekPlan[]>([]);
  const [nextWeek, setNextWeek] = useState<WeekPlan[]>([]);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [runningNow, setRunningNow] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAll();
  }, [roleId, orgId]);

  const loadAll = async () => {
    setLoading(true);
    await Promise.all([
      loadHealthStatus(),
      loadWeeks(),
      loadEnabledToggle()
    ]);
    setLoading(false);
  };

  const loadEnabledToggle = async () => {
    const { data } = await supabase
      .from('app_kv')
      .select('value')
      .eq('key', 'sequencer:auto_enabled')
      .single();
    
    setAutoEnabled((data?.value as any)?.enabled || false);
  };

  const loadHealthStatus = async () => {
    const { data } = await supabase.functions.invoke('sequencer-health', {
      body: { orgId }
    });
    
    if (data) setHealthStatus(data);
  };

  const loadWeeks = async () => {
    const now = new Date();
    const currentMonday = format(startOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd');
    const nextMonday = format(addWeeks(startOfWeek(now, { weekStartsOn: 1 }), 1), 'yyyy-MM-dd');

    // Load current week (locked)
    const { data: current } = await supabase
      .from('weekly_plan' as any)
      .select('*, pro_moves(action_statement)')
      .eq('org_id', orgId)
      .eq('role_id', roleId)
      .eq('week_start_date', currentMonday)
      .eq('status', 'locked')
      .order('display_order');

    setCurrentWeek((current as any) || []);

    // Load next week (proposed)
    const { data: next } = await supabase
      .from('weekly_plan' as any)
      .select('*, pro_moves(action_statement)')
      .eq('org_id', orgId)
      .eq('role_id', roleId)
      .eq('week_start_date', nextMonday)
      .eq('status', 'proposed')
      .order('display_order');

    setNextWeek((next as any) || []);
  };

  const handleToggleEnabled = async (enabled: boolean) => {
    const { error } = await supabase
      .from('app_kv')
      .upsert({
        key: 'sequencer:auto_enabled',
        value: { enabled }
      });

    if (!error) {
      setAutoEnabled(enabled);
      toast({
        title: enabled ? 'Automation Enabled' : 'Automation Disabled',
        description: enabled ? 'Weekly sequencing will run automatically' : 'Weekly sequencing is paused'
      });
      loadHealthStatus();
    }
  };

  const handleRunNow = async () => {
    setRunningNow(true);
    try {
      const { data, error } = await supabase.functions.invoke('sequencer-rollover', {
        body: { roles: [roleId], orgId }
      });

      if (error) throw error;

      toast({
        title: 'Sequencer Run Complete',
        description: `Status: ${data.results[0]?.status || 'success'}`
      });

      await loadWeeks();
      await loadHealthStatus();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setRunningNow(false);
    }
  };

  const getHealthMessage = () => {
    if (!healthStatus) return 'Loading...';
    
    if (!healthStatus.enabled) {
      return 'Automation is disabled';
    }

    if (!healthStatus.gate_open) {
      return 'Waiting: No locations at C3W6 yet—auto-start will trigger when the first one reaches it.';
    }

    if (!healthStatus.first_dynamic_week_seeded) {
      return 'Ready: First location reached C3W6—click Run Now to seed next week (or wait for the daily job).';
    }

    const roleName = roleId === 1 ? 'dfi' : 'rda';
    const hasLocked = healthStatus.has_current_locked[roleName];
    const hasProposed = healthStatus.has_next_proposed[roleName];

    if (hasLocked && hasProposed) {
      return 'Active: This Week is locked, Next Week is proposed.';
    }

    return 'Partial: Some weeks need generation.';
  };

  const getHealthColor = () => {
    if (!healthStatus?.enabled) return 'text-muted-foreground';
    if (!healthStatus.gate_open) return 'text-yellow-600';
    if (!healthStatus.first_dynamic_week_seeded) return 'text-blue-600';
    return 'text-green-600';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Automation Strip */}
      <Card>
        <CardHeader>
          <CardTitle>Automation Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <Switch 
              checked={autoEnabled} 
              onCheckedChange={handleToggleEnabled} 
            />
            <Label>Auto-sequence Weekly Pro Moves</Label>
          </div>
          
          <div className="space-y-1">
            <Label>Mode: Progress-gated</Label>
            <p className="text-sm text-muted-foreground">
              Auto-starts when first location reaches Cycle 3, Week 6
            </p>
          </div>

          <div className="space-y-1">
            <Label>Org Timezone</Label>
            <p className="text-sm text-muted-foreground">
              {healthStatus?.org_timezone || 'America/Chicago'}
            </p>
          </div>

          <div className="flex items-center gap-4">
            <Button 
              onClick={handleRunNow} 
              disabled={runningNow}
              variant="outline"
            >
              {runningNow ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Running...
                </>
              ) : (
                'Run Now'
              )}
            </Button>
            
            <div className={`flex items-center gap-2 ${getHealthColor()}`}>
              {healthStatus?.ok ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <AlertCircle className="h-4 w-4" />
              )}
              <span className="text-sm">{getHealthMessage()}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* This Week (Locked) */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>This Week (Locked)</CardTitle>
            <Badge variant="secondary">Locked</Badge>
          </div>
        </CardHeader>
        <CardContent>
          {currentWeek.length === 0 ? (
            <p className="text-muted-foreground text-sm">No locked week yet</p>
          ) : (
            <div className="space-y-2">
              {currentWeek.map((item) => (
                <div key={item.id} className="p-3 border rounded-lg bg-muted/30">
                  <span className="font-semibold text-sm">{item.display_order}.</span>{' '}
                  <span className="text-sm">{item.pro_moves?.action_statement || 'Self-Select'}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Next Week (Proposed) */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Next Week (Proposed)</CardTitle>
            {nextWeek.some(w => w.overridden) && (
              <Badge variant="outline">Manually adjusted</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {nextWeek.length === 0 ? (
            <p className="text-muted-foreground text-sm">No proposed week yet</p>
          ) : (
            <div className="space-y-2">
              {nextWeek.map((item) => (
                <div key={item.id} className="p-3 border rounded-lg bg-muted/30">
                  <span className="font-semibold text-sm">{item.display_order}.</span>{' '}
                  <span className="text-sm">{item.pro_moves?.action_statement || 'Self-Select'}</span>
                </div>
              ))}
            </div>
          )}
          <Button onClick={() => setEditModalOpen(true)} variant="outline">
            Edit next week
          </Button>
        </CardContent>
      </Card>

      {/* Edit Modal */}
      <EditNextWeekModal
        open={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        orgId={orgId}
        roleId={roleId}
        existingWeek={nextWeek}
        onSave={async () => {
          await loadWeeks();
          setEditModalOpen(false);
          toast({
            title: 'Next Week Updated',
            description: 'Manual adjustments saved'
          });
        }}
      />
    </div>
  );
}
