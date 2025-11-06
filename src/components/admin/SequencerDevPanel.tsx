import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Zap, Save, RefreshCw, AlertTriangle, Trash2 } from 'lucide-react';
import { addWeeks, addDays } from 'date-fns';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';

const APP_TZ = 'America/Chicago';

interface SequencerDevPanelProps {
  roleId: number;
  roleName: string;
  onRefresh?: () => void;
}

interface Weights {
  C: number;
  R: number;
  E: number;
  D: number;
}

function mondayStrings(asOf?: string) {
  const now = asOf ? new Date(asOf) : new Date();
  const isoDow = Number(formatInTimeZone(now, APP_TZ, 'i'));
  const todayStr = formatInTimeZone(now, APP_TZ, 'yyyy-MM-dd');
  const todayMidnight = fromZonedTime(`${todayStr}T00:00:00`, APP_TZ);
  const localMonday = addDays(todayMidnight, -(isoDow - 1));
  const nextLocalMonday = addWeeks(localMonday, 1);
  const thisMondayStr = formatInTimeZone(localMonday, APP_TZ, 'yyyy-MM-dd');
  const nextMondayStr = formatInTimeZone(nextLocalMonday, APP_TZ, 'yyyy-MM-dd');
  return { thisMondayStr, nextMondayStr };
}

