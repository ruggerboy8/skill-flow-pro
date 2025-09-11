import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Download } from 'lucide-react';
import { downloadCSV, formatValueForCSV } from '@/lib/csvExport';
import { EvalFilters } from '../../../pages/admin/EvalResults';

interface StrengthsTabProps {
  filters: EvalFilters;
}

interface StrengthsData {
  level: string;
  id: number;
  name: string;
  n_items: number;
  avg_observer: number;
}

export function StrengthsTab({ filters }: StrengthsTabProps) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['strengths-weaknesses', filters],
    queryFn: async () => {
      if (!filters.organizationId) return [];

      console.log('Calling get_strengths_weaknesses with params:', {
        p_org_id: filters.organizationId,
        p_location_ids: filters.locationIds.length > 0 ? filters.locationIds : null,
        p_role_ids: filters.roleIds.length > 0 ? filters.roleIds : null,
        p_types: filters.evaluationTypes.length > 0 ? filters.evaluationTypes : null,
        p_start: filters.dateRange.start.toISOString(),
        p_end: filters.dateRange.end.toISOString()
      });

      const { data, error } = await supabase.rpc('get_strengths_weaknesses', {
        p_org_id: filters.organizationId,
        p_location_ids: filters.locationIds.length > 0 ? filters.locationIds : null,
        p_role_ids: filters.roleIds.length > 0 ? filters.roleIds : null,
        p_types: filters.evaluationTypes.length > 0 ? filters.evaluationTypes : null,
        p_start: filters.dateRange.start.toISOString(),
        p_end: filters.dateRange.end.toISOString()
      });

      console.log('get_strengths_weaknesses result:', { data, error });
      if (error) throw error;
      return data as StrengthsData[];
    },
    enabled: !!filters.organizationId
  });

  // Group data by domain
  const groupedData = data?.reduce((acc, item) => {
    if (item.level === 'domain') {
      if (!acc[item.id]) {
        acc[item.id] = {
          domain: item,
          competencies: []
        };
      }
    } else if (item.level === 'competency') {
      // Find the domain for this competency
      const domainData = data.find(d => d.level === 'domain');
      if (domainData) {
        if (!acc[domainData.id]) {
          acc[domainData.id] = {
            domain: domainData,
            competencies: []
          };
        }
        acc[domainData.id].competencies.push(item);
      }
    }
    return acc;
  }, {} as Record<number, { domain: StrengthsData; competencies: StrengthsData[] }>) || {};

  function exportToCSV() {
    if (!data) return;

    const csvData = data.map(item => ({
      'Level': item.level,
      'Name': item.name,
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
            <CardTitle>Strengths & Weaknesses</CardTitle>
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

  const domains = Object.values(groupedData).sort((a, b) => b.domain.avg_observer - a.domain.avg_observer);

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle>Strengths & Weaknesses</CardTitle>
          <Button onClick={exportToCSV} variant="outline" size="sm">
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <Accordion type="multiple" className="space-y-4">
          {domains.map(({ domain, competencies }) => (
            <AccordionItem key={domain.id} value={domain.id.toString()}>
              <AccordionTrigger className="hover:no-underline">
                <div className="flex justify-between items-center w-full mr-4">
                  <span className="font-medium">{domain.name}</span>
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
                        .sort((a, b) => (b.avg_observer || 0) - (a.avg_observer || 0))
                        .map((competency) => (
                        <TableRow key={competency.id}>
                          <TableCell className="font-medium">{competency.name}</TableCell>
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