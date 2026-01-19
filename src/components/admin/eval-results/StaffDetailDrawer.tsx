import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { AlertTriangle, TrendingUp, TrendingDown, CheckCircle2 } from 'lucide-react';
import { getDomainColor } from '@/lib/domainColors';
import type { EvalFilters } from '@/types/analytics';
import { periodToDateRange, getPeriodLabel } from '@/types/analytics';

interface StaffDetailDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  staffId: string;
  staffName: string;
  locationName: string;
  filters: EvalFilters;
}

interface DomainData {
  domain_id: number;
  domain_name: string;
  observer_avg: number | null;
  self_avg: number | null;
  n_items: number;
}

interface CompetencyData {
  competency_id: number;
  competency_name: string;
  domain_id: number;
  domain_name: string;
  framework: string | null;
  observer_avg: number | null;
  self_avg: number | null;
  n_items: number;
}

export function StaffDetailDrawer({
  open,
  onOpenChange,
  staffId,
  staffName,
  locationName,
  filters
}: StaffDetailDrawerProps) {
  // Fetch domain-level averages for this staff member
  const { data: domainData, isLoading: domainsLoading } = useQuery({
    queryKey: ['staff-domain-summary', staffId, filters],
    queryFn: async () => {
      if (!filters.organizationId || !staffId) return [];

      const dateRange = periodToDateRange(filters.evaluationPeriod);
      const evalTypes = filters.evaluationPeriod.type === 'Baseline' 
        ? ['Baseline'] 
        : ['Quarterly'];

      const params = {
        p_org_id: filters.organizationId,
        p_start: dateRange.start.toISOString(),
        p_end: dateRange.end.toISOString(),
        p_eval_types: evalTypes,
        p_include_no_eval: false,
      };

      // Get staff domain averages and filter to just this staff
      const { data, error } = await supabase.rpc('get_staff_domain_avgs', params);
      if (error) throw error;
      
      const staffData = (data as any[]).filter(d => d.staff_id === staffId);
      
      // Group by domain
      const domains = new Map<number, DomainData>();
      staffData.forEach(row => {
        if (row.domain_id && !domains.has(row.domain_id)) {
          domains.set(row.domain_id, {
            domain_id: row.domain_id,
            domain_name: row.domain_name,
            observer_avg: row.observer_avg,
            self_avg: row.self_avg,
            n_items: row.n_items,
          });
        }
      });
      
      return Array.from(domains.values());
    },
    enabled: open && !!filters.organizationId && !!staffId
  });

  // Fetch competency-level data across all domains
  const { data: competencyData, isLoading: competenciesLoading } = useQuery({
    queryKey: ['staff-all-competencies', staffId, filters],
    queryFn: async () => {
      if (!filters.organizationId || !staffId || !domainData?.length) return [];

      const dateRange = periodToDateRange(filters.evaluationPeriod);
      const evalTypes = filters.evaluationPeriod.type === 'Baseline' 
        ? ['Baseline'] 
        : ['Quarterly'];

      // Fetch competencies for each domain
      const allCompetencies: CompetencyData[] = [];
      
      for (const domain of domainData) {
        const params = {
          p_org_id: filters.organizationId,
          p_staff_id: staffId,
          p_domain_id: domain.domain_id,
          p_start: dateRange.start.toISOString(),
          p_end: dateRange.end.toISOString(),
          p_eval_types: evalTypes,
        };

        const { data, error } = await supabase.rpc('get_staff_domain_competencies', params);
        if (error) continue;
        
        (data as any[]).forEach(comp => {
          allCompetencies.push({
            ...comp,
            domain_id: domain.domain_id,
            domain_name: domain.domain_name,
          });
        });
      }
      
      return allCompetencies;
    },
    enabled: open && !!filters.organizationId && !!staffId && !!domainData?.length
  });

  const isLoading = domainsLoading || competenciesLoading;

  const formatValue = (value: number | null) => {
    return value != null ? value.toFixed(1) : '—';
  };

  const getGapIndicator = (observer: number | null, self: number | null) => {
    if (observer === null || self === null) return null;
    const gap = observer - self;
    if (Math.abs(gap) < 0.3) return { type: 'calibrated', icon: CheckCircle2, color: 'text-primary' };
    if (gap < 0) return { type: 'over-confident', icon: TrendingUp, color: 'text-destructive' };
    return { type: 'under-confident', icon: TrendingDown, color: 'text-warning' };
  };

  // Group competencies by domain
  const competenciesByDomain = competencyData?.reduce((acc, comp) => {
    if (!acc[comp.domain_name]) acc[comp.domain_name] = [];
    acc[comp.domain_name].push(comp);
    return acc;
  }, {} as Record<string, CompetencyData[]>) || {};

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[500px] sm:w-[640px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-xl">{staffName}</SheetTitle>
          <SheetDescription className="flex items-center gap-2">
            {locationName} • {getPeriodLabel(filters.evaluationPeriod)}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {isLoading && (
            <div className="space-y-4">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          )}

          {!isLoading && domainData && domainData.length === 0 && (
            <div className="text-center py-8">
              <p className="text-muted-foreground">No evaluation data found for this staff member</p>
            </div>
          )}

          {!isLoading && domainData && domainData.length > 0 && (
            <>
              {/* Domain Summary Cards */}
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-3">Domain Overview</h3>
                <div className="grid grid-cols-2 gap-3">
                  {domainData.map(domain => {
                    const gap = getGapIndicator(domain.observer_avg, domain.self_avg);
                    return (
                      <Card 
                        key={domain.domain_id}
                        className="border-l-4"
                        style={{ borderLeftColor: getDomainColor(domain.domain_name) }}
                      >
                        <CardContent className="pt-3 pb-3">
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-medium text-sm">{domain.domain_name}</span>
                            {gap && (
                              <gap.icon className={`h-4 w-4 ${gap.color}`} />
                            )}
                          </div>
                          <div className="flex gap-4 text-sm">
                            <div>
                              <div className="text-xs text-muted-foreground">Obs</div>
                              <div className="font-medium">{formatValue(domain.observer_avg)}</div>
                            </div>
                            <div>
                              <div className="text-xs text-muted-foreground">Self</div>
                              <div className="font-medium">{formatValue(domain.self_avg)}</div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>

              <Separator />

              {/* Competency Breakdown by Domain */}
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-3">Competency Breakdown</h3>
                <div className="space-y-4">
                  {Object.entries(competenciesByDomain).map(([domainName, competencies]) => (
                    <div key={domainName}>
                      <div className="flex items-center gap-2 mb-2">
                        <span 
                          className="inline-block w-3 h-3 rounded-sm"
                          style={{ backgroundColor: getDomainColor(domainName) }}
                        />
                        <span className="font-medium text-sm">{domainName}</span>
                      </div>
                      <div className="space-y-2 ml-5">
                        {competencies.map(comp => {
                          const gap = getGapIndicator(comp.observer_avg, comp.self_avg);
                          return (
                            <div
                              key={comp.competency_id}
                              className="flex items-center justify-between py-2 px-3 rounded bg-muted/30"
                            >
                              <div className="flex items-center gap-2">
                                <span className="text-sm">{comp.competency_name}</span>
                                {comp.framework && (
                                  <Badge variant="outline" className="text-[10px]">
                                    {comp.framework.toUpperCase()}
                                  </Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-4 text-sm">
                                <div className="text-center">
                                  <div className="text-xs text-muted-foreground">Obs</div>
                                  <div className="font-medium">{formatValue(comp.observer_avg)}</div>
                                </div>
                                <div className="text-center">
                                  <div className="text-xs text-muted-foreground">Self</div>
                                  <div className="font-medium">{formatValue(comp.self_avg)}</div>
                                </div>
                                {gap && (
                                  <gap.icon className={`h-4 w-4 ${gap.color}`} />
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Calibration Flags */}
              {domainData.some(d => {
                const gap = d.observer_avg !== null && d.self_avg !== null 
                  ? d.observer_avg - d.self_avg 
                  : null;
                return gap !== null && Math.abs(gap) > 0.5;
              }) && (
                <>
                  <Separator />
                  <Card className="border-warning/50 bg-warning/5">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-warning" />
                        Calibration Flags
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm">
                      <ul className="space-y-1">
                        {domainData.map(d => {
                          if (d.observer_avg === null || d.self_avg === null) return null;
                          const gap = d.observer_avg - d.self_avg;
                          if (Math.abs(gap) <= 0.5) return null;
                          
                          return (
                            <li key={d.domain_id} className="flex items-center gap-2">
                              <span 
                                className="inline-block w-2 h-2 rounded-full"
                                style={{ backgroundColor: getDomainColor(d.domain_name) }}
                              />
                              <span>
                                {d.domain_name}: {gap < 0 ? 'Over-confident' : 'Under-confident'} by {Math.abs(gap).toFixed(1)}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    </CardContent>
                  </Card>
                </>
              )}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}