import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Users, FileText, ArrowUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getDomainColor } from '@/lib/domainColors';
import type { EvalFilters } from '@/types/analytics';
import { periodToDateRange, getPeriodLabel } from '@/types/analytics';

interface SummaryMetricsProps {
  filters: EvalFilters;
}

// Domain display order
const DOMAIN_ORDER = ['Clinical', 'Clerical', 'Cultural', 'Case Acceptance'];

// Score color thresholds
function getScoreColor(score: number | null): string {
  if (score === null) return 'text-muted-foreground';
  if (score >= 3.0) return 'text-green-600 dark:text-green-400';
  if (score >= 2.5) return 'text-amber-600 dark:text-amber-400';
  return 'text-red-600 dark:text-red-400';
}

function getScoreBg(score: number | null): string {
  if (score === null) return 'bg-muted/30';
  if (score >= 3.0) return 'bg-green-50 dark:bg-green-950/30';
  if (score >= 2.5) return 'bg-amber-50 dark:bg-amber-950/30';
  return 'bg-red-50 dark:bg-red-950/30';
}

// Gap description based on magnitude
function getGapDescription(gap: number | null): { text: string; color: string } {
  if (gap === null) return { text: 'No data', color: 'text-muted-foreground' };
  
  const absGap = Math.abs(gap);
  const direction = gap > 0 
    ? 'Staff underrate themselves' 
    : gap < 0 
      ? 'Staff overrate themselves'
      : 'Aligned';
  
  if (absGap < 0.2) {
    return { text: 'Well calibrated', color: 'text-green-600 dark:text-green-400' };
  }
  if (absGap < 0.5) {
    return { text: `Slight gap · ${direction}`, color: 'text-amber-600 dark:text-amber-400' };
  }
  if (absGap < 0.8) {
    return { text: `Moderate gap · ${direction}`, color: 'text-orange-600 dark:text-orange-400' };
  }
  return { text: `Large gap · ${direction}`, color: 'text-red-600 dark:text-red-400' };
}

interface RoleDomainScore {
  domainName: string;
  dfiAvg: number | null;
  rdaAvg: number | null;
}

