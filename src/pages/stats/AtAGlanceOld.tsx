import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { getDomainColor } from '@/lib/domainColors';

interface DomainAverage {
  domain_name: string;
  perf_avg: number;
}

export default function StatsGlance() {
  const [domainAverages, setDomainAverages] = useState<DomainAverage[]>([]);
  const [latestCycle, setLatestCycle] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  useEffect(() => {
    if (user) {
      loadGlanceData();
    }
  }, [user]);

  const loadGlanceData = async () => {
    if (!user) return;

    try {
      // First get staff data
      const { data: staffData } = await supabase
        .from('staff')
        .select('id, role_id')
        .eq('user_id', user.id)
        .single();

      if (!staffData) return;

      // Get latest cycle with performance data
      const { data: latestCycleData } = await supabase
        .from('weekly_scores')
        .select('weekly_focus!inner(cycle)')
        .eq('staff_id', staffData.id)
        .not('performance_score', 'is', null)
        .order('weekly_focus(cycle)', { ascending: false })
        .limit(1);

      if (!latestCycleData || latestCycleData.length === 0) {
        setLoading(false);
        return;
      }

      const cycle = (latestCycleData[0].weekly_focus as any).cycle;
      setLatestCycle(cycle);

      // Get all weeks for this cycle to calculate averages
      const { data: weeksData } = await supabase
        .from('weekly_focus')
        .select('week_in_cycle')
        .eq('role_id', staffData.role_id)
        .eq('cycle', cycle)
        .order('week_in_cycle');

      if (!weeksData) return;

      const uniqueWeeks = [...new Set(weeksData.map(w => w.week_in_cycle))];
      const domainScores = new Map<string, number[]>();

      // Collect all performance data for each week using the RPC function
      for (const week of uniqueWeeks) {
        const { data: weekData } = await supabase.rpc('get_weekly_review', {
          p_cycle: cycle,
          p_week: week,
          p_role_id: staffData.role_id,
          p_staff_id: staffData.id
        });

        if (weekData) {
          weekData.forEach((item: any) => {
            if (item.performance_score !== null) {
              const domain = item.domain_name;
              if (!domainScores.has(domain)) {
                domainScores.set(domain, []);
              }
              domainScores.get(domain)!.push(item.performance_score);
            }
          });
        }
      }

      // Calculate averages for each domain
      const averages: DomainAverage[] = Array.from(domainScores.entries()).map(([domain_name, scores]) => ({
        domain_name,
        perf_avg: Math.round((scores.reduce((sum, score) => sum + score, 0) / scores.length) * 100) / 100
      }));

      setDomainAverages(averages);
    } catch (error) {
      console.error('Error loading glance data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">Loading performance overview...</div>
      </div>
    );
  }

  if (!latestCycle || domainAverages.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground">No performance data available yet. Complete some weeks to see your overview!</p>
        </CardContent>
      </Card>
    );
  }

  // Arrange domains in 2x2 grid order
  const gridOrder = ['Clinical', 'Clerical', 'Cultural', 'Case Acceptance'];
  const orderedDomains = gridOrder.map(domain => 
    domainAverages.find(d => d.domain_name === domain)
  ).filter(Boolean) as DomainAverage[];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Performance Overview</h2>
        <div className="text-sm text-muted-foreground">
          Cycle: {latestCycle} ▼
        </div>
      </div>
      
      <div className="grid grid-cols-2 gap-4 max-w-md">
        {orderedDomains.map((domain) => (
          <Card 
            key={domain.domain_name}
            className="text-center"
            style={{ backgroundColor: getDomainColor(domain.domain_name) }}
          >
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-slate-800">
                {domain.domain_name}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="text-lg font-bold text-slate-800">
                avg {domain.perf_avg}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}