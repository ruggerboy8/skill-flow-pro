import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Download, ArrowUpDown } from 'lucide-react';
import { downloadCSV, formatValueForCSV } from '@/lib/csvExport';
import type { EvalFilters } from '@/types/analytics';
import { periodToDateRange } from '@/types/analytics';

interface StaffLocationsTabProps {
  filters: EvalFilters;
}

interface StaffLocationData {
  location_id: string;
  location_name: string;
  staff_id: string;
  staff_name: string;
  domain_id: number;
  domain_name: string;
  n_items: number;
  avg_observer: number;
  has_eval: boolean;
}

type SortField = 'staff_name' | 'location_name' | 'domain_name' | 'avg_observer' | 'n_items';
type SortDirection = 'asc' | 'desc';

export function StaffLocationsTab({ filters }: StaffLocationsTabProps) {
  const [sortField, setSortField] = useState<SortField>('location_name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  const { data, isLoading, error } = useQuery({
    queryKey: ['staff-locations', filters],
    queryFn: async () => {
      if (!filters.organizationId) return [];

      const dateRange = periodToDateRange(filters.evaluationPeriod);
      const evalTypes = filters.evaluationPeriod.type === 'Baseline' 
        ? ['Baseline'] 
        : ['Quarterly'];

      const params = {
        p_org_id: filters.organizationId,
        p_start: dateRange.start.toISOString(),
        p_end: dateRange.end.toISOString(),
        p_include_no_eval: filters.includeNoEvals,
        ...(filters.locationIds?.length ? { p_location_ids: filters.locationIds } : {}),
        ...(filters.roleIds?.length ? { p_role_ids: filters.roleIds } : {}),
        p_types: evalTypes,
      };

      const { data, error } = await supabase.rpc('get_location_domain_staff_averages', params);

      if (error) throw error;
      return data as StaffLocationData[];
    },
    enabled: !!filters.organizationId
  });

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  }

  const sortedData = data?.slice().sort((a, b) => {
    let aVal: any = a[sortField];
    let bVal: any = b[sortField];

    // Handle null values
    if (aVal === null && bVal === null) return 0;
    if (aVal === null) return 1;
    if (bVal === null) return -1;

    // Convert to string for comparison if needed
    if (typeof aVal === 'string') {
      aVal = aVal.toLowerCase();
      bVal = bVal.toLowerCase();
    }

    if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
    if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
    return 0;
  });

  function exportToCSV() {
    if (!sortedData) return;

    const csvData = sortedData.map(item => ({
      'Staff': item.staff_name,
      'Location': item.location_name,
      'Domain': item.domain_name || '—',
      'Average Observer Score': formatValueForCSV(item.avg_observer),
      'Number of Items': item.n_items,
      'Status': item.has_eval ? 'Has evaluation' : 'No eval this period'
    }));

    downloadCSV(csvData, 'staff_by_location');
  }

  function getSortIcon(field: SortField) {
    if (sortField !== field) {
      return <ArrowUpDown className="ml-2 h-4 w-4 opacity-50" />;
    }
    return <ArrowUpDown className={`ml-2 h-4 w-4 ${sortDirection === 'desc' ? 'rotate-180' : ''}`} />;
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
            <CardTitle>Individual Results</CardTitle>
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
          <CardTitle>Individual Results</CardTitle>
          <Button onClick={exportToCSV} variant="outline" size="sm">
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead 
                  className="cursor-pointer select-none"
                  onClick={() => handleSort('staff_name')}
                >
                  <div className="flex items-center">
                    Staff
                    {getSortIcon('staff_name')}
                  </div>
                </TableHead>
                <TableHead 
                  className="cursor-pointer select-none"
                  onClick={() => handleSort('location_name')}
                >
                  <div className="flex items-center">
                    Location
                    {getSortIcon('location_name')}
                  </div>
                </TableHead>
                <TableHead 
                  className="cursor-pointer select-none"
                  onClick={() => handleSort('domain_name')}
                >
                  <div className="flex items-center">
                    Domain
                    {getSortIcon('domain_name')}
                  </div>
                </TableHead>
                <TableHead 
                  className="text-right cursor-pointer select-none"
                  onClick={() => handleSort('avg_observer')}
                >
                  <div className="flex items-center justify-end">
                    Avg Observer
                    {getSortIcon('avg_observer')}
                  </div>
                </TableHead>
                <TableHead 
                  className="text-right cursor-pointer select-none"
                  onClick={() => handleSort('n_items')}
                >
                  <div className="flex items-center justify-end">
                    N
                    {getSortIcon('n_items')}
                  </div>
                </TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedData?.map((item, index) => (
                <TableRow key={`${item.staff_id}-${item.domain_id}-${index}`}>
                  <TableCell className="font-medium">{item.staff_name}</TableCell>
                  <TableCell>{item.location_name}</TableCell>
                  <TableCell>{item.domain_name || '—'}</TableCell>
                  <TableCell className="text-right">
                    {item.avg_observer !== null ? item.avg_observer.toFixed(2) : '—'}
                  </TableCell>
                  <TableCell className="text-right">{item.n_items}</TableCell>
                  <TableCell>
                    <span className={item.has_eval ? 'text-green-600' : 'text-orange-600'}>
                      {item.has_eval ? 'Has evaluation' : 'No eval this period'}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
