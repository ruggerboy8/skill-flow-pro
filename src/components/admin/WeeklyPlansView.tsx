import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { getDomainColor } from '@/lib/domainColors';

interface Plan {
  week_start: string;
  role_id: number;
  status: string;
  action_ids: number[];
}

interface ProMoveDetails {
  action_id: number;
  action_statement: string;
  competencies: { domain_id: number; domains: { domain_name: string } };
}

export function WeeklyPlansView() {
  const [role, setRole] = useState<1 | 2>(1);
  const [locked, setLocked] = useState<Plan | null>(null);
  const [preview, setPreview] = useState<Plan | null>(null);
  const [proMoves, setProMoves] = useState<Map<number, ProMoveDetails>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPlans();
    loadProMoves();
  }, [role]);

  async function loadPlans() {
    setLoading(true);
    
    // Get this Monday and next Monday
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

    // Load locked plan
    const { data: lockedData } = await supabase
      .from('alcan_weekly_plan')
      .select('*')
      .eq('week_start', weekStart)
      .eq('role_id', role)
      .eq('status', 'locked')
      .maybeSingle();

    setLocked(lockedData);

    // Load preview plan
    const { data: previewData } = await supabase
      .from('alcan_weekly_plan')
      .select('*')
      .eq('week_start', previewWeekStart)
      .eq('role_id', role)
      .eq('status', 'draft')
      .maybeSingle();

    setPreview(previewData);
    setLoading(false);
  }

  async function loadProMoves() {
    const { data } = await supabase
      .from('pro_moves')
      .select('action_id, action_statement, competencies(domain_id, domains(domain_name))')
      .eq('active', true);

    if (data) {
      setProMoves(new Map(data.map((m: any) => [m.action_id, m])));
    }
  }

  const toMDY = (iso: string) => {
    const [y, m, d] = iso.split('-');
    return `${m}-${d}-${y}`;
  };

  function renderPlan(plan: Plan | null, title: string) {
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
          <CardTitle>{title}</CardTitle>
          <p className="text-sm text-muted-foreground">Week of {toMDY(plan.week_start)}</p>
        </CardHeader>
        <CardContent className="space-y-3">
          {plan.action_ids.map((actionId, idx) => {
            const move = proMoves.get(actionId);
            if (!move) return null;

            const domain = move.competencies.domains.domain_name;

            return (
              <div key={idx} className="p-3 border rounded-lg bg-card">
                <div className="font-medium text-sm">{move.action_statement}</div>
                <Badge
                  variant="outline"
                  className="text-[10px] py-0 mt-2"
                  style={{
                    backgroundColor: getDomainColor(domain),
                    color: '#111',
                    borderColor: getDomainColor(domain),
                  }}
                >
                  {domain}
                </Badge>
              </div>
            );
          })}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Tabs value={role.toString()} onValueChange={(v) => setRole(Number(v) as 1 | 2)}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="1">DFI</TabsTrigger>
          <TabsTrigger value="2">RDA</TabsTrigger>
        </TabsList>

        <TabsContent value={role.toString()} className="space-y-4 mt-4">
          {loading ? (
            <p className="text-center text-muted-foreground">Loading plans...</p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {renderPlan(locked, 'This Week (Locked)')}
              {renderPlan(preview, 'Next Week (Preview)')}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
