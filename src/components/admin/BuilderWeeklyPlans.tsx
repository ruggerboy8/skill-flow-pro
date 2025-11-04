import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { getDomainColor } from '@/lib/domainColors';
import { Edit2, Save, X } from 'lucide-react';

interface Plan {
  id: string;
  week_start: string;
  role_id: number;
  status: string;
  action_ids: number[];
  logs: string[];
}

interface ProMoveDetails {
  action_id: number;
  action_statement: string;
  competencies: { domain_id: number; domains: { domain_name: string } };
}

export function BuilderWeeklyPlans() {
  const { toast } = useToast();
  const [role, setRole] = useState<1 | 2>(1);
  const [locked, setLocked] = useState<Plan | null>(null);
  const [preview, setPreview] = useState<Plan | null>(null);
  const [proMoves, setProMoves] = useState<ProMoveDetails[]>([]);
  const [domainMap, setDomainMap] = useState<Map<number, { name: string; color: string }>>(new Map());
  const [loading, setLoading] = useState(true);
  const [editingLocked, setEditingLocked] = useState(false);
  const [editingPreview, setEditingPreview] = useState(false);
  const [lockedPicks, setLockedPicks] = useState<number[]>([]);
  const [previewPicks, setPreviewPicks] = useState<number[]>([]);

  useEffect(() => {
    loadPlans();
    loadProMoves();
    loadDomains();
  }, [role]);

  async function loadPlans() {
    setLoading(true);
    
    const now = new Date();
    const dayOfWeek = now.getDay();
    const daysToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(now);
    monday.setDate(now.getDate() + daysToMonday);
    monday.setHours(0, 0, 0, 0);
    const weekStart = monday.toISOString().split('T')[0];

    const nextMonday = new Date(monday);
    nextMonday.setDate(monday.getDate() + 7);
    const previewWeekStart = nextMonday.toISOString().split('T')[0];

    const { data: lockedData } = await supabase
      .from('alcan_weekly_plan')
      .select('*')
      .eq('week_start', weekStart)
      .eq('role_id', role)
      .eq('status', 'locked')
      .maybeSingle();

    setLocked(lockedData ? { ...lockedData, logs: (lockedData.logs as any) || [] } : null);
    if (lockedData) setLockedPicks(lockedData.action_ids);

    const { data: previewData } = await supabase
      .from('alcan_weekly_plan')
      .select('*')
      .eq('week_start', previewWeekStart)
      .eq('role_id', role)
      .eq('status', 'draft')
      .maybeSingle();

    setPreview(previewData ? { ...previewData, logs: (previewData.logs as any) || [] } : null);
    if (previewData) setPreviewPicks(previewData.action_ids);

    setLoading(false);
  }

  async function loadProMoves() {
    const { data } = await supabase
      .from('pro_moves')
      .select('action_id, action_statement, competencies(domain_id, domains(domain_name))')
      .eq('active', true)
      .order('action_statement');

    if (data) setProMoves(data as any);
  }

  async function loadDomains() {
    const { data } = await supabase
      .from('domains')
      .select('domain_id, domain_name, color_hex');

    if (data) {
      setDomainMap(
        new Map(
          data.map((d: any) => [
            d.domain_id,
            { name: d.domain_name, color: d.color_hex || '#f3f4f6' },
          ])
        )
      );
    }
  }

  async function saveOverride(isLocked: boolean) {
    try {
      const weekStart = isLocked ? locked?.week_start : preview?.week_start;
      const actionIds = isLocked ? lockedPicks : previewPicks;

      if (!weekStart || actionIds.length !== 3) {
        toast({ title: 'Error', description: 'Must select exactly 3 pro-moves', variant: 'destructive' });
        return;
      }

      const response = await supabase.functions.invoke('override-plan', {
        body: { weekStart, roleId: role, actionIds },
      });

      if (response.error) throw response.error;

      toast({ title: 'Success', description: 'Plan updated successfully' });
      setEditingLocked(false);
      setEditingPreview(false);
      loadPlans();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  }

  const toMDY = (iso: string) => {
    const [y, m, d] = iso.split('-');
    return `${m}-${d}-${y}`;
  };

  function renderPlan(
    plan: Plan | null,
    title: string,
    isLocked: boolean,
    editing: boolean,
    setEditing: (v: boolean) => void,
    picks: number[],
    setPicks: (v: number[]) => void
  ) {
    if (!plan) {
      return (
        <Card>
          <CardHeader>
            <CardTitle>{title}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">No plan available</p>
          </CardContent>
        </Card>
      );
    }

    return (
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle>{title}</CardTitle>
              <CardDescription>Week of {toMDY(plan.week_start)}</CardDescription>
            </div>
            {!editing ? (
              <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                <Edit2 className="h-4 w-4 mr-2" />
                Edit Picks
              </Button>
            ) : (
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => { setEditing(false); setPicks(plan.action_ids); }}>
                  <X className="h-4 w-4" />
                </Button>
                <Button size="sm" onClick={() => saveOverride(isLocked)}>
                  <Save className="h-4 w-4 mr-2" />
                  Save
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {editing ? (
            <div className="space-y-2">
              {picks.map((actionId, idx) => (
                <select
                  key={idx}
                  value={actionId}
                  onChange={(e) => {
                    const newPicks = [...picks];
                    newPicks[idx] = Number(e.target.value);
                    setPicks(newPicks);
                  }}
                  className="w-full p-2 border rounded-lg bg-background"
                >
                  {proMoves
                    .filter((m) => {
                      const isRoleMatch = role === 1
                        ? m.action_statement.includes('DFI') || m.action_statement.includes('Front')
                        : m.action_statement.includes('RDA') || m.action_statement.includes('Rear');
                      return isRoleMatch;
                    })
                    .map((move) => (
                      <option key={move.action_id} value={move.action_id}>
                        {move.action_statement}
                      </option>
                    ))}
                </select>
              ))}
            </div>
          ) : (
            plan.action_ids.map((actionId, idx) => {
              const move = proMoves.find((m) => m.action_id === actionId);
              if (!move) return null;

              const domain = domainMap.get(move.competencies.domain_id);

              return (
                <div key={idx} className="p-3 border rounded-lg bg-card">
                  <div className="font-medium text-sm">{move.action_statement}</div>
                  <Badge
                    variant="outline"
                    className="text-[10px] py-0 mt-2"
                    style={{
                      backgroundColor: domain?.color || '#f3f4f6',
                      color: '#111',
                      borderColor: domain?.color || '#f3f4f6',
                    }}
                  >
                    {domain?.name || 'Unknown'}
                  </Badge>
                </div>
              );
            })
          )}

          {plan.logs && plan.logs.length > 0 && (
            <div className="mt-4 p-3 bg-muted/50 rounded-lg">
              <h4 className="text-xs font-semibold mb-2">Engine Logs</h4>
              <div className="space-y-1">
                {plan.logs.slice(0, 5).map((log, idx) => (
                  <p key={idx} className="text-xs text-muted-foreground">
                    {log}
                  </p>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Alcan-wide Sequencer</h2>
        <p className="text-sm text-muted-foreground">
          Manage locked and preview weekly plans
        </p>
      </div>

      <Tabs value={role.toString()} onValueChange={(v) => setRole(Number(v) as 1 | 2)}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="1">DFI</TabsTrigger>
          <TabsTrigger value="2">RDA</TabsTrigger>
        </TabsList>

        <TabsContent value={role.toString()} className="space-y-4 mt-6">
          {loading ? (
            <p className="text-center text-muted-foreground">Loading plans...</p>
          ) : (
            <div className="grid gap-6 md:grid-cols-2">
              {renderPlan(
                locked,
                'This Week (Locked)',
                true,
                editingLocked,
                setEditingLocked,
                lockedPicks,
                setLockedPicks
              )}
              {renderPlan(
                preview,
                'Next Week (Preview, Draft)',
                false,
                editingPreview,
                setEditingPreview,
                previewPicks,
                setPreviewPicks
              )}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
