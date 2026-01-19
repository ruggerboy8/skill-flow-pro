import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { ChevronLeft, Download } from 'lucide-react';
import { StaffDetailDrawer } from './StaffDetailDrawer';
import { pivotStaffDomain } from '@/lib/pivot';
import { downloadCSV, formatValueForCSV } from '@/lib/csvExport';
import { getDomainColor } from '@/lib/domainColors';
import type { EvalFilters } from '@/types/analytics';
import { periodToDateRange, getPeriodLabel } from '@/types/analytics';

interface LocationEvalDetailProps {
  filters: EvalFilters;
  locationId: string;
  locationName: string;
  onBack: () => void;
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

export function LocationEvalDetail({ filters, locationId, locationName, onBack }: LocationEvalDetailProps) {
  const [drawerState, setDrawerState] = useState<{
    open: boolean;
    staffId: string;
    staffName: string;
  }>({
    open: false,
    staffId: '',
    staffName: '',
  });

  // Fetch staff data for this location only
  const { data: rawData, isLoading, error } = useQuery({
    queryKey: ['location-staff-domain-averages', locationId, filters],
    queryFn: async () => {
      if (!filters.organizationId || !locationId) return [];

      const dateRange = periodToDateRange(filters.evaluationPeriod);
      const evalTypes = filters.evaluationPeriod.type === 'Baseline' 
        ? ['Baseline'] 
        : ['Quarterly'];

      const params = {
        p_org_id: filters.organizationId,
        p_start: dateRange.start.toISOString(),
        p_end: dateRange.end.toISOString(),
        p_location_ids: [locationId],
        ...(filters.roleIds?.length ? { p_role_ids: filters.roleIds } : {}),
        p_eval_types: evalTypes,
        p_include_no_eval: filters.includeNoEvals,
      };

      const { data, error } = await supabase.rpc('get_staff_domain_avgs', params);
      if (error) throw error;
      return data as StaffDomainData[];
    },
    enabled: !!filters.organizationId && !!locationId
  });

  // Calculate counts for the header
  const staffCounts = React.useMemo(() => {
    if (!rawData || rawData.length === 0) return { total: 0, withEval: 0 };
    const uniqueStaff = new Set(rawData.map(r => r.staff_id));
    const staffWithEval = new Set(rawData.filter(r => r.has_eval).map(r => r.staff_id));
    return { total: uniqueStaff.size, withEval: staffWithEval.size };
  }, [rawData]);

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

  const handleRowClick = (staffId: string, staffName: string) => {
    setDrawerState({
      open: true,
      staffId,
      staffName,
    });
  };

  const formatValue = (value: number | null) => {
    return value != null ? value.toFixed(1) : '—';
  };

  const exportCSV = () => {
    if (!pivotData.rows.length) return;

    const csvData = pivotData.rows.map(row => {
      const csvRow: Record<string, any> = {
        'Staff': row.staff_name,
        'Has Eval': row.has_eval ? 'Yes' : 'No',
      };
      
      pivotData.domains.forEach(domain => {
        csvRow[`${domain} (Obs)`] = formatValueForCSV(row.domains[domain]?.obs);
        csvRow[`${domain} (Self)`] = formatValueForCSV(row.domains[domain]?.self);
      });
      
      return csvRow;
    });

    downloadCSV(csvData, `${locationName.replace(/\s+/g, '_')}_eval_results`);
  };


  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
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

  return (
    <>
      <div className="space-y-6">
        {/* Header with breadcrumb */}
        <div>
          <Button variant="ghost" size="sm" onClick={onBack} className="mb-2 -ml-2">
            <ChevronLeft className="h-4 w-4 mr-1" />
            Back to All Locations
          </Button>
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold">{locationName}</h2>
            <Badge variant="outline">{getPeriodLabel(filters.evaluationPeriod)}</Badge>
            <span className="text-sm text-muted-foreground">
              {staffCounts.withEval} of {staffCounts.total} evaluated
            </span>
          </div>
        </div>

        {/* Staff table */}
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle>Staff Results</CardTitle>
              <Button variant="outline" size="sm" onClick={exportCSV}>
                <Download className="mr-2 h-4 w-4" />
                Export CSV
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {pivotData.rows.length === 0 ? (
              <div className="py-12 text-center">
                <p className="text-muted-foreground">No staff data found for this location.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="sticky top-0 bg-background z-10">
                    <TableRow>
                      <TableHead className="sticky left-0 bg-background z-20 min-w-[200px]">Staff</TableHead>
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
                      <TableRow 
                        key={row.staff_id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => handleRowClick(row.staff_id, row.staff_name)}
                      >
                        <TableCell className="sticky left-0 bg-background z-10 min-w-[200px]">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{row.staff_name}</span>
                            {!row.has_eval && (
                              <Badge variant="secondary" className="text-xs">
                                No eval
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        {pivotData.domains.map(domain => (
                          <React.Fragment key={domain}>
                            <TableCell className="text-center">
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
                            <TableCell className="text-center">
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
            )}
          </CardContent>
        </Card>
      </div>

      <StaffDetailDrawer
        open={drawerState.open}
        onOpenChange={(open) => setDrawerState(prev => ({ ...prev, open }))}
        staffId={drawerState.staffId}
        staffName={drawerState.staffName}
        locationName={locationName}
        filters={filters}
      />
    </>
  );
}