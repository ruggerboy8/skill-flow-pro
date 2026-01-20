import { useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { 
  calcRate, 
  formatRate, 
  formatMean,
  getMismatchColor,
  type EvalDistributionRow,
  type StaffRowV2
} from '@/types/evalMetricsV2';
import type { EvalFilters } from '@/types/analytics';
import { cn } from '@/lib/utils';
import { DOMAIN_ORDER, getDomainOrderIndex } from '@/lib/domainUtils';

interface StaffResultsTableV2Props {
  data: EvalDistributionRow[];
  filters: EvalFilters;
  onRowClick?: (staffId: string, staffName: string, evaluationId: string | null) => void;
}

export function StaffResultsTableV2({ data, filters, onRowClick }: StaffResultsTableV2Props) {
  const [showDraftsOnly, setShowDraftsOnly] = useState(false);
  const queryClient = useQueryClient();

  // Aggregate by staff
  const staffRows = aggregateByStaff(data);
  
  // Get unique domains for columns - sorted by canonical order
  const domains = [...new Set(data.map(r => r.domain_name))]
    .sort((a, b) => getDomainOrderIndex(a) - getDomainOrderIndex(b));
  
  // Filter if needed
  const filteredRows = showDraftsOnly 
    ? staffRows.filter(s => s.evaluationStatus === 'draft')
    : staffRows;

  // Submit mutation
  const submitMutation = useMutation({
    mutationFn: async (evaluationId: string) => {
      const { error } = await supabase
        .from('evaluations')
        .update({ status: 'submitted', submitted_at: new Date().toISOString() })
        .eq('id', evaluationId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Evaluation submitted');
      // Invalidate all V2 eval queries
      queryClient.invalidateQueries({ queryKey: ['eval-distribution-metrics'] });
      queryClient.invalidateQueries({ queryKey: ['eval-distribution-metrics-locations'] });
      queryClient.invalidateQueries({ queryKey: ['eval-distribution-location-detail'] });
    },
    onError: (error) => {
      toast.error('Failed to submit evaluation');
      console.error(error);
    }
  });

  const draftCount = staffRows.filter(s => s.evaluationStatus === 'draft').length;

  if (staffRows.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No staff data available
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      {draftCount > 0 && (
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Switch 
              id="drafts-only" 
              checked={showDraftsOnly} 
              onCheckedChange={setShowDraftsOnly}
            />
            <Label htmlFor="drafts-only" className="text-sm">
              Drafts only ({draftCount})
            </Label>
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Staff</TableHead>
              <TableHead>Role</TableHead>
              <TableHead className="text-center">Status</TableHead>
              <TableHead className="text-center">% Misaligned</TableHead>
              {domains.map(domain => (
                <TableHead key={domain} className="text-center text-xs">
                  <div>{domain}</div>
                  <div className="text-[10px] text-muted-foreground font-normal">Obs / Self</div>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredRows.map((staff) => (
              <TableRow 
                key={staff.staffId}
                className={cn(onRowClick && "cursor-pointer hover:bg-muted/50")}
                onClick={() => onRowClick?.(staff.staffId, staff.staffName, staff.evaluationId)}
              >
                <TableCell className="font-medium">{staff.staffName}</TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {staff.roleName}
                </TableCell>
                <TableCell className="text-center">
                  {getStatusBadge(staff, (e) => {
                    e.stopPropagation();
                    submitMutation.mutate(staff.evaluationId!);
                  }, submitMutation.isPending)}
                </TableCell>
                <TableCell className={cn("text-center font-medium", getMismatchColor(staff.totalMismatchRate))}>
                  {formatRate(staff.totalMismatchRate)}
                </TableCell>
                {domains.map(domain => {
                  const domainData = staff.domains[domain];
                  if (!domainData) {
                    return <TableCell key={domain} className="text-center text-muted-foreground">—</TableCell>;
                  }
                  return (
                    <TableCell key={domain} className="text-center text-sm">
                      <div className="text-muted-foreground">
                        {formatMean(domainData.obsMean)} / {formatMean(domainData.selfMean)}
                      </div>
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function getStatusBadge(staff: StaffRowV2, onSubmit: (e: React.MouseEvent) => void, isPending: boolean) {
  if (!staff.evaluationId) {
    return <Badge variant="outline" className="text-muted-foreground">No eval</Badge>;
  }
  
  if (staff.evaluationStatus === 'submitted') {
    return <Badge variant="secondary">Submitted</Badge>;
  }
  
  if (staff.evaluationStatus === 'draft') {
    return (
      <div className="flex items-center gap-2 justify-center">
        <Badge variant="outline" className="border-amber-300 text-amber-600">Draft</Badge>
        <Button 
          size="sm" 
          variant="ghost" 
          className="h-6 text-xs" 
          onClick={onSubmit}
          disabled={isPending}
        >
          {isPending ? 'Submitting...' : 'Submit'}
        </Button>
      </div>
    );
  }
  
  return <Badge variant="outline">Unknown</Badge>;
}

function aggregateByStaff(rows: EvalDistributionRow[]): StaffRowV2[] {
  const staffMap = new Map<string, {
    staffName: string;
    roleId: number;
    roleName: string;
    evaluationId: string | null;
    evaluationStatus: string | null;
    domains: Record<string, {
      obsTopBox: number;
      obsBottomBox: number;
      selfTopBox: number;
      selfBottomBox: number;
      mismatchCount: number;
      obsMean: number | null;
      selfMean: number | null;
      nItems: number;
    }>;
    totalMismatch: number;
    totalN: number;
    obsSum: number;
    obsCount: number;
  }>();

  for (const row of rows) {
    if (!staffMap.has(row.staff_id)) {
      staffMap.set(row.staff_id, {
        staffName: row.staff_name,
        roleId: row.role_id,
        roleName: row.role_name,
        evaluationId: row.evaluation_id,
        evaluationStatus: row.evaluation_status,
        domains: {},
        totalMismatch: 0,
        totalN: 0,
        obsSum: 0,
        obsCount: 0
      });
    }

    const staff = staffMap.get(row.staff_id)!;
    
    // Add domain data
    staff.domains[row.domain_name] = {
      obsTopBox: row.obs_top_box,
      obsBottomBox: row.obs_bottom_box,
      selfTopBox: row.self_top_box,
      selfBottomBox: row.self_bottom_box,
      mismatchCount: row.mismatch_count,
      obsMean: row.obs_mean,
      selfMean: row.self_mean,
      nItems: row.n_items
    };
    
    staff.totalMismatch += row.mismatch_count;
    staff.totalN += row.n_items;
    
    if (row.obs_mean !== null) {
      staff.obsSum += row.obs_mean * row.n_items;
      staff.obsCount += row.n_items;
    }
  }

  const result: StaffRowV2[] = [];
  
  for (const [staffId, s] of staffMap) {
    result.push({
      staffId,
      staffName: s.staffName,
      roleId: s.roleId,
      roleName: s.roleName,
      evaluationId: s.evaluationId,
      evaluationStatus: s.evaluationStatus,
      domains: s.domains,
      totalMismatchRate: calcRate(s.totalMismatch, s.totalN),
      totalObsMean: s.obsCount > 0 ? s.obsSum / s.obsCount : null
    });
  }

  // Sort by name
  result.sort((a, b) => a.staffName.localeCompare(b.staffName));
  
  return result;
}
