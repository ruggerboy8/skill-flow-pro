import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Download, ChevronDown } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { StaffDomainDrawer } from './StaffDomainDrawer';
import { pivotStaffDomain, type LongRow } from '@/lib/pivot';
import { downloadCSV, formatValueForCSV } from '@/lib/csvExport';
import { getDomainColor } from '@/lib/domainColors';
import type { EvalFilters } from '@/types/analytics';

interface IndividualResultsTabProps {
  filters: EvalFilters;
}

interface StaffDomainData {
  staff_id: string;
  staff_name: string;
  role_id: number;
  location_id: string;
  location_name: string;
  domain_id: number | null;
  domain_name: string | null;
  observer_avg: number | null;
  self_avg: number | null;
  n_items: number;
  last_eval_at: string | null;
  has_eval: boolean;
}

export function IndividualResultsTab({ filters }: IndividualResultsTabProps) {
  const [drawerState, setDrawerState] = useState<{
    open: boolean;
    staffId: string;
    staffName: string;
    domainId: number;
    domainName: string;
  }>({
    open: false,
    staffId: '',
    staffName: '',
    domainId: 0,
    domainName: '',
  });

  const { data: rawData, isLoading, error } = useQuery({
    queryKey: ['staff-domain-averages', filters],
    queryFn: async () => {
      if (!filters.organizationId) return [];

      const params = {
        p_org_id: filters.organizationId,
        p_start: filters.dateRange.start?.toISOString(),
        p_end: filters.dateRange.end?.toISOString(),
        ...(filters.locationIds?.length ? { p_location_ids: filters.locationIds } : {}),
        ...(filters.roleIds?.length ? { p_role_ids: filters.roleIds } : {}),
        ...(filters.evaluationTypes?.length ? { p_eval_types: filters.evaluationTypes } : {}),
        p_include_no_eval: filters.includeNoEvals,
      };

      const { data, error } = await supabase.rpc('get_staff_domain_avgs', params);
      if (error) throw error;
      return data as StaffDomainData[];
    },
    enabled: !!filters.organizationId
  });

  // Convert raw data to pivot format
  const pivotData = rawData ? pivotStaffDomain(
    rawData.map(item => ({
      staff_id: item.staff_id,
      staff_name: item.staff_name,
      location_name: item.location_name,
      domain_name: item.domain_name || '',
      observer_avg: item.observer_avg,
      self_avg: item.self_avg,
      has_eval: item.has_eval,
    }))
  ) : { rows: [], domains: [] };

  const handleCellClick = (staffId: string, staffName: string, domainName: string) => {
    // Find domain_id from raw data
    const domainData = rawData?.find(d => d.staff_id === staffId && d.domain_name === domainName);
    if (domainData?.domain_id) {
      setDrawerState({
        open: true,
        staffId,
        staffName,
        domainId: domainData.domain_id,
        domainName,
      });
    }
  };

  const formatValue = (value: number | null) => {
    return value != null ? value.toFixed(1) : '—';
  };

  const exportWideCSV = () => {
    if (!pivotData.rows.length) return;

    const csvData = pivotData.rows.map(row => {
      const csvRow: Record<string, any> = {
        'Staff': row.staff_name,
        'Location': row.location_name,
        'Has Eval': row.has_eval ? 'Yes' : 'No',
      };
      
      pivotData.domains.forEach(domain => {
        csvRow[`${domain} (Obs)`] = formatValueForCSV(row.domains[domain]?.obs);
        csvRow[`${domain} (Self)`] = formatValueForCSV(row.domains[domain]?.self);
      });
      
      return csvRow;
    });

    downloadCSV(csvData, 'individual_results_wide');
  };

  const exportLongCSV = () => {
    if (!rawData) return;

    const csvData = rawData.map(item => ({
      'Staff ID': item.staff_id,
      'Staff Name': item.staff_name,
      'Location': item.location_name,
      'Domain': item.domain_name || '',
      'Observer Avg': formatValueForCSV(item.observer_avg),
      'Self Avg': formatValueForCSV(item.self_avg),
      'N Items': item.n_items,
      'Has Eval': item.has_eval ? 'Yes' : 'No',
      'Last Eval': item.last_eval_at ? new Date(item.last_eval_at).toLocaleDateString() : '',
    }));

    downloadCSV(csvData, 'individual_results_long');
  };

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

  if (!rawData || rawData.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground">No data found for the selected filters.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>Individual Results</CardTitle>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <Download className="mr-2 h-4 w-4" />
                  Export CSV
                  <ChevronDown className="ml-2 h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={exportWideCSV}>
                  Export Wide Format
                </DropdownMenuItem>
                <DropdownMenuItem onClick={exportLongCSV}>
                  Export Long Format
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-background z-10">
                <TableRow>
                  <TableHead className="sticky left-0 bg-background z-20 min-w-[200px]">Staff</TableHead>
                  <TableHead className="sticky left-[200px] bg-background z-20 min-w-[150px]">Location</TableHead>
                  {pivotData.domains.map(domain => (
                    <TableHead key={domain} className="text-center" colSpan={2}>
                      <div className="flex items-center justify-center gap-2">
                        <span>{domain}</span>
                        <span 
                          className="inline-block w-3 h-3 rounded-sm" 
                          style={{ backgroundColor: getDomainColor(domain) }}
                        />
                      </div>
                    </TableHead>
                  ))}
                </TableRow>
                <TableRow>
                  <TableHead className="sticky left-0 bg-background z-20"></TableHead>
                  <TableHead className="sticky left-[200px] bg-background z-20"></TableHead>
                  {pivotData.domains.map(domain => (
                    <React.Fragment key={domain}>
                      <TableHead className="text-center text-xs">Obs</TableHead>
                      <TableHead className="text-center text-xs">Self</TableHead>
                    </React.Fragment>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {pivotData.rows.map((row) => (
                  <TableRow key={row.staff_id}>
                    <TableCell className="sticky left-0 bg-background z-10 min-w-[200px]">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{row.staff_name}</span>
                        {!row.has_eval && (
                          <Badge variant="secondary" className="text-xs">
                            No eval this period
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="sticky left-[200px] bg-background z-10 min-w-[150px]">
                      {row.location_name}
                    </TableCell>
                    {pivotData.domains.map(domain => (
                      <React.Fragment key={domain}>
                        <TableCell 
                          className="text-center cursor-pointer hover:bg-muted/50"
                          onClick={() => row.domains[domain]?.obs != null && handleCellClick(row.staff_id, row.staff_name, domain)}
                        >
                          {row.domains[domain]?.obs != null ? (
                            <div className="flex items-center justify-center gap-1">
                              <span 
                                className="inline-block w-1.5 h-1.5 rounded-full" 
                                style={{ backgroundColor: getDomainColor(domain) }}
                              />
                              <span>{formatValue(row.domains[domain]?.obs)}</span>
                            </div>
                          ) : (
                            '—'
                          )}
                        </TableCell>
                        <TableCell 
                          className="text-center cursor-pointer hover:bg-muted/50"
                          onClick={() => row.domains[domain]?.self != null && handleCellClick(row.staff_id, row.staff_name, domain)}
                        >
                          {row.domains[domain]?.self != null ? (
                            <div className="flex items-center justify-center gap-1">
                              <span 
                                className="inline-block w-1.5 h-1.5 rounded-full" 
                                style={{ backgroundColor: getDomainColor(domain) }}
                              />
                              <span>{formatValue(row.domains[domain]?.self)}</span>
                            </div>
                          ) : (
                            '—'
                          )}
                        </TableCell>
                      </React.Fragment>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <StaffDomainDrawer
        open={drawerState.open}
        onOpenChange={(open) => setDrawerState(prev => ({ ...prev, open }))}
        staffId={drawerState.staffId}
        staffName={drawerState.staffName}
        domainId={drawerState.domainId}
        domainName={drawerState.domainName}
        filters={filters}
      />
    </>
  );
}