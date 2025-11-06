import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Loader2, AlertTriangle } from 'lucide-react';
import { addWeeks, addDays } from 'date-fns';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';

const APP_TZ = 'America/Chicago';

interface GlobalSequencerTestProps {
  roleId: number;
  roleName: string;
}

function mondayStrings(asOf?: string) {
  const now = asOf ? new Date(asOf) : new Date();
  // Get ISO day (1=Mon..7=Sun) in APP_TZ
  const isoDow = Number(formatInTimeZone(now, APP_TZ, 'i'));
  const todayStr = formatInTimeZone(now, APP_TZ, 'yyyy-MM-dd');
  const todayMidnight = fromZonedTime(`${todayStr}T00:00:00`, APP_TZ);
  const localMonday = addDays(todayMidnight, -(isoDow - 1));
  const nextLocalMonday = addWeeks(localMonday, 1);
  const thisMondayStr = formatInTimeZone(localMonday, APP_TZ, 'yyyy-MM-dd');
  const nextMondayStr = formatInTimeZone(nextLocalMonday, APP_TZ, 'yyyy-MM-dd');
  return { thisMondayStr, nextMondayStr };
}

export function GlobalSequencerTest({ roleId, roleName }: GlobalSequencerTestProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [seedPickerOpen, setSeedPickerOpen] = useState(false);
  const [overridePickerOpen, setOverridePickerOpen] = useState(false);
  const [previewData, setPreviewData] = useState<any>(null);
  const [proMoves, setProMoves] = useState<any[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  // Load pro moves for picker
  const loadProMoves = async () => {
    const { data } = await supabase
      .from('pro_moves')
      .select('action_id, action_statement')
      .eq('role_id', roleId)
      .eq('active', true)
      .order('action_statement')
      .limit(50);
    setProMoves(data || []);
  };

  // Seed current week (locked) + next week (proposed)
  const handleSeed = async (picksThis: number[], picksNext: number[]) => {
    if (picksThis.length !== 3 || picksNext.length !== 3) {
      toast({ title: 'Error', description: 'Must select exactly 3 moves per week', variant: 'destructive' });
      return;
    }

    setLoading(true);
    try {
      const { thisMondayStr, nextMondayStr } = mondayStrings();

      // Delete existing rows
      await supabase
        .from('weekly_plan')
        .delete()
        .is('org_id', null)
        .eq('role_id', roleId)
        .in('week_start_date', [thisMondayStr, nextMondayStr]);

      // Insert locked (this week) + proposed (next week)
      const mkRows = (dateStr: string, actionIds: number[], status: 'locked' | 'proposed') =>
        actionIds.slice(0, 3).map((action_id, i) => ({
          role_id: roleId,
          week_start_date: dateStr,
          display_order: i + 1,
          action_id,
          status,
          generated_by: 'auto',
          org_id: null,
          self_select: false,
          overridden: false,
          ...(status === 'locked' ? { locked_at: new Date().toISOString() } : {}),
        }));

      const { error } = await supabase.from('weekly_plan').insert([
        ...mkRows(thisMondayStr, picksThis, 'locked'),
        ...mkRows(nextMondayStr, picksNext, 'proposed'),
      ]);

      if (error) throw error;

      toast({
        title: 'Success',
        description: `Seeded ${thisMondayStr} (locked) + ${nextMondayStr} (proposed)`,
      });
      setSeedPickerOpen(false);
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  // Override proposed week
  const handleOverride = async (newActions: number[]) => {
    if (newActions.length !== 3) {
      toast({ title: 'Error', description: 'Must select exactly 3 moves', variant: 'destructive' });
      return;
    }

    setLoading(true);
    try {
      const { nextMondayStr } = mondayStrings();

      // Upsert with manual + overridden flags
      for (let i = 0; i < 3; i++) {
        const { error } = await supabase.from('weekly_plan').upsert(
          {
            role_id: roleId,
            week_start_date: nextMondayStr,
            display_order: i + 1,
            action_id: newActions[i],
            status: 'proposed',
            generated_by: 'manual',
            overridden: true,
            overridden_at: new Date().toISOString(),
            org_id: null,
            self_select: false,
          },
          { onConflict: 'role_id,week_start_date,display_order' }
        );

        if (error) throw error;
      }

      toast({
        title: 'Success',
        description: `Overridden ${nextMondayStr} (proposed) with manual picks`,
      });
      setOverridePickerOpen(false);
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  // Simulate Monday rollover
  const handleSimulateRollover = async () => {
    setLoading(true);
    try {
      const { nextMondayStr } = mondayStrings();
      const asOf = `${nextMondayStr}T06:01:00Z`;

      const { data, error } = await supabase.functions.invoke('sequencer-rollover', {
        body: { roles: [roleId], asOf, force: true },
      });

      if (error) throw error;

      toast({
        title: 'Rollover Simulated',
        description: `Proposed → Locked, new Proposed generated`,
      });
      
      console.log('[Rollover Result]', data);
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  // Clear test data (weekly_plan)
  const handleClear = async () => {
    setLoading(true);
    try {
      const { thisMondayStr, nextMondayStr } = mondayStrings();

      const { error } = await supabase
        .from('weekly_plan')
        .delete()
        .is('org_id', null)
        .eq('role_id', roleId)
        .in('week_start_date', [thisMondayStr, nextMondayStr]);

      if (error) throw error;

      toast({ title: 'Success', description: 'Test data cleared' });
      setPreviewData(null);
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  // Delete old Cycle 4 weekly_focus rows (cleanup legacy data)
  const handleClearLegacyC4 = async () => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from('weekly_focus')
        .delete()
        .eq('role_id', roleId)
        .eq('cycle', 4);

      if (error) throw error;

      toast({ title: 'Success', description: 'Cleared Cycle 4 weekly_focus rows' });
      setPreviewData(null);
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  // Preview as me (read path proof)
  const handlePreview = async () => {
    setLoading(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error('Not authenticated');

      const { data: staffData } = await supabase
        .from('staff')
        .select('id, role_id, primary_location_id')
        .eq('user_id', userData.user.id)
        .single();

      if (!staffData) throw new Error('No staff record');

      // Import week assembly to get current week data
      const { assembleCurrentWeek } = await import('@/lib/weekAssembly');
      const weekData = await assembleCurrentWeek(userData.user.id);

      // Also check raw weekly_plan for this role
      const { thisMondayStr } = mondayStrings();
      const { data: planRows } = await supabase
        .from('weekly_plan')
        .select('id, action_id, status, display_order')
        .is('org_id', null)
        .eq('role_id', staffData.role_id)
        .eq('week_start_date', thisMondayStr)
        .order('display_order');

      setPreviewData({
        source: weekData.assignments.length > 0 ? 'detected' : 'none',
        assignments: weekData.assignments,
        cycleNumber: weekData.cycleNumber,
        weekInCycle: weekData.weekInCycle,
        rawPlanRows: planRows || [],
      });

      toast({ title: 'Preview Loaded', description: `Found ${weekData.assignments.length} assignments` });
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const { thisMondayStr, nextMondayStr } = mondayStrings();

  return (
    <Card className="border-primary/20">
      <CardHeader>
        <CardTitle className="text-lg">Legacy Test Panel ({roleName})</CardTitle>
        <CardDescription>
          Legacy tools for testing. Use Sequencer Controls (Dev) for production workflows.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button onClick={handlePreview} disabled={loading} size="sm" variant="secondary">
            Preview As Me
          </Button>
          <Button onClick={handleClearLegacyC4} disabled={loading} size="sm" variant="outline">
            Clear Legacy Cycle 4
          </Button>
        </div>

        {/* Danger Zone - Manual Bypass */}
        <div className="mt-6 p-4 border-2 border-destructive/50 rounded-lg space-y-2">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <span className="font-semibold text-destructive">Danger Zone - Bypass Sequencer (Dev Only)</span>
          </div>
          <p className="text-sm text-muted-foreground mb-3">
            These actions bypass the sequencer. Use only for emergency data seeding.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => { loadProMoves(); setSeedPickerOpen(true); }} disabled={loading} size="sm" variant="destructive">
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Manual Seed (6 Moves)
            </Button>
            <Button onClick={() => { loadProMoves(); setOverridePickerOpen(true); }} disabled={loading} size="sm" variant="outline">
              Manual Override
            </Button>
            <Button onClick={handleSimulateRollover} disabled={loading} size="sm" variant="outline">
              Simulate Rollover
            </Button>
            <Button onClick={handleClear} disabled={loading} size="sm" variant="destructive">
              Clear All Data
            </Button>
          </div>
        </div>

        {previewData && (
          <div className="mt-4 p-4 border rounded-lg bg-muted/50 space-y-2">
            <div className="font-semibold">Preview Results:</div>
            <div className="text-sm space-y-1">
              <div>Cycle: {previewData.cycleNumber}, Week: {previewData.weekInCycle}</div>
              <div>Source: {previewData.source === 'detected' ? '✓ Assignments found' : '✗ No assignments'}</div>
              <div>Assignments ({previewData.assignments.length}):</div>
              <ul className="ml-4 space-y-1">
                {previewData.assignments.map((a: any, i: number) => (
                  <li key={i} className="text-xs">
                    {i + 1}. {a.action_statement} ({a.domain_name}) {a.required ? '🔒' : ''}
                  </li>
                ))}
              </ul>
              <div className="mt-2 pt-2 border-t">
                <div>Raw weekly_plan rows ({previewData.rawPlanRows.length}):</div>
                <ul className="ml-4 space-y-1">
                  {previewData.rawPlanRows.map((r: any, i: number) => (
                    <li key={i} className="text-xs">
                      {r.display_order}. action_id={r.action_id}, status={r.status}, id={r.id}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* Seed Picker Dialog */}
        <Dialog open={seedPickerOpen} onOpenChange={setSeedPickerOpen}>
          <DialogContent className="max-w-2xl max-h-[80vh]">
            <DialogHeader>
              <DialogTitle>Seed 2 Weeks (Select 6: first 3 for This Week, last 3 for Next)</DialogTitle>
            </DialogHeader>
            <div className="overflow-y-auto max-h-96 space-y-2">
              {proMoves.map((pm) => (
                <div key={pm.action_id} className="flex items-center gap-2 p-2 border rounded">
                  <Checkbox
                    checked={selectedIds.includes(pm.action_id)}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        setSelectedIds([...selectedIds, pm.action_id]);
                      } else {
                        setSelectedIds(selectedIds.filter(id => id !== pm.action_id));
                      }
                    }}
                  />
                  <span className="text-sm">{pm.action_statement}</span>
                </div>
              ))}
            </div>
            <div className="flex justify-between items-center pt-4">
              <span className="text-sm text-muted-foreground">Selected: {selectedIds.length}/6</span>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => { setSeedPickerOpen(false); setSelectedIds([]); }}>
                  Cancel
                </Button>
                <Button
                  onClick={() => {
                    if (selectedIds.length === 6) {
                      handleSeed(selectedIds.slice(0, 3), selectedIds.slice(3, 6));
                      setSelectedIds([]);
                    } else {
                      toast({ title: 'Error', description: 'Select exactly 6 moves', variant: 'destructive' });
                    }
                  }}
                  disabled={selectedIds.length !== 6}
                >
                  Confirm Seed
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Override Picker Dialog */}
        <Dialog open={overridePickerOpen} onOpenChange={setOverridePickerOpen}>
          <DialogContent className="max-w-2xl max-h-[80vh]">
            <DialogHeader>
              <DialogTitle>Override Next Week (Proposed) - Select 3</DialogTitle>
            </DialogHeader>
            <div className="overflow-y-auto max-h-96 space-y-2">
              {proMoves.map((pm) => (
                <div key={pm.action_id} className="flex items-center gap-2 p-2 border rounded">
                  <Checkbox
                    checked={selectedIds.includes(pm.action_id)}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        setSelectedIds([...selectedIds, pm.action_id]);
                      } else {
                        setSelectedIds(selectedIds.filter(id => id !== pm.action_id));
                      }
                    }}
                  />
                  <span className="text-sm">{pm.action_statement}</span>
                </div>
              ))}
            </div>
            <div className="flex justify-between items-center pt-4">
              <span className="text-sm text-muted-foreground">Selected: {selectedIds.length}/3</span>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => { setOverridePickerOpen(false); setSelectedIds([]); }}>
                  Cancel
                </Button>
                <Button
                  onClick={() => {
                    if (selectedIds.length === 3) {
                      handleOverride(selectedIds);
                      setSelectedIds([]);
                    } else {
                      toast({ title: 'Error', description: 'Select exactly 3 moves', variant: 'destructive' });
                    }
                  }}
                  disabled={selectedIds.length !== 3}
                >
                  Confirm Override
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
