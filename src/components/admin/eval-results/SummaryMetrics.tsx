import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Users, FileText, ArrowUpDown, Info, CheckCircle2, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getDomainColor } from '@/lib/domainColors';
import type { EvalFilters } from '@/types/analytics';
import { periodToDateRange, getPeriodLabel } from '@/types/analytics';
import { computeEligibleStaffIds } from '@/lib/evaluationEligibility';
import { bulkSubmitCompleteDrafts } from '@/lib/evaluations';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from 'sonner';

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
  const { data, isLoading, error } = useQuery({
    queryKey: ['eval-summary-metrics-v3', filters.organizationId, filters.evaluationPeriod],
    queryFn: async () => {
      if (!filters.organizationId) return null;

      const evalTypes = filters.evaluationPeriod.type === 'Baseline' 
        ? ['Baseline'] 
        : ['Quarterly'];

      // Get locations for this org
      const { data: locationsData, error: locError } = await supabase
        .from('locations')
        .select('id')
        .eq('organization_id', filters.organizationId)
        .eq('active', true);

      if (locError) throw locError;
      const locationIds: string[] = (locationsData || []).map(l => l.id);

      if (locationIds.length === 0) {
        return {
          eligibleStaff: 0,
          staffWithEval: 0,
          submittedCount: 0,
          draftCount: 0,
          gap: null,
          roleDomainScores: [],
          eligibleByHireCount: 0,
          evaluatedEarlyCount: 0,
        };
      }

      // Get evaluations for this org's locations in the selected period FIRST
      // This lets us include evaluated staff even if they're now paused
      let evalsQuery = supabase
        .from('evaluations')
        .select('id, staff_id, status')
        .in('location_id', locationIds)
        .in('type', evalTypes)
        .eq('program_year', filters.evaluationPeriod.year);
      
      // For quarterly, also filter by quarter
      if (filters.evaluationPeriod.type === 'Quarterly' && filters.evaluationPeriod.quarter) {
        evalsQuery = evalsQuery.eq('quarter', filters.evaluationPeriod.quarter);
      }

      const { data: evals, error: evalsError } = await evalsQuery;
      if (evalsError) throw evalsError;

      const submittedEvals = (evals || []).filter(e => e.status === 'submitted');
      const draftEvals = (evals || []).filter(e => e.status === 'draft');
      
      // Get all evaluated staff IDs from this period
      const allEvaluatedStaffIds = new Set((evals || []).map(e => e.staff_id));
      const submittedStaffIds = new Set(submittedEvals.map(e => e.staff_id));

      // Get active staff for this org (participants, not paused, not org admins)
      // These form the baseline for hire-date eligibility
      const { data: activeStaffData, error: activeStaffError } = await supabase
        .from('staff')
        .select('id, hire_date')
        .in('primary_location_id', locationIds)
        .eq('is_participant', true)
        .eq('is_paused', false)
        .eq('is_org_admin', false);

      if (activeStaffError) throw activeStaffError;
      
      // Also fetch evaluated staff who might be paused now (they were eligible when evaluated)
      const evaluatedNotInActive = [...allEvaluatedStaffIds].filter(
        id => !(activeStaffData || []).some(s => s.id === id)
      );
      
      let evaluatedStaffWithHireDates: { id: string; hire_date: string }[] = [];
      if (evaluatedNotInActive.length > 0) {
        const { data: pausedEvaluatedData } = await supabase
          .from('staff')
          .select('id, hire_date')
          .in('id', evaluatedNotInActive);
        evaluatedStaffWithHireDates = (pausedEvaluatedData || []).map(s => ({ 
          id: s.id, 
          hire_date: s.hire_date 
        }));
      }

      // Combine active staff + evaluated staff (even if paused) for complete picture
      const activeStaff = (activeStaffData || []).map(s => ({ id: s.id, hire_date: s.hire_date }));
      const allStaff = [...activeStaff, ...evaluatedStaffWithHireDates];
      const allStaffIds = new Set(allStaff.map(s => s.id));

      // All evaluated staff in this period belong to this org (by the location filter on evals)
      const evaluatedInOrg = allEvaluatedStaffIds;
      
      const eligibleStaffIds = computeEligibleStaffIds(
        allStaff,
        evaluatedInOrg,
        filters.evaluationPeriod
      );

      // Calculate breakdown for tooltip (use only active staff for hire-date eligibility)
      const eligibleByHireCount = activeStaff.filter(s => {
        const periodStart = new Date(
          filters.evaluationPeriod.year,
          filters.evaluationPeriod.type === 'Baseline' ? 0 :
            filters.evaluationPeriod.quarter === 'Q1' ? 0 :
            filters.evaluationPeriod.quarter === 'Q2' ? 3 :
            filters.evaluationPeriod.quarter === 'Q3' ? 6 : 9,
          1
        );
        return new Date(s.hire_date) < periodStart;
      }).length;
      
      // "Evaluated early" = anyone in eligible set who wasn't eligible by hire date
      // This includes both early hires AND paused staff who were evaluated
      const evaluatedEarlyCount = eligibleStaffIds.size - eligibleByHireCount;

      // Count staff with submitted evals - includes evaluated staff even if now paused
      const staffWithEvalCount = submittedStaffIds.size;

      // Get evaluation items for gap calculation (org-scoped)
      const submittedIds = submittedEvals.map(e => e.id);
      let avgObserver: number | null = null;
      let avgSelf: number | null = null;

      if (submittedIds.length > 0) {
        const { data: items, error: itemsError } = await supabase
          .from('evaluation_items')
          .select('observer_score, self_score')
          .in('evaluation_id', submittedIds);

        if (itemsError) throw itemsError;

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
      const dateRange = periodToDateRange(filters.evaluationPeriod);
      const { data: domainData, error: domainError } = await supabase.rpc('get_location_domain_staff_averages', {
        p_org_id: filters.organizationId,
        p_start: dateRange.start.toISOString(),
        p_end: dateRange.end.toISOString(),
        p_include_no_eval: false,
        p_types: evalTypes,
      });

      if (domainError) throw domainError;

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

      // Get draft eval IDs for bulk submit
      const draftEvalIds = draftEvals.map(e => e.id);

      return {
        eligibleStaff: eligibleStaffIds.size,
        staffWithEval: staffWithEvalCount,
        submittedCount: submittedEvals.length,
        draftCount: draftEvals.length,
        draftEvalIds,
        gap,
        roleDomainScores,
        eligibleByHireCount,
        evaluatedEarlyCount: Math.max(0, evaluatedEarlyCount),
      };
    },
    enabled: !!filters.organizationId
  });

  const queryClient = useQueryClient();

  // Bulk submit mutation
  const bulkSubmitMutation = useMutation({
    mutationFn: async (evalIds: string[]) => {
      return bulkSubmitCompleteDrafts(evalIds);
    },
    onSuccess: (result) => {
      if (result.successCount > 0) {
        toast.success(`Submitted ${result.successCount} complete evaluation${result.successCount > 1 ? 's' : ''}`);
      }
      if (result.failedCount > 0) {
        toast.warning(`${result.failedCount} draft${result.failedCount > 1 ? 's' : ''} skipped (incomplete scores)`);
      }
      // Invalidate all related queries
      queryClient.invalidateQueries({ queryKey: ['eval-summary-metrics-v3'] });
      queryClient.invalidateQueries({ queryKey: ['location-eval-cards'] });
      queryClient.invalidateQueries({ queryKey: ['location-eval-detail'] });
      queryClient.invalidateQueries({ queryKey: ['eval-statuses'] });
    },
    onError: (error: Error) => {
      toast.error(`Bulk submit failed: ${error.message}`);
    }
  });

  const handleBulkSubmit = () => {
    if (data?.draftEvalIds && data.draftEvalIds.length > 0) {
      bulkSubmitMutation.mutate(data.draftEvalIds);
    }
  };

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
  const hasDrafts = (data?.draftCount ?? 0) > 0;
  const bulkSubmitting = bulkSubmitMutation.isPending;

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
              <TooltipProvider delayDuration={0}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3.5 w-3.5 text-muted-foreground/60 cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p className="text-xs">
                      <strong>Eligible staff:</strong> Hired before this period 
                      ({data?.eligibleByHireCount ?? 0}) + evaluated early 
                      ({data?.evaluatedEarlyCount ?? 0})
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold">
                {data?.staffWithEval ?? 0}/{data?.eligibleStaff ?? 0}
              </span>
              <span className="text-sm text-muted-foreground">evaluated</span>
            </div>
            {hasDrafts && (
              <div className="flex items-center gap-2 mt-2">
                <Badge variant="outline" className="text-xs border-warning text-warning">
                  {data?.draftCount} drafts
                </Badge>
              </div>
            )}
            {hasDrafts && (
              <Button
                variant="default"
                size="sm"
                className="w-full mt-3"
                onClick={handleBulkSubmit}
                disabled={bulkSubmitting}
              >
                {bulkSubmitting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                )}
                Submit All Complete
              </Button>
            )}
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