export function SequencerDevPanel({ roleId, roleName, onRefresh }: SequencerDevPanelProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [weights, setWeights] = useState<Weights>({ C: 0.80, R: 0.00, E: 0.15, D: 0.05 });
  const [rankPreview, setRankPreview] = useState<any>(null);
  const [asOfDate, setAsOfDate] = useState<string>('');
  const [regenerateNext, setRegenerateNext] = useState(false);

  const kvKey = `sequencer:weights:role:${roleId}`;

  useEffect(() => {
    loadWeights();
  }, [roleId]);

  const loadWeights = async () => {
    try {
      const { data } = await supabase
        .from('app_kv')
        .select('value')
        .eq('key', kvKey)
        .single();

      if (data?.value && typeof data.value === 'object' && 'C' in data.value) {
        setWeights(data.value as unknown as Weights);
      }
    } catch (error) {
      console.log('No saved weights, using defaults');
    }
  };

  const saveWeights = async () => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from('app_kv')
        .upsert(
          {
            key: kvKey,
            value: weights as any,
          },
          { onConflict: 'key' }
        );

      if (error) throw error;

      toast({
        title: 'Weights Saved',
        description: `Saved to ${kvKey}`,
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRankPreview = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('sequencer-rank', {
        body: {
          roleId,
          effectiveDate: asOfDate || undefined,
          timezone: APP_TZ,
          weights,
        },
      });

      if (error) throw error;

      setRankPreview(data);
      toast({
        title: 'Rank Preview Complete',
        description: `Top ${data?.next?.length || 0} moves ranked`,
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleProposeNextWeek = async () => {
    setLoading(true);
    try {
      // Call sequencer-rollover with proposeOnly mode
      const { data, error } = await supabase.functions.invoke('sequencer-rollover', {
        body: {
          roles: [roleId],
          asOf: asOfDate || undefined,
          force: true,
          proposeOnly: true,
        },
      });

      if (error) throw error;

      const result = data?.results?.[0];
      if (result?.status === 'error') {
        throw new Error(result.error || 'Failed to propose week');
      }

      // Verify we wrote 3 rows
      if (result?.wroteCount !== 3) {
        console.warn('[Propose Next Week] Unexpected row count:', result);
        toast({
          title: 'Partial Success',
          description: `Wrote ${result?.wroteCount || 0} rows for ${result?.nextWeek}. Expected 3.`,
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Success',
          description: `Proposed ${result.nextWeek} with 3 sequencer picks (${result.picks?.join(', ')})`,
        });
      }

      console.log('[Propose Next Week] Result:', result);
      onRefresh?.();
    } catch (error: any) {
      console.error('[Propose Next Week] Error:', error);
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleForceRollover = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('sequencer-rollover', {
        body: {
          roles: [roleId],
          asOf: asOfDate || undefined,
          force: true,
          regenerateNextWeek: regenerateNext
        },
      });

      if (error) throw error;

      const result = data?.results?.[0];
      const logs = result?.logs || [];
      
      // Parse decision from logs
      const preservedLine = logs.find((l: string) => l.includes('Preserving complete week'));
      const regeneratedLine = logs.find((l: string) => l.includes('Regenerated'));
      
      let message = 'Force rollover completed. ';
      if (preservedLine) {
        message += 'Next week preserved (already complete).';
      } else if (regeneratedLine) {
        message += 'Next week regenerated.';
      }

      toast({
        title: 'Rollover Complete',
        description: message
      });

      console.log('[Rollover Result]', data);
      onRefresh?.();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleClearProposed = async () => {
    setLoading(true);
    try {
      const { nextMondayStr } = mondayStrings(asOfDate || undefined);

      const { error } = await supabase
        .from('weekly_plan')
        .delete()
        .is('org_id', null)
        .eq('role_id', roleId)
        .eq('week_start_date', nextMondayStr)
        .eq('status', 'proposed');

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Cleared proposed week',
      });

      onRefresh?.();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleClearLocked = async () => {
    setLoading(true);
    try {
      const { thisMondayStr } = mondayStrings(asOfDate || undefined);

      const { error } = await supabase
        .from('weekly_plan')
        .delete()
        .is('org_id', null)
        .eq('role_id', roleId)
        .eq('week_start_date', thisMondayStr)
        .eq('status', 'locked');

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Cleared locked week',
      });

      onRefresh?.();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handlePromoteProposedToCurrent = async () => {
    if (!confirm('This will move next week\'s proposed plan to this week as locked. Continue?')) {
      return;
    }
    
    setLoading(true);
    try {
      const { thisMondayStr, nextMondayStr } = mondayStrings(asOfDate || undefined);

      // Fetch proposed rows from next week
      const { data: proposedRows, error: fetchError } = await supabase
        .from('weekly_plan')
        .select('*')
        .is('org_id', null)
        .eq('role_id', roleId)
        .eq('week_start_date', nextMondayStr)
        .eq('status', 'proposed');

      if (fetchError) throw fetchError;

      if (!proposedRows || proposedRows.length === 0) {
        throw new Error('No proposed week found to promote');
      }

      // Delete old current week if exists
      await supabase
        .from('weekly_plan')
        .delete()
        .is('org_id', null)
        .eq('role_id', roleId)
        .eq('week_start_date', thisMondayStr);

      // Insert proposed rows as locked at current week
      const lockedRows = proposedRows.map(row => ({
        org_id: null,
        role_id: roleId,
        week_start_date: thisMondayStr,
        display_order: row.display_order,
        action_id: row.action_id,
        self_select: row.self_select,
        status: 'locked',
        generated_by: row.generated_by,
        overridden: row.overridden,
        rank_version: row.rank_version,
        rank_snapshot: row.rank_snapshot,
        locked_at: new Date().toISOString()
      }));

      const { error: insertError } = await supabase
        .from('weekly_plan')
        .insert(lockedRows);

      if (insertError) throw insertError;

      toast({
        title: 'Success',
        description: `Promoted ${lockedRows.length} moves from next week to current week (locked)`
      });

      onRefresh?.();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const { thisMondayStr, nextMondayStr } = mondayStrings(asOfDate || undefined);

  return (
    <Card className="border-orange-500/30">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Zap className="h-5 w-5 text-orange-500" />
          Sequencer Controls (Dev Only) - {roleName}
        </CardTitle>
        <CardDescription className="space-y-1">
          <div>Test sequencer-rank with custom weights and provenance tracking</div>
          <div className="font-mono text-xs">
            <Badge variant="outline" className="mr-2">This Monday: {thisMondayStr}</Badge>
            <Badge variant="outline" className="mr-2">Next Monday: {nextMondayStr}</Badge>
            <Badge variant="outline">TZ: {APP_TZ}</Badge>
          </div>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Time Travel */}
        <div className="space-y-2">
          <Label>Time Travel (As-Of Date)</Label>
          <input
            type="date"
            value={asOfDate}
            onChange={(e) => setAsOfDate(e.target.value)}
            className="w-full px-3 py-2 border rounded-md"
          />
        </div>

        {/* Weights Editor */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Label className="text-base font-semibold">Weights</Label>
            <Button onClick={saveWeights} size="sm" disabled={loading}>
              <Save className="h-4 w-4 mr-2" />
              Save
            </Button>
          </div>

          {(['C', 'R', 'E', 'D'] as const).map((key) => (
            <div key={key} className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-mono">{key}</Label>
                <span className="text-sm font-mono">{weights[key].toFixed(2)}</span>
              </div>
              <Slider
                value={[weights[key] * 100]}
                onValueChange={([val]) => setWeights({ ...weights, [key]: val / 100 })}
                max={100}
                step={5}
                className="w-full"
              />
            </div>
          ))}
          <div className="text-xs text-muted-foreground">
            Sum: {(weights.C + weights.R + weights.E + weights.D).toFixed(2)}
          </div>
        </div>

        {/* Actions */}
        <div className="space-y-2">
          <Button onClick={handleRankPreview} disabled={loading} className="w-full">
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            Rank Preview (Dry-Run)
          </Button>

          <Button onClick={handleProposeNextWeek} disabled={loading} className="w-full" variant="default">
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Propose Next Week (Write)
          </Button>

          <div className="flex items-center space-x-2 py-2">
            <Checkbox
              id="regenerate-next"
              checked={regenerateNext}
              onCheckedChange={(checked) => setRegenerateNext(checked === true)}
            />
            <label
              htmlFor="regenerate-next"
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
            >
              Regenerate next week (ignore existing proposed plan)
            </label>
          </div>

          <Button onClick={handleForceRollover} disabled={loading} className="w-full" variant="outline">
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Force Rollover (Lock → Generate)
          </Button>
        </div>

        {/* Preview Results */}
        {rankPreview && (
          <div className="p-4 border rounded-lg bg-muted/50 space-y-2">
            <div className="font-semibold">Rank Preview Results:</div>
            <div className="text-sm space-y-1">
              <div>Pool Size: {rankPreview.ranked?.length || 0}</div>
              <div>Weights: {JSON.stringify(rankPreview.weights || weights)}</div>
              <div className="mt-2 font-semibold">Top 3:</div>
              <ul className="ml-4 space-y-1">
                {rankPreview.next?.slice(0, 3).map((move: any, i: number) => (
                  <li key={i} className="text-xs">
                    {i + 1}. {move.name} ({move.domainName}) - Score: {move.finalScore?.toFixed(3)}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* Danger Zone */}
        <Collapsible>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="w-full text-destructive">
              <AlertTriangle className="h-4 w-4 mr-2" />
              Danger Zone
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-2 pt-2">
            <Badge variant="destructive" className="mb-2">Development Only</Badge>
            <Button onClick={handlePromoteProposedToCurrent} disabled={loading} size="sm" variant="outline" className="w-full mb-2">
              📅 Promote Proposed → Current (Locked)
            </Button>
            <Button onClick={handleClearProposed} disabled={loading} size="sm" variant="destructive" className="w-full">
              <Trash2 className="h-4 w-4 mr-2" />
              Clear Proposed ({nextMondayStr})
            </Button>
            <Button onClick={handleClearLocked} disabled={loading} size="sm" variant="destructive" className="w-full">
              <Trash2 className="h-4 w-4 mr-2" />
              Clear Locked ({thisMondayStr})
            </Button>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}
