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
import { getDomainColor } from '@/lib/domainColors';

interface WeekPlan {
  id: number;
  action_id: number | null;
  display_order: number;
  self_select: boolean;
  overridden: boolean;
  status: string;
  pro_moves?: { 
    action_statement: string;
    competencies: {
      domains: {
        domain_name: string;
      };
    };
  };
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
  orgId?: string; // Optional now - global mode
}

export function DynamicFocusSection({ roleId }: DynamicFocusSectionProps) {
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
  }, [roleId]);

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
    const { data, error } = await supabase.functions.invoke('sequencer-health', {
      body: {}
    });
    
    if (data) setHealthStatus(data);
  };

  const loadWeeks = async () => {
    const now = new Date();
    const currentMonday = format(startOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd');
    const nextMonday = format(addWeeks(startOfWeek(now, { weekStartsOn: 1 }), 1), 'yyyy-MM-dd');

    // Load current week (locked) - global plan (org_id IS NULL)
    const { data: current } = await supabase
      .from('weekly_plan' as any)
      .select('*, pro_moves(action_statement, competencies(domains!competencies_domain_id_fkey(domain_name)))')
      .is('org_id', null)
      .eq('role_id', roleId)
      .eq('week_start_date', currentMonday)
      .eq('status', 'locked')
      .order('display_order');

    setCurrentWeek((current as any) || []);

    // Load next week (proposed) - global plan
    const { data: next } = await supabase
      .from('weekly_plan' as any)
      .select('*, pro_moves(action_statement, competencies(domains!competencies_domain_id_fkey(domain_name)))')
      .is('org_id', null)
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
        body: { roles: [roleId], force: true }
      });

      if (error) throw error;

      toast({
        title: 'Global Sequencer Run Complete',
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

  const handleSimulateMonday = async () => {
    setRunningNow(true);
    try {
      // Simulate being on Monday 11/10 at 12:01am to trigger rollover
      const { data, error } = await supabase.functions.invoke('sequencer-rollover', {
        body: { 
          roles: [roleId], 
          asOf: '2025-11-10T06:01:00Z',  // 12:01am CT on Monday 11/10
          force: true
        }
      });

      if (error) throw error;

      toast({
        title: 'Monday Rollover Complete',
        description: `Advanced to next week`
      });

      // After rollover: 11/10 should be locked, 11/17 should be proposed
      await loadWeeksForSimulation('2025-11-10', '2025-11-17');
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

  const loadWeeksForSimulation = async (currentWeekStr: string, nextWeekStr: string) => {
    // Load current week (locked) - global plan
    const { data: current } = await supabase
      .from('weekly_plan' as any)
      .select('*, pro_moves(action_statement, competencies(domains!competencies_domain_id_fkey(domain_name)))')
      .is('org_id', null)
      .eq('role_id', roleId)
      .eq('week_start_date', currentWeekStr)
      .eq('status', 'locked')
      .order('display_order');

    setCurrentWeek((current as any) || []);

    // Load next week (proposed) - global plan
    const { data: next } = await supabase
      .from('weekly_plan' as any)
      .select('*, pro_moves(action_statement, competencies(domains!competencies_domain_id_fkey(domain_name)))')
      .is('org_id', null)
      .eq('role_id', roleId)
      .eq('week_start_date', nextWeekStr)
      .eq('status', 'proposed')
      .order('display_order');

    setNextWeek((next as any) || []);
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
      {/* Global Sequencer Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Global Sequencer</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <Switch 
              checked={autoEnabled} 
              onCheckedChange={handleToggleEnabled} 
            />
            <Label>Auto-sequence Weekly Pro Moves (Global)</Label>
          </div>
          
          <div className="space-y-1">
            <Label>Mode</Label>
            <p className="text-sm text-muted-foreground">
              Global • Progress-gated (auto-starts when any location reaches C3W6)
            </p>
          </div>

          <div className="space-y-1">
            <Label>Global Timezone</Label>
            <p className="text-sm text-muted-foreground">
              {healthStatus?.org_timezone || 'America/Chicago'}
            </p>
          </div>

          <div className="flex items-center gap-4 flex-wrap">
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
            
            <Button 
              onClick={handleSimulateMonday} 
              disabled={runningNow}
              variant="secondary"
            >
              🧪 Test Monday Rollover
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
            <div className="space-y-3">
              {currentWeek.map((item) => {
                const domainName = item.pro_moves?.competencies?.domains?.domain_name;
                const bgColor = domainName ? getDomainColor(domainName) : undefined;
                
                return (
                  <div 
                    key={item.id} 
                    className="rounded-lg p-4 border-2"
                    style={bgColor ? { backgroundColor: bgColor, borderColor: bgColor } : undefined}
                  >
                    {domainName && (
                      <Badge 
                        variant="secondary" 
                        className="text-xs font-semibold mb-2 bg-white/80 text-gray-900"
                      >
                        {domainName}
                      </Badge>
                    )}
                    <div className="flex items-start gap-2">
                      <span className="font-bold text-sm">{item.display_order}.</span>
                      <span className="text-sm font-medium">
                        {item.pro_moves?.action_statement || 'Self-Select'}
                      </span>
                    </div>
                  </div>
                );
              })}
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
            <div className="space-y-3">
              {nextWeek.map((item) => {
                const domainName = item.pro_moves?.competencies?.domains?.domain_name;
                const bgColor = domainName ? getDomainColor(domainName) : undefined;
                
                return (
                  <div 
                    key={item.id} 
                    className="rounded-lg p-4 border-2"
                    style={bgColor ? { backgroundColor: bgColor, borderColor: bgColor } : undefined}
                  >
                    {domainName && (
                      <Badge 
                        variant="secondary" 
                        className="text-xs font-semibold mb-2 bg-white/80 text-gray-900"
                      >
                        {domainName}
                      </Badge>
                    )}
                    <div className="flex items-start gap-2">
                      <span className="font-bold text-sm">{item.display_order}.</span>
                      <span className="text-sm font-medium">
                        {item.pro_moves?.action_statement || 'Self-Select'}
                      </span>
                    </div>
                  </div>
                );
              })}
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
        orgId={null}
        roleId={roleId}
        existingWeek={nextWeek}
        onSave={async () => {
          await loadWeeks();
          setEditModalOpen(false);
          toast({
            title: 'Next Week Updated (Global)',
            description: 'Manual adjustments saved to global plan'
          });
        }}
      />
    </div>
  );
}
