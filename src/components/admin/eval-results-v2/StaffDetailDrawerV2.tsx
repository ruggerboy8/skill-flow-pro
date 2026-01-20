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
import { AlertTriangle } from 'lucide-react';
import { getDomainColor } from '@/lib/domainColors';
import { DOMAIN_ORDER, getDomainOrderIndex } from '@/lib/domainUtils';
import type { EvalFilters } from '@/types/analytics';
import { getPeriodLabel } from '@/types/analytics';

interface StaffDetailDrawerV2Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  staffId: string;
  staffName: string;
  evaluationId: string | null;
  locationName: string;
  filters: EvalFilters;
}

interface EvaluationItem {
  competency_id: number;
  competency_name_snapshot: string;
  domain_id: number;
  domain_name: string;
  observer_score: number | null;
  self_score: number | null;
}

interface DomainSummary {
  domain_id: number;
  domain_name: string;
  observer_avg: number | null;
  self_avg: number | null;
  n_items: number;
}

export function StaffDetailDrawerV2({
  open,
  onOpenChange,
  staffId,
  staffName,
  evaluationId,
  locationName,
  filters
}: StaffDetailDrawerV2Props) {
  // Fetch evaluation items directly
  const { data: items, isLoading } = useQuery({
    queryKey: ['evaluation-items-v2', evaluationId],
    queryFn: async () => {
      if (!evaluationId) return [];

      const { data, error } = await supabase
        .from('evaluation_items')
        .select('competency_id, competency_name_snapshot, domain_id, domain_name, observer_score, self_score')
        .eq('evaluation_id', evaluationId);
      
      if (error) throw error;
      return data as EvaluationItem[];
    },
    enabled: open && !!evaluationId
  });

  const formatValue = (value: number | null) => {
    return value != null ? value.toFixed(1) : '—';
  };

  const getGapLabel = (observer: number | null, self: number | null) => {
    if (observer === null || self === null) return null;
    const gap = observer - self;
    if (Math.abs(gap) < 0.5) return null;
    if (gap < 0) return { type: 'over-confident', color: 'text-destructive' };
    return { type: 'under-confident', color: 'text-warning' };
  };

  // Calculate domain summaries
  const domainSummaries: DomainSummary[] = [];
  if (items && items.length > 0) {
    const domainMap = new Map<number, { name: string; obsSum: number; obsCount: number; selfSum: number; selfCount: number; nItems: number }>();
    
    for (const item of items) {
      if (!item.domain_id) continue;
      
      if (!domainMap.has(item.domain_id)) {
        domainMap.set(item.domain_id, {
          name: item.domain_name || 'Unknown',
          obsSum: 0,
          obsCount: 0,
          selfSum: 0,
          selfCount: 0,
          nItems: 0
        });
      }
      
      const d = domainMap.get(item.domain_id)!;
      d.nItems++;
      if (item.observer_score !== null) {
        d.obsSum += item.observer_score;
        d.obsCount++;
      }
      if (item.self_score !== null) {
        d.selfSum += item.self_score;
        d.selfCount++;
      }
    }
    
    for (const [domainId, d] of domainMap) {
      domainSummaries.push({
        domain_id: domainId,
        domain_name: d.name,
        observer_avg: d.obsCount > 0 ? d.obsSum / d.obsCount : null,
        self_avg: d.selfCount > 0 ? d.selfSum / d.selfCount : null,
        n_items: d.nItems
      });
    }
    
    // Sort by canonical domain order
    domainSummaries.sort((a, b) => getDomainOrderIndex(a.domain_name) - getDomainOrderIndex(b.domain_name));
  }

  // Group competencies by domain (sorted)
  const competenciesByDomain: Record<string, EvaluationItem[]> = {};
  if (items) {
    // Sort items by domain order first
    const sortedItems = [...items].sort((a, b) => 
      getDomainOrderIndex(a.domain_name || '') - getDomainOrderIndex(b.domain_name || '')
    );
    
    for (const item of sortedItems) {
      const domainName = item.domain_name || 'Unknown';
      if (!competenciesByDomain[domainName]) {
        competenciesByDomain[domainName] = [];
      }
      competenciesByDomain[domainName].push(item);
    }
  }

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

          {!isLoading && !evaluationId && (
            <div className="text-center py-8">
              <p className="text-muted-foreground">No evaluation found for this staff member</p>
            </div>
          )}

          {!isLoading && evaluationId && items && items.length === 0 && (
            <div className="text-center py-8">
              <p className="text-muted-foreground">No evaluation items found</p>
            </div>
          )}

          {!isLoading && items && items.length > 0 && (
            <>
              {/* Domain Summary Cards */}
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-3">Domain Overview</h3>
                <div className="grid grid-cols-2 gap-3">
                  {domainSummaries.map(domain => {
                    return (
                      <Card 
                        key={domain.domain_id}
                        className="border-l-4"
                        style={{ borderLeftColor: getDomainColor(domain.domain_name) }}
                      >
                        <CardContent className="pt-3 pb-3">
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-medium text-sm">{domain.domain_name}</span>
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
                          return (
                            <div
                              key={comp.competency_id}
                              className="flex items-center justify-between py-2 px-3 rounded bg-muted/30"
                            >
                              <span className="text-sm">{comp.competency_name_snapshot}</span>
                              <div className="flex items-center gap-4 text-sm">
                                <div className="text-center">
                                  <div className="text-xs text-muted-foreground">Obs</div>
                                  <div className="font-medium">{comp.observer_score ?? '—'}</div>
                                </div>
                                <div className="text-center">
                                  <div className="text-xs text-muted-foreground">Self</div>
                                  <div className="font-medium">{comp.self_score ?? '—'}</div>
                                </div>
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
              {domainSummaries.some(d => {
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
                        {domainSummaries.map(d => {
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
