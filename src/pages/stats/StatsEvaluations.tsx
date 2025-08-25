import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { getDomainColor } from '@/lib/domainColors';
import { useNavigate } from 'react-router-dom';

type DomainRow = { 
  domain_name: string; 
  avg_self: number | null; 
  avg_observer: number | null; 
  delta: number | null 
};

type EvalRow = {
  eval_id: string;
  label: string;         // e.g., "Q2 2025 • Submitted May 12"
  status: 'submitted'|'draft';
  domains: DomainRow[];
  staff_id: string;
};

export default function StatsEvaluations() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [evals, setEvals] = useState<EvalRow[]>([]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        // get staff id
        const { data: staff } = await supabase
          .from('staff')
          .select('id')
          .eq('user_id', user.id)
          .maybeSingle();
        if (!staff) { setLoading(false); return; }

        // RPC preferred; fallback to client joins if needed
        const { data } = await supabase.rpc('get_evaluations_summary', { p_staff_id: staff.id });

        // transform rows -> EvalRow[]
        const map = new Map<string, EvalRow>();
        for (const r of (data ?? [])) {
          if (!map.has(r.eval_id)) {
            const labelBits = [];
            if (r.quarter) labelBits.push(r.quarter);
            if (r.program_year) labelBits.push(String(r.program_year));
            const header = labelBits.length ? labelBits.join(' ') : r.type ?? 'Evaluation';
            const submitted = r.submitted_at ? new Date(r.submitted_at) : null;
            const when = submitted ? submitted.toLocaleDateString() : 'Draft';
            map.set(r.eval_id, {
              eval_id: r.eval_id,
              label: `${header} • ${when}`,
              status: (r.status === 'submitted' ? 'submitted' : 'draft'),
              domains: [],
              staff_id: staff.id
            });
          }
          map.get(r.eval_id)!.domains.push({
            domain_name: r.domain_name,
            avg_self: r.avg_self,
            avg_observer: r.avg_observer,
            delta: r.delta
          });
        }
        setEvals(Array.from(map.values()).sort((a,b) => a.status === 'submitted' ? -1 : 1));
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  if (!evals.length) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground">
            No evaluations yet. Once your manager starts one, you'll see it here.
          </p>
        </CardContent>
      </Card>
    );
  }

  const latest = evals.find(e => e.status === 'submitted') ?? evals[0];

  return (
    <div className="space-y-6">
      {/* Latest summary */}
      <Card>
        <CardHeader>
          <CardTitle>Latest Evaluation</CardTitle>
          <div className="text-sm text-muted-foreground">{latest.label}</div>
        </CardHeader>
        <CardContent className="space-y-3">
          {latest.domains.map(d => (
            <div key={d.domain_name} className="flex items-center gap-3 p-2 rounded-md ring-1 ring-border/50"
                 style={{ backgroundColor: getDomainColor(d.domain_name) }}>
              <span className="text-sm font-medium text-slate-900 w-32">{d.domain_name}</span>
              <div className="flex items-center gap-4 text-sm">
                <span><strong>Self:</strong> {d.avg_self ?? '—'}</span>
                <span><strong>Observer:</strong> {d.avg_observer ?? '—'}</span>
                {d.delta != null && (
                  <Badge variant={d.delta >= 0.5 ? 'secondary' : d.delta <= -0.5 ? 'destructive' : 'default'}>
                    {d.delta > 0 ? `Observer +${d.delta.toFixed(1)}` :
                     d.delta < 0 ? `Observer ${d.delta.toFixed(1)}` : 'Aligned'}
                  </Badge>
                )}
              </div>
            </div>
          ))}
          <div className="pt-2">
            <Button 
              className="w-full" 
              onClick={() => navigate(`/coach/${latest.staff_id}/evaluation/${latest.eval_id}`)}
            >
              Open Evaluation
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* History list */}
      {evals.filter(e => e.eval_id !== latest.eval_id).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Past Evaluations</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {evals.filter(e => e.eval_id !== latest.eval_id).map(e => (
              <div key={e.eval_id} className="p-3 rounded-md border flex items-center justify-between">
                <div className="space-y-1">
                  <div className="font-medium">{e.label}</div>
                  <div className="text-xs text-muted-foreground">
                    {e.domains.map(d => d.domain_name).join(' • ')}
                  </div>
                </div>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => navigate(`/coach/${e.staff_id}/evaluation/${e.eval_id}`)}
                >
                  View
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}