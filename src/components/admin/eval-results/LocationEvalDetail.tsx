import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { ChevronLeft, Download, Send, Loader2, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { StaffDetailDrawer } from './StaffDetailDrawer';
import { pivotStaffDomain } from '@/lib/pivot';
import { downloadCSV, formatValueForCSV } from '@/lib/csvExport';
import { getDomainColor } from '@/lib/domainColors';
import { submitEvaluation, bulkSubmitCompleteDrafts } from '@/lib/evaluations';
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

interface StaffEvalStatus {
  staff_id: string;
  eval_id: string;
  status: 'draft' | 'submitted';
}

export function LocationEvalDetail({ filters, locationId, locationName, onBack }: LocationEvalDetailProps) {
  const queryClient = useQueryClient();
  const [drawerState, setDrawerState] = useState<{
    open: boolean;
    staffId: string;
    staffName: string;
  }>({
    open: false,
    staffId: '',
    staffName: '',
  });
  const [submittingEvalId, setSubmittingEvalId] = useState<string | null>(null);
  const [showDraftsOnly, setShowDraftsOnly] = useState(false);
  const [bulkSubmitting, setBulkSubmitting] = useState(false);

  const dateRange = periodToDateRange(filters.evaluationPeriod);
  const evalTypes = filters.evaluationPeriod.type === 'Baseline' ? ['Baseline'] : ['Quarterly'];

  // Fetch staff data for this location only
  const { data: rawData, isLoading, error } = useQuery({
    queryKey: ['location-staff-domain-averages', locationId, filters],
    queryFn: async () => {
      if (!filters.organizationId || !locationId) return [];

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

  // Fetch evaluation status for staff in this location
  const { data: evalStatuses } = useQuery({
    queryKey: ['location-eval-statuses', locationId, filters],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('evaluations')
        .select('id, staff_id, status')
        .eq('location_id', locationId)
        .in('type', evalTypes)
        .gte('created_at', dateRange.start.toISOString())
        .lte('created_at', dateRange.end.toISOString());

      if (error) throw error;

      // Map to staff_id -> status
      const statusMap = new Map<string, StaffEvalStatus>();
      (data || []).forEach(e => {
        statusMap.set(e.staff_id, {
          staff_id: e.staff_id,
          eval_id: e.id,
          status: e.status as 'draft' | 'submitted'
        });
      });
      return statusMap;
    },
    enabled: !!locationId
  });

  // Submit evaluation mutation
  const submitMutation = useMutation({
    mutationFn: async (evalId: string) => {
      await submitEvaluation(evalId);
    },
    onSuccess: () => {
      toast.success('Evaluation submitted successfully');
      queryClient.invalidateQueries({ queryKey: ['location-eval-statuses', locationId] });
      queryClient.invalidateQueries({ queryKey: ['location-staff-domain-averages', locationId] });
      queryClient.invalidateQueries({ queryKey: ['location-eval-cards'] });
      queryClient.invalidateQueries({ queryKey: ['eval-summary-metrics-v2'] });
    },
    onError: (error: Error) => {
      toast.error(`Failed to submit: ${error.message}`);
    },
    onSettled: () => {
      setSubmittingEvalId(null);
    }
  });

  // Bulk submit mutation
  const bulkSubmitMutation = useMutation({
    mutationFn: async () => {
      if (!evalStatuses) return { successCount: 0, failedCount: 0, errors: [] };
      
      // Get all draft eval IDs
      const draftEvalIds: string[] = [];
      evalStatuses.forEach(status => {
        if (status.status === 'draft') {
          draftEvalIds.push(status.eval_id);
        }
      });
      
      if (draftEvalIds.length === 0) {
        return { successCount: 0, failedCount: 0, errors: ['No drafts to submit'] };
      }
      
      return await bulkSubmitCompleteDrafts(draftEvalIds);
    },
    onSuccess: (results) => {
      if (results.successCount > 0) {
        toast.success(`Submitted ${results.successCount} evaluation(s)`);
      }
      if (results.failedCount > 0) {
        toast.warning(`${results.failedCount} evaluation(s) skipped (missing scores)`);
      }
      if (results.successCount === 0 && results.failedCount === 0) {
        toast.info('No drafts to submit');
      }
      queryClient.invalidateQueries({ queryKey: ['location-eval-statuses', locationId] });
      queryClient.invalidateQueries({ queryKey: ['location-staff-domain-averages', locationId] });
      queryClient.invalidateQueries({ queryKey: ['location-eval-cards'] });
      queryClient.invalidateQueries({ queryKey: ['eval-summary-metrics-v2'] });
    },
    onError: (error: Error) => {
      toast.error(`Bulk submit failed: ${error.message}`);
    },
    onSettled: () => {
      setBulkSubmitting(false);
    }
  });

  const handleBulkSubmit = () => {
    setBulkSubmitting(true);
    bulkSubmitMutation.mutate();
  };

  // Calculate counts for the header
  const staffCounts = React.useMemo(() => {
    if (!rawData || rawData.length === 0) return { total: 0, withEval: 0, drafts: 0, submitted: 0 };
    const uniqueStaff = new Set(rawData.map(r => r.staff_id));
    const staffWithEval = new Set(rawData.filter(r => r.has_eval).map(r => r.staff_id));
    
    let drafts = 0;
    let submitted = 0;
    if (evalStatuses) {
      evalStatuses.forEach(status => {
        if (status.status === 'draft') drafts++;
        else if (status.status === 'submitted') submitted++;
      });
    }
    
    return { 
      total: uniqueStaff.size, 
      withEval: staffWithEval.size,
      drafts,
      submitted
    };
  }, [rawData, evalStatuses]);

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

  // Filter rows based on showDraftsOnly
  const filteredRows = showDraftsOnly
    ? pivotData.rows.filter(row => evalStatuses?.get(row.staff_id)?.status === 'draft')
    : pivotData.rows;

  const handleRowClick = (staffId: string, staffName: string) => {
    setDrawerState({
      open: true,
      staffId,
      staffName,
    });
  };

  const handleSubmit = (e: React.MouseEvent, evalId: string) => {
    e.stopPropagation(); // Don't open drawer
    setSubmittingEvalId(evalId);
    submitMutation.mutate(evalId);
  };

  const formatValue = (value: number | null) => {
    return value != null ? value.toFixed(1) : '—';
  };

  const exportCSV = () => {
    if (!pivotData.rows.length) return;

    const csvData = pivotData.rows.map(row => {
      const csvRow: Record<string, any> = {
        'Staff': row.staff_name,
        'Status': evalStatuses?.get(row.staff_id)?.status || 'No eval',
      };
      
      pivotData.domains.forEach(domain => {
        csvRow[`${domain} (Obs)`] = formatValueForCSV(row.domains[domain]?.obs);
        csvRow[`${domain} (Self)`] = formatValueForCSV(row.domains[domain]?.self);
      });
      
      return csvRow;
    });

    downloadCSV(csvData, `${locationName.replace(/\s+/g, '_')}_eval_results`);
  };

  const getStatusBadge = (staffId: string) => {
    const evalStatus = evalStatuses?.get(staffId);
    if (!evalStatus) {
      return <Badge variant="secondary" className="text-xs">No eval</Badge>;
    }
    if (evalStatus.status === 'submitted') {
      return <Badge variant="default" className="text-xs bg-green-600">Submitted</Badge>;
    }
    return (
      <div className="flex items-center gap-2">
        <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">Draft</Badge>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 px-2 text-xs"
          onClick={(e) => handleSubmit(e, evalStatus.eval_id)}
          disabled={submittingEvalId === evalStatus.eval_id}
        >
          {submittingEvalId === evalStatus.eval_id ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <>
              <Send className="h-3 w-3 mr-1" />
              Submit
            </>
          )}
        </Button>
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Button 
          variant="default" 
          size="sm" 
          onClick={onBack} 
          className="mb-2 -ml-2 bg-primary text-primary-foreground hover:bg-primary/90"
        >
          <ChevronLeft className="h-4 w-4 mr-1" />
          Back to All Locations
        </Button>
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <Button 
          variant="default" 
          size="sm" 
          onClick={onBack} 
          className="mb-2 -ml-2 bg-primary text-primary-foreground hover:bg-primary/90"
        >
          <ChevronLeft className="h-4 w-4 mr-1" />
          Back to All Locations
        </Button>
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-destructive">Error loading data: {error.message}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-6">
        {/* Header with breadcrumb */}
        <div>
          <Button 
            variant="default" 
            size="sm" 
            onClick={onBack} 
            className="mb-2 -ml-2 bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Back to All Locations
          </Button>
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-2xl font-bold">{locationName}</h2>
            <Badge variant="outline">{getPeriodLabel(filters.evaluationPeriod)}</Badge>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">{staffCounts.submitted} submitted</span>
              {staffCounts.drafts > 0 && (
                <Badge 
                  variant="outline" 
                  className="text-amber-600 border-amber-300 cursor-pointer hover:bg-amber-50"
                  onClick={() => setShowDraftsOnly(prev => !prev)}
                >
                  {showDraftsOnly ? '✓ ' : ''}{staffCounts.drafts} drafts
                </Badge>
              )}
              <span className="text-muted-foreground">{staffCounts.total - staffCounts.withEval} pending</span>
            </div>
          </div>
        </div>

        {/* Staff table */}
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle>Staff Results</CardTitle>
              <div className="flex gap-2">
                {staffCounts.drafts > 0 && (
                  <Button 
                    variant="default" 
                    size="sm" 
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
                <Button variant="outline" size="sm" onClick={exportCSV}>
                  <Download className="mr-2 h-4 w-4" />
                  Export CSV
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {filteredRows.length === 0 ? (
              <div className="py-12 text-center">
                <p className="text-muted-foreground">
                  {showDraftsOnly ? 'No draft evaluations found.' : 'No staff data found for this location.'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="sticky top-0 bg-background z-10">
                    <TableRow>
                      <TableHead className="sticky left-0 bg-background z-20 min-w-[200px]">Staff</TableHead>
                      <TableHead className="min-w-[140px]">Status</TableHead>
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
                      <TableHead></TableHead>
                      {pivotData.domains.map(domain => (
                        <React.Fragment key={domain}>
                          <TableHead className="text-center text-xs">Obs</TableHead>
                          <TableHead className="text-center text-xs">Self</TableHead>
                        </React.Fragment>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRows.map((row) => (
                      <TableRow 
                        key={row.staff_id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => handleRowClick(row.staff_id, row.staff_name)}
                      >
                        <TableCell className="sticky left-0 bg-background z-10 min-w-[200px]">
                          <span className="font-medium">{row.staff_name}</span>
                        </TableCell>
                        <TableCell>
                          {getStatusBadge(row.staff_id)}
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