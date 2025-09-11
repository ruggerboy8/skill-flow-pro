import { useState } from 'react';
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

interface StrengthsTabProps {
  filters: EvalFilters;
}

interface StrengthsData {
  level: string;
  id: number;
  name: string;
  n_items: number;
  avg_observer: number;
  domain_id: number;
  domain_name: string;
  framework: string | null;
}

export function StrengthsTab({ filters }: StrengthsTabProps) {
  const [openAccordions, setOpenAccordions] = useState<string[]>([]);

  const { data, isLoading, error } = useQuery({
    queryKey: ['strengths-weaknesses', filters],
    queryFn: async () => {
      if (!filters.organizationId) return [];

      const params = {
        p_org_id: filters.organizationId,
        p_start: filters.dateRange.start?.toISOString(),
        p_end: filters.dateRange.end?.toISOString(),
        ...(filters.locationIds?.length ? { p_location_ids: filters.locationIds } : {}),
        ...(filters.roleIds?.length ? { p_role_ids: filters.roleIds } : {}),
        ...(filters.evaluationTypes?.length ? { p_types: filters.evaluationTypes } : {}),
      };

      console.log('Calling get_strengths_weaknesses with params:', params);

      const { data, error } = await supabase.rpc('get_strengths_weaknesses', params);

      console.log('get_strengths_weaknesses result:', { data, error });
      if (error) throw error;
      return data as StrengthsData[];
    },
    enabled: !!filters.organizationId
  });

  // Group data by domain
  const domainItems = data?.filter(d => d.level === 'domain') || [];
  const competencyItems = data?.filter(d => d.level === 'competency') || [];

  const groupedData = domainItems.reduce((acc, domain) => {
    acc[domain.id] = {
      domain,
      competencies: competencyItems.filter(comp => comp.domain_id === domain.id)
    };
    return acc;
  }, {} as Record<number, { domain: StrengthsData; competencies: StrengthsData[] }>);

  const sortedDomains = Object.values(groupedData).sort((a, b) => b.domain.avg_observer - a.domain.avg_observer);

  function exportToCSV() {
    if (!data) return;

    const csvData = data.map(item => ({
      'Level': item.level,
      'Name': item.name,
      'Framework': item.framework || '',
      'Average Observer Score': formatValueForCSV(item.avg_observer),
      'Number of Items': item.n_items
    }));

    downloadCSV(csvData, 'strengths_weaknesses');
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
            <CardTitle>Overview</CardTitle>
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

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle>Overview</CardTitle>
          <Button onClick={exportToCSV} variant="outline" size="sm">
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <Accordion 
          type="multiple" 
          className="space-y-4"
          value={openAccordions}
          onValueChange={setOpenAccordions}
        >
          {sortedDomains.map(({ domain, competencies }) => (
            <AccordionItem key={domain.id} value={domain.id.toString()}>
              <AccordionTrigger className="hover:no-underline">
                <div className="flex justify-between items-center w-full mr-4">
                  <span
                    className="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium"
                    style={{ backgroundColor: getDomainColor(domain.domain_name), color: "#000" }}
                  >
                    {domain.name}
                  </span>
                  <div className="flex gap-4 text-sm text-muted-foreground">
                    <span>Avg: {domain.avg_observer?.toFixed(2) || '—'}</span>
                    <span>Items: {domain.n_items}</span>
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                {competencies.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Competency</TableHead>
                        <TableHead className="text-right">Avg Observer Score</TableHead>
                        <TableHead className="text-right">Items</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {competencies
                        .sort((a, b) => a.id - b.id)
                        .map((competency) => (
                        <TableRow key={competency.id}>
                          <TableCell>
                            <div
                              className="border-l-4 pl-3 py-2 rounded"
                              style={{ borderColor: getDomainColor(competency.domain_name) }}
                            >
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium">{competency.name}</span>
                                {competency.framework && (
                                  <Badge variant="outline" className="text-[10px] leading-4">
                                    {competency.framework.toUpperCase()}
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            {competency.avg_observer?.toFixed(2) || '—'}
                          </TableCell>
                          <TableCell className="text-right">{competency.n_items}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <p className="text-muted-foreground text-sm py-4">No competency data available for this domain.</p>
                )}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </CardContent>
    </Card>
  );
}