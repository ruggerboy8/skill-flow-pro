import { useState, useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MoreHorizontal, Eye, EyeOff, Send, Check } from 'lucide-react';
import { toast } from 'sonner';
import { useEvalDeliveryProgress, type LocationProgress } from '@/hooks/useEvalDeliveryProgress';
import { EvalPeriodSelector } from './EvalPeriodSelector';
import { BatchTranscriptProcessor } from './BatchTranscriptProcessor';
import { bulkSetVisibilityByLocation, bulkSubmitCompleteDrafts } from '@/lib/evaluations';
import { supabase } from '@/integrations/supabase/client';
import type { EvaluationPeriod } from '@/lib/evalPeriods';
import { formatEvalPeriod } from '@/lib/evalPeriods';

interface DeliveryTabProps {
  period: EvaluationPeriod;
  onPeriodChange: (period: EvaluationPeriod) => void;
}

export function DeliveryTab({ period, onPeriodChange }: DeliveryTabProps) {
  const queryClient = useQueryClient();
  const { locations, isLoading, refetch } = useEvalDeliveryProgress(period);
  const [orgFilter, setOrgFilter] = useState<string>('all');

  // Get unique organizations for the filter dropdown
  const organizations = useMemo(() => {
    const orgMap = new Map<string, string>();
    locations.forEach(loc => {
      orgMap.set(loc.organizationId, loc.organizationName);
    });
    return Array.from(orgMap.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [locations]);

  // Filter locations by selected organization
  const filteredLocations = useMemo(() => {
    if (orgFilter === 'all') return locations;
    return locations.filter(loc => loc.organizationId === orgFilter);
  }, [locations, orgFilter]);

  // Mutation for setting visibility
  const visibilityMutation = useMutation({
    mutationFn: async ({ locationId, visible }: { locationId: string; visible: boolean }) => {
      return bulkSetVisibilityByLocation(locationId, period, visible);
    },
    onSuccess: (result, variables) => {
      const action = variables.visible ? 'visible' : 'hidden';
      toast.success(`${result.updatedCount} evaluation${result.updatedCount !== 1 ? 's' : ''} now ${action}`);
      refetch();
      queryClient.invalidateQueries({ queryKey: ['eval-coverage-v2'] });
    },
    onError: (error: Error) => {
      toast.error(`Failed to update visibility: ${error.message}`);
    }
  });

  // Mutation for bulk submitting drafts
  const submitDraftsMutation = useMutation({
    mutationFn: async (locationId: string) => {
      // Get draft eval IDs for this location/period
      let query = supabase
        .from('evaluations')
        .select('id')
        .eq('location_id', locationId)
        .eq('status', 'draft')
        .eq('program_year', period.year);

      if (period.type === 'Quarterly' && period.quarter) {
        query = query.eq('quarter', period.quarter).eq('type', 'Quarterly');
      } else {
        query = query.eq('type', 'Baseline');
      }

      const { data: drafts } = await query;
      if (!drafts || drafts.length === 0) {
        return { successCount: 0, failedCount: 0, errors: [] };
      }

      return bulkSubmitCompleteDrafts(drafts.map(d => d.id));
    },
    onSuccess: (result) => {
      if (result.successCount > 0) {
        toast.success(`Submitted ${result.successCount} evaluation${result.successCount > 1 ? 's' : ''}`);
      }
      if (result.failedCount > 0) {
        toast.warning(`${result.failedCount} draft${result.failedCount > 1 ? 's' : ''} skipped (incomplete)`);
      }
      refetch();
      queryClient.invalidateQueries({ queryKey: ['eval-coverage-v2'] });
    },
    onError: (error: Error) => {
      toast.error(`Failed to submit drafts: ${error.message}`);
    }
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const hasAnyData = filteredLocations.some(loc => loc.draftCount > 0 || loc.submittedCount > 0);

  return (
    <div className="space-y-4">
      <BatchTranscriptProcessor />
      
      <div className="flex items-center gap-4">
        <EvalPeriodSelector
          value={period}
          onChange={onPeriodChange}
          className="w-48"
        />
        <Select value={orgFilter} onValueChange={setOrgFilter}>
          <SelectTrigger className="w-56">
            <SelectValue placeholder="Filter by organization" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Organizations</SelectItem>
            {organizations.map(([id, name]) => (
              <SelectItem key={id} value={id}>{name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Location</TableHead>
              <TableHead>Organization</TableHead>
              <TableHead className="text-center">Staff</TableHead>
              <TableHead className="text-center">Drafts</TableHead>
              <TableHead className="text-center">Submitted</TableHead>
              <TableHead className="text-center">Coverage</TableHead>
              <TableHead className="text-center">Visible</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredLocations.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                  No locations found.
                </TableCell>
              </TableRow>
            ) : (
              filteredLocations.map(loc => (
                <LocationRow
                  key={loc.locationId}
                  location={loc}
                  onToggleVisibility={(visible) => 
                    visibilityMutation.mutate({ locationId: loc.locationId, visible })
                  }
                  onSubmitDrafts={() => submitDraftsMutation.mutate(loc.locationId)}
                  isUpdating={
                    visibilityMutation.isPending || submitDraftsMutation.isPending
                  }
                />
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {!hasAnyData && filteredLocations.length > 0 && (
        <p className="text-sm text-muted-foreground text-center">
          No {formatEvalPeriod(period)} evaluations yet for the selected locations.
        </p>
      )}
    </div>
  );
}

interface LocationRowProps {
  location: LocationProgress;
  onToggleVisibility: (visible: boolean) => void;
  onSubmitDrafts: () => void;
  isUpdating: boolean;
}

function LocationRow({ location, onToggleVisibility, onSubmitDrafts, isUpdating }: LocationRowProps) {
  const { locationName, organizationName, totalStaff, draftCount, submittedCount, coveragePercent, allVisible, visibleCount } = location;

  return (
    <TableRow>
      <TableCell className="font-medium">{locationName}</TableCell>
      <TableCell className="text-muted-foreground">{organizationName}</TableCell>
      <TableCell className="text-center">{totalStaff}</TableCell>
      <TableCell className="text-center">
        {draftCount > 0 ? (
          <Badge variant="outline" className="border-amber-300 text-amber-600">
            {draftCount}
          </Badge>
        ) : (
          <span className="text-muted-foreground">0</span>
        )}
      </TableCell>
      <TableCell className="text-center">
        {submittedCount > 0 ? (
          <span className="font-medium">{submittedCount}</span>
        ) : (
          <span className="text-muted-foreground">0</span>
        )}
      </TableCell>
      <TableCell className="text-center">
        <Badge 
          variant={coveragePercent >= 80 ? 'default' : coveragePercent >= 50 ? 'secondary' : 'outline'}
        >
          {coveragePercent}%
        </Badge>
      </TableCell>
      <TableCell className="text-center">
        {submittedCount === 0 ? (
          <span className="text-muted-foreground">—</span>
        ) : allVisible ? (
          <Badge variant="default" className="bg-green-100 text-green-800 border-green-200">
            <Check className="w-3 h-3 mr-1" />
            Yes
          </Badge>
        ) : (
          <Badge variant="outline" className="text-muted-foreground">
            {visibleCount}/{submittedCount}
          </Badge>
        )}
      </TableCell>
      <TableCell>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" disabled={isUpdating}>
              <MoreHorizontal className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {!allVisible && submittedCount > 0 && (
              <DropdownMenuItem onClick={() => onToggleVisibility(true)}>
                <Eye className="w-4 h-4 mr-2" />
                Make Visible
              </DropdownMenuItem>
            )}
            {visibleCount > 0 && (
              <DropdownMenuItem onClick={() => onToggleVisibility(false)}>
                <EyeOff className="w-4 h-4 mr-2" />
                Hide Results
              </DropdownMenuItem>
            )}
            {draftCount > 0 && (
              <DropdownMenuItem onClick={onSubmitDrafts}>
                <Send className="w-4 h-4 mr-2" />
                Submit Complete Drafts
              </DropdownMenuItem>
            )}
            {submittedCount === 0 && draftCount === 0 && (
              <DropdownMenuItem disabled>
                No actions available
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
}