export function SummaryMetrics({ filters }: SummaryMetricsProps) {
  const dateRange = periodToDateRange(filters.evaluationPeriod);
  
  const { data, isLoading } = useQuery({
    queryKey: ['eval-summary-metrics-v2', filters.organizationId, filters.evaluationPeriod],
    queryFn: async () => {
      if (!filters.organizationId) return null;

      const evalTypes = filters.evaluationPeriod.type === 'Baseline' 
        ? ['Baseline'] 
        : ['Quarterly'];

      // Get locations for this org first - use explicit any to avoid type depth
      const locationsQuery: any = supabase
        .from('locations')
        .select('id')
        .eq('organization_id', filters.organizationId)
        .eq('active', true);
      const locationsResult = await locationsQuery;

      const locationIds: string[] = (locationsResult.data || []).map((l: { id: string }) => l.id);

      // Get staff count for this org - cast early to avoid type depth error
      let totalStaff = 0;
      if (locationIds.length > 0) {
        const staffQuery = (supabase.from('staff') as any)
          .select('id')
          .eq('active', true)
          .in('primary_location_id', locationIds);
        const staffResult = await staffQuery;
        totalStaff = (staffResult.data || []).length;
      }

      // Get evaluations in date range for this org
      const { data: evals } = await supabase
        .from('evaluations')
        .select('id, staff_id, status')
        .in('type', evalTypes)
        .gte('created_at', dateRange.start.toISOString())
        .lte('created_at', dateRange.end.toISOString());

      const submittedEvals = evals?.filter(e => e.status === 'submitted') || [];
      const draftEvals = evals?.filter(e => e.status === 'draft') || [];
      
      const uniqueStaffWithEval = new Set(submittedEvals.map(e => e.staff_id));
      const staffWithEvalCount = uniqueStaffWithEval.size;

      // Get evaluation items for gap calculation
      const submittedIds = submittedEvals.map(e => e.id);
      let avgObserver: number | null = null;
      let avgSelf: number | null = null;

      if (submittedIds.length > 0) {
        const { data: items } = await supabase
          .from('evaluation_items')
          .select('observer_score, self_score')
          .in('evaluation_id', submittedIds);

        const observerScores = (items || [])
          .map(i => i.observer_score)
          .filter((s): s is number => s !== null);
        const selfScores = (items || [])
          .map(i => i.self_score)
          .filter((s): s is number => s !== null);

        avgObserver = observerScores.length > 0 
          ? observerScores.reduce((a, b) => a + b, 0) / observerScores.length 
          : null;
        avgSelf = selfScores.length > 0 
          ? selfScores.reduce((a, b) => a + b, 0) / selfScores.length 
          : null;
      }

      const gap = avgObserver !== null && avgSelf !== null ? avgObserver - avgSelf : null;

      // Get org-level domain averages by role using the RPC
      const { data: domainData } = await supabase.rpc('get_location_domain_staff_averages', {
        p_org_id: filters.organizationId,
        p_start: dateRange.start.toISOString(),
        p_end: dateRange.end.toISOString(),
        p_include_no_eval: false,
        p_types: evalTypes,
      });

      // Aggregate domain scores by role across all locations
      const roleDomainMap = new Map<string, { dfi: number[]; rda: number[] }>();
      
      (domainData || []).forEach((row: any) => {
        if (!row.domain_name || row.avg_observer === null) return;
        
        if (!roleDomainMap.has(row.domain_name)) {
          roleDomainMap.set(row.domain_name, { dfi: [], rda: [] });
        }
        
        const bucket = roleDomainMap.get(row.domain_name)!;
        const roleName = row.role_name?.toUpperCase() || '';
        
        if (roleName.includes('DFI')) {
          bucket.dfi.push(row.avg_observer);
        } else if (roleName.includes('RDA')) {
          bucket.rda.push(row.avg_observer);
        }
      });

      const roleDomainScores: RoleDomainScore[] = [];
      roleDomainMap.forEach((scores, domainName) => {
        const dfiAvg = scores.dfi.length > 0 
          ? scores.dfi.reduce((a, b) => a + b, 0) / scores.dfi.length 
          : null;
        const rdaAvg = scores.rda.length > 0 
          ? scores.rda.reduce((a, b) => a + b, 0) / scores.rda.length 
          : null;
        
        if (dfiAvg !== null || rdaAvg !== null) {
          roleDomainScores.push({ domainName, dfiAvg, rdaAvg });
        }
      });

      // Sort by domain order
      roleDomainScores.sort((a, b) => {
        const aIdx = DOMAIN_ORDER.indexOf(a.domainName);
        const bIdx = DOMAIN_ORDER.indexOf(b.domainName);
        return (aIdx === -1 ? 999 : aIdx) - (bIdx === -1 ? 999 : bIdx);
      });

      return {
        totalStaff,
        staffWithEval: staffWithEvalCount,
        submittedCount: submittedEvals.length,
        draftCount: draftEvals.length,
        gap,
        roleDomainScores,
      };
    },
    enabled: !!filters.organizationId
  });

  if (!filters.organizationId) return null;

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Skeleton className="h-32" />
        <Skeleton className="h-32 md:col-span-2" />
      </div>
    );
  }

  const gapDesc = getGapDescription(data?.gap ?? null);
  const periodLabel = getPeriodLabel(filters.evaluationPeriod);

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {/* Left column: Compact metrics */}
      <div className="space-y-4">
        {/* Evaluations Progress */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-2">
              <Users className="h-4 w-4" />
              <span className="text-sm font-medium">Coverage</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold">
                {data?.staffWithEval ?? 0}/{data?.totalStaff ?? 0}
              </span>
              <span className="text-sm text-muted-foreground">evaluated</span>
            </div>
            <div className="flex items-center gap-2 mt-2">
              <Badge variant="secondary" className="text-xs">
                <FileText className="h-3 w-3 mr-1" />
                {data?.submittedCount ?? 0} submitted
              </Badge>
              {(data?.draftCount ?? 0) > 0 && (
                <Badge variant="outline" className="text-xs text-amber-600 dark:text-amber-400">
                  {data?.draftCount} drafts
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Calibration Gap */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-2">
              <ArrowUpDown className="h-4 w-4" />
              <span className="text-sm font-medium">Obs–Self Gap</span>
            </div>
            <div className="text-2xl font-bold">
              {data?.gap != null 
                ? (data.gap >= 0 ? `+${data.gap.toFixed(2)}` : data.gap.toFixed(2))
                : '—'
              }
            </div>
            <p className={cn("text-xs mt-1", gapDesc.color)}>
              {gapDesc.text}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Right column: Org Domain Matrix */}
      <Card className="md:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Org Performance by Role · {periodLabel}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data?.roleDomainScores && data.roleDomainScores.length > 0 ? (
            <div className="rounded-lg border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50">
                    <th className="text-left py-2 px-3 font-medium text-muted-foreground">Domain</th>
                    <th className="text-center py-2 px-3 font-semibold w-24">DFI</th>
                    <th className="text-center py-2 px-3 font-semibold w-24">RDA</th>
                  </tr>
                </thead>
                <tbody>
                  {data.roleDomainScores.map((ds, idx) => (
                    <tr key={ds.domainName} className={idx % 2 === 0 ? 'bg-background' : 'bg-muted/20'}>
                      <td className="py-2 px-3">
                        <div className="flex items-center gap-2">
                          <span 
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: getDomainColor(ds.domainName) }}
                          />
                          <span className="font-medium">{ds.domainName}</span>
                        </div>
                      </td>
                      <td className={cn(
                        "text-center py-2 px-3 font-mono font-semibold",
                        getScoreColor(ds.dfiAvg),
                        getScoreBg(ds.dfiAvg)
                      )}>
                        {ds.dfiAvg !== null ? ds.dfiAvg.toFixed(2) : '—'}
                      </td>
                      <td className={cn(
                        "text-center py-2 px-3 font-mono font-semibold",
                        getScoreColor(ds.rdaAvg),
                        getScoreBg(ds.rdaAvg)
                      )}>
                        {ds.rdaAvg !== null ? ds.rdaAvg.toFixed(2) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground italic py-4 text-center">
              No evaluation data for this period
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}