import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Save, Lock, Edit } from 'lucide-react';
import { formatMmDdYyyy } from '@/v2/time';
import { DRIVER_LABELS } from '@/lib/constants/domains';

interface WeeklyPlan {
  week_start: string;
  role_id: number;
  status: 'locked' | 'draft';
  action_ids: number[];
  logs: any; // Json type from Supabase
  computed_at: string;
  locked_until?: string;
}

interface ProMove {
  action_id: number;
  action_statement: string;
  competencies: { domain_id: number; domains: { domain_name: string; color_hex: string | null } };
}

export function WeeklyPlansPanel() {
  const [role, setRole] = useState<1 | 2>(1);
  const [loading, setLoading] = useState(false);
  const [lockedPlan, setLockedPlan] = useState<WeeklyPlan | null>(null);
  const [draftPlan, setDraftPlan] = useState<WeeklyPlan | null>(null);
  const [proMoves, setProMoves] = useState<ProMove[]>([]);
  const [overrideIds, setOverrideIds] = useState<(number | null)[]>([null, null, null]);
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    loadPlans();
    loadProMoves();
  }, [role]);

  async function loadPlans() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('alcan_weekly_plan')
        .select('*')
        .eq('role_id', role)
        .order('week_start', { ascending: false })
        .limit(2);

      if (error) throw error;

      const locked = data?.find(p => p.status === 'locked');
      const draft = data?.find(p => p.status === 'draft');

      setLockedPlan(locked || null);
      setDraftPlan(draft || null);
      setOverrideIds([null, null, null]);
      setIsEditing(false);
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }

  async function loadProMoves() {
    const { data } = await supabase
      .from('pro_moves')
      .select('action_id, action_statement, competencies(domain_id, domains(domain_name, color_hex))')
      .eq('role_id', role)
      .eq('active', true)
      .order('action_statement');

    if (data) setProMoves(data as any);
  }

  async function saveOverride() {
    if (overrideIds.filter(Boolean).length !== 3) {
      toast({ title: 'Incomplete', description: 'Select all 3 pro-moves for override', variant: 'destructive' });
      return;
    }

    try {
      const { error } = await supabase.functions.invoke('override-plan', {
        body: {
          roleId: role,
          weekStart: draftPlan?.week_start,
          actionIds: overrideIds.filter((id): id is number => id !== null),
        },
      });

      if (error) throw error;

      toast({ title: 'Saved', description: 'Preview plan overridden successfully' });
      await loadPlans();
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
  }

  const renderPlan = (plan: WeeklyPlan | null, title: string, icon: any) => {
    if (!plan) {
      return (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {icon}
              {title}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">No plan computed yet</p>
          </CardContent>
        </Card>
      );
    }

    const moves = plan.action_ids
      .map(id => proMoves.find(m => m.action_id === id))
      .filter((m): m is ProMove => m !== undefined);

    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {icon}
            {title}
          </CardTitle>
          <CardDescription>
            Week of {formatMmDdYyyy(plan.week_start, 'America/Chicago')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {moves.map((m, idx) => (
            <div key={m.action_id} className="border rounded-lg p-3">
              <div className="font-medium text-sm">
                {idx + 1}. {m.action_statement}
              </div>
              <Badge
                variant="outline"
                className="text-[10px] py-0 mt-2"
                style={{
                  backgroundColor: m.competencies.domains.color_hex || undefined,
                  color: '#111',
                  borderColor: m.competencies.domains.color_hex || undefined,
                }}
              >
                {m.competencies.domains.domain_name}
              </Badge>
            </div>
          ))}
          {(plan.logs as any)?.length > 0 && (
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer">View logs</summary>
              <ol className="list-decimal pl-4 mt-2 space-y-1">
                {(Array.isArray(plan.logs) ? plan.logs : []).map((log: string, i: number) => (
                  <li key={i}>{log}</li>
                ))}
              </ol>
            </details>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Weekly Plans (Alcan-wide)</CardTitle>
          <CardDescription>
            View computed weekly plans and override the preview week if needed.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <Label>Role</Label>
            <Select value={String(role)} onValueChange={v => setRole(Number(v) as 1 | 2)}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">DFI</SelectItem>
                <SelectItem value="2">RDA</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={loadPlans} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Refresh'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        {renderPlan(lockedPlan, 'This Week (Locked)', <Lock className="h-5 w-5" />)}
        {renderPlan(draftPlan, 'Preview Week (Draft)', <Edit className="h-5 w-5" />)}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Override Preview Week</CardTitle>
          <CardDescription>
            Manually select 3 pro-moves to replace the computed preview. This week is locked and cannot be changed.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!isEditing ? (
            <Button onClick={() => setIsEditing(true)} variant="outline">
              <Edit className="h-4 w-4 mr-2" />
              Enable Override
            </Button>
          ) : (
            <>
              {[0, 1, 2].map(idx => (
                <div key={idx}>
                  <Label>Slot {idx + 1}</Label>
                  <Select
                    value={overrideIds[idx]?.toString() || ''}
                    onValueChange={v =>
                      setOverrideIds(prev => {
                        const next = [...prev];
                        next[idx] = v ? Number(v) : null;
                        return next;
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a pro-move" />
                    </SelectTrigger>
                    <SelectContent>
                      {proMoves.map(m => (
                        <SelectItem key={m.action_id} value={String(m.action_id)}>
                          {m.action_statement}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
              <div className="flex gap-2">
                <Button onClick={saveOverride}>
                  <Save className="h-4 w-4 mr-2" />
                  Save Override
                </Button>
                <Button variant="outline" onClick={() => setIsEditing(false)}>
                  Cancel
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
