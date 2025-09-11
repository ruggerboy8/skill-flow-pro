import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Download } from 'lucide-react';
import { downloadCSV, formatValueForCSV } from '@/lib/csvExport';
import { getDomainColor } from '@/lib/domainColors';
import type { EvalFilters } from '@/types/analytics';

interface ProMovesComparisonTabProps {
  filters: EvalFilters;
}

interface ComparisonData {
  evaluation_id: string;
  staff_id: string;
  primary_location_id: string;
  competency_id: number;
  competency_name: string;
  domain_id: number;
  domain_name: string;
  eval_observer_avg: number;
  eval_self_avg: number;
  conf_avg: number;
  perf_avg: number;
  framework: string | null;
}

export function ProMovesComparisonTab({ filters }: ProMovesComparisonTabProps) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['pro-moves-comparison', filters],
    queryFn: async () => {
      if (!filters.organizationId) return [];

      const params = {
        p_org_id: filters.organizationId,
        p_window_days: filters.windowDays,
        p_start: filters.dateRange.start?.toISOString(),
        p_end: filters.dateRange.end?.toISOString(),
        ...(filters.locationIds?.length ? { p_location_ids: filters.locationIds } : {}),
        ...(filters.roleIds?.length ? { p_role_ids: filters.roleIds } : {}),
        ...(filters.evaluationTypes?.length ? { p_types: filters.evaluationTypes } : {}),
      };

      console.log('Calling compare_conf_perf_to_eval with params:', params);

      const { data, error } = await supabase.rpc('compare_conf_perf_to_eval', params);

      console.log('compare_conf_perf_to_eval result:', { data, error });
      if (error) throw error;
      return data as ComparisonData[];
    },
    enabled: !!filters.organizationId
  });

  // Group data by domain, then by competency
  const groupedData = data?.reduce((acc, item) => {
    if (!acc[item.domain_id]) {
      acc[item.domain_id] = {
        domain_name: item.domain_name,
        competencies: {}
      };
    }
    
    if (!acc[item.domain_id].competencies[item.competency_id]) {
      acc[item.domain_id].competencies[item.competency_id] = [];
    }
    
    acc[item.domain_id].competencies[item.competency_id].push(item);
    return acc;
  }, {} as Record<number, { domain_name: string; competencies: Record<number, ComparisonData[]> }>) || {};

  function calculateDelta(perf: number | null, eval_score: number | null): number | null {
    if (perf === null || eval_score === null) return null;
    return perf - eval_score;
  }

  function exportToCSV() {
    if (!data) return;

    const csvData = data.map(item => ({
      'Domain': item.domain_name,
      'Competency': item.competency_name || `Competency ${item.competency_id}`,
      'Framework': item.framework || '',
      'Eval Avg (Observer)': formatValueForCSV(item.eval_observer_avg),
      'Eval Avg (Self)': formatValueForCSV(item.eval_self_avg),
      'Confidence Avg': formatValueForCSV(item.conf_avg),
      'Performance Avg': formatValueForCSV(item.perf_avg),
      'Δ Perf→Eval': formatValueForCSV(calculateDelta(item.perf_avg, item.eval_observer_avg)),
      'Δ Conf→Eval': formatValueForCSV(calculateDelta(item.conf_avg, item.eval_observer_avg))
    }));

    downloadCSV(csvData, 'pro_moves_vs_evaluation');
  }

  if (!filters.organizationId) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground">Please select an organization to view data.</p>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>Pro-Moves vs Eval</CardTitle>
            <Skeleton className="h-10 w-32" />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-destructive">Error loading data: {error.message}</p>
        </CardContent>
      </Card>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground">No data found for the selected filters.</p>
        </CardContent>
      </Card>
    );
  }

  const domains = Object.entries(groupedData);

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle>Pro-Moves vs Eval</CardTitle>
          <Button onClick={exportToCSV} variant="outline" size="sm">
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          Comparing pro moves data from {filters.windowDays} days before evaluations
        </p>
      </CardHeader>
      <CardContent>
        <Accordion type="multiple" className="space-y-4">
          {domains.map(([domainId, domainData]) => {
            const competencyEntries = Object.entries(domainData.competencies)
              .sort(([aId], [bId]) => parseInt(aId) - parseInt(bId));
            
            return (
              <AccordionItem key={domainId} value={domainId}>
                <AccordionTrigger className="hover:no-underline">
                  <div className="flex justify-between items-center w-full mr-4">
                    <span
                      className="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium"
                      style={{ backgroundColor: getDomainColor(domainData.domain_name), color: "#000" }}
                    >
                      {domainData.domain_name}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {competencyEntries.length} competenc{competencyEntries.length === 1 ? 'y' : 'ies'}
                    </span>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Competency</TableHead>
                        <TableHead className="text-right">Eval Avg (Obs)</TableHead>
                        <TableHead className="text-right">Eval Avg (Self)</TableHead>
                        <TableHead className="text-right">Conf Avg</TableHead>
                        <TableHead className="text-right">Perf Avg</TableHead>
                        <TableHead className="text-right">Δ Perf→Eval</TableHead>
                        <TableHead className="text-right">Δ Conf→Eval</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {competencyEntries.map(([competencyId, items]) => {
                        // Calculate averages across all items for this competency
                        const avgEvalObserver = items.reduce((sum, item) => sum + (item.eval_observer_avg || 0), 0) / items.length;
                        const avgEvalSelf = items.reduce((sum, item) => sum + (item.eval_self_avg || 0), 0) / items.length;
                        const avgConf = items.reduce((sum, item) => sum + (item.conf_avg || 0), 0) / items.filter(item => item.conf_avg !== null).length;
                        const avgPerf = items.reduce((sum, item) => sum + (item.perf_avg || 0), 0) / items.filter(item => item.perf_avg !== null).length;
                        
                        const deltaPerfEval = calculateDelta(avgPerf, avgEvalObserver);
                        const deltaConfEval = calculateDelta(avgConf, avgEvalObserver);

                        // Get competency name and framework from first item
                        const competencyName = items[0]?.competency_name || `Competency ${competencyId}`;
                        const competencyFramework = items[0]?.framework;

                        return (
                          <TableRow key={competencyId}>
                            <TableCell>
                              <div
                                className="border-l-4 pl-3 py-2 rounded"
                                style={{ borderColor: getDomainColor(domainData.domain_name) }}
                              >
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium">{competencyName}</span>
                                  {competencyFramework && (
                                    <Badge variant="outline" className="text-[10px] leading-4">
                                      {competencyFramework.toUpperCase()}
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="text-right">
                              {isNaN(avgEvalObserver) ? '—' : avgEvalObserver.toFixed(2)}
                            </TableCell>
                            <TableCell className="text-right">
                              {isNaN(avgEvalSelf) ? '—' : avgEvalSelf.toFixed(2)}
                            </TableCell>
                            <TableCell className="text-right">
                              {isNaN(avgConf) ? '—' : avgConf.toFixed(2)}
                            </TableCell>
                            <TableCell className="text-right">
                              {isNaN(avgPerf) ? '—' : avgPerf.toFixed(2)}
                            </TableCell>
                            <TableCell className="text-right">
                              <span className={deltaPerfEval !== null ? (deltaPerfEval > 0 ? 'text-green-600' : deltaPerfEval < 0 ? 'text-red-600' : '') : ''}>
                                {deltaPerfEval !== null ? (deltaPerfEval > 0 ? '+' : '') + deltaPerfEval.toFixed(2) : '—'}
                              </span>
                            </TableCell>
                            <TableCell className="text-right">
                              <span className={deltaConfEval !== null ? (deltaConfEval > 0 ? 'text-green-600' : deltaConfEval < 0 ? 'text-red-600' : '') : ''}>
                                {deltaConfEval !== null ? (deltaConfEval > 0 ? '+' : '') + deltaConfEval.toFixed(2) : '—'}
                              </span>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      </CardContent>
    </Card>
  );
}