import { useState, useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronRight, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { useEvalDeliveryProgress, type LocationProgress, type StaffDeliveryStatus } from '@/hooks/useEvalDeliveryProgress';
import { EvalPeriodSelector } from './EvalPeriodSelector';
import { BatchTranscriptProcessor } from './BatchTranscriptProcessor';
import { DeliveryStatusPill } from './DeliveryStatusPill';
import { bulkSetVisibilityByLocation, setEvaluationVisibility } from '@/lib/evaluations';
import type { EvaluationPeriod } from '@/lib/evalPeriods';
import { formatEvalPeriod } from '@/lib/evalPeriods';
import { useStaffProfile } from '@/hooks/useStaffProfile';

interface DeliveryTabProps {
  period: EvaluationPeriod;
  onPeriodChange: (period: EvaluationPeriod) => void;
}

export function DeliveryTab({ period, onPeriodChange }: DeliveryTabProps) {
  const queryClient = useQueryClient();
  const { locations, isLoading, refetch } = useEvalDeliveryProgress(period);
  const { data: staffProfile } = useStaffProfile({ redirectToSetup: false, showErrorToast: false });
  const [orgFilter, setOrgFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const organizations = useMemo(() => {
    const orgMap = new Map<string, string>();
    locations.forEach(loc => orgMap.set(loc.organizationId, loc.organizationName));
    return Array.from(orgMap.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [locations]);

  const filteredLocations = useMemo(() => {
    let result = locations;
    if (orgFilter !== 'all') {
      result = result.filter(loc => loc.organizationId === orgFilter);
    }
    if (statusFilter !== 'all') {
      result = result.filter(loc =>
        loc.staffDetails.some(s => s.status === statusFilter)
      );
    }
    return result;
  }, [locations, orgFilter, statusFilter]);

  const invalidateAll = () => {
    refetch();
    queryClient.invalidateQueries({ queryKey: ['eval-coverage-v2'] });
  };

  // Bulk release/hide for a location
  const bulkVisibilityMutation = useMutation({
    mutationFn: async ({ locationId, visible }: { locationId: string; visible: boolean }) => {
      return bulkSetVisibilityByLocation(locationId, period, visible, staffProfile?.id ?? '');
    },
    onSuccess: (result, variables) => {
      const action = variables.visible ? 'released' : 'hidden';
      toast.success(`${result.updatedCount} evaluation${result.updatedCount !== 1 ? 's' : ''} ${action}`);
      invalidateAll();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  // Single eval release/hide
  const singleVisibilityMutation = useMutation({
    mutationFn: async ({ evalId, visible }: { evalId: string; visible: boolean }) => {
      return setEvaluationVisibility(evalId, visible, staffProfile?.id ?? '');
    },
    onSuccess: (_, variables) => {
      toast.success(`Evaluation ${variables.visible ? 'released' : 'hidden'}`);
      invalidateAll();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const isPending = bulkVisibilityMutation.isPending || singleVisibilityMutation.isPending;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <BatchTranscriptProcessor />

      <div className="flex items-center gap-4 flex-wrap">
        <EvalPeriodSelector value={period} onChange={onPeriodChange} className="w-48" />
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

      {/* Status filter chips */}
      <div className="flex flex-wrap gap-2">
        {([
          { value: 'all', label: 'All' },
          { value: 'not_released', label: 'Not released' },
          { value: 'released', label: 'Released' },
          { value: 'viewed', label: 'Viewed' },
          { value: 'reviewed', label: 'Reviewed' },
          { value: 'focus_set', label: 'Focus set' },
        ] as { value: string; label: string }[]).map(chip => (
          <Button
            key={chip.value}
            variant={statusFilter === chip.value ? 'default' : 'outline'}
            size="sm"
            onClick={() => setStatusFilter(chip.value)}
            className="text-xs"
          >
            {chip.label}
          </Button>
        ))}
      </div>

      {/* Location list */}
      <div className="space-y-2">
        {filteredLocations.length === 0 ? (
          <p className="text-center py-8 text-muted-foreground">No locations found.</p>
        ) : (
          filteredLocations.map(loc => (
            <LocationCard
              key={loc.locationId}
              location={loc}
              statusFilter={statusFilter}
              isPending={isPending}
              onBulkRelease={(visible) =>
                bulkVisibilityMutation.mutate({ locationId: loc.locationId, visible })
              }
              onSingleRelease={(evalId, visible) =>
                singleVisibilityMutation.mutate({ evalId, visible })
              }
            />
          ))
        )}
      </div>

      {filteredLocations.length > 0 && !filteredLocations.some(l => l.submittedCount > 0 || l.draftCount > 0) && (
        <p className="text-sm text-muted-foreground text-center">
          No {formatEvalPeriod(period)} evaluations yet for the selected locations.
        </p>
      )}
    </div>
  );
}

/* ── Release status badge for a location ── */
function ReleaseStatusBadge({ loc }: { loc: LocationProgress }) {
  if (loc.submittedCount === 0) {
    return <Badge variant="outline" className="text-xs text-muted-foreground">No evals</Badge>;
  }
  if (loc.allVisible) {
    return <Badge className="text-xs bg-green-600">Released</Badge>;
  }
  if (loc.visibleCount > 0) {
    return <Badge className="text-xs bg-amber-500">Partial</Badge>;
  }
  return <Badge variant="outline" className="text-xs">Not released</Badge>;
}

/* ── Location card with collapsible staff list ── */
interface LocationCardProps {
  location: LocationProgress;
  statusFilter: string;
  isPending: boolean;
  onBulkRelease: (visible: boolean) => void;
  onSingleRelease: (evalId: string, visible: boolean) => void;
}

function LocationCard({ location, statusFilter, isPending, onBulkRelease, onSingleRelease }: LocationCardProps) {
  const [open, setOpen] = useState(false);
  const { locationName, organizationName, totalStaff, submittedCount, draftCount, allVisible, visibleCount, staffDetails } = location;

  const filteredStaff = statusFilter === 'all'
    ? staffDetails
    : staffDetails.filter(s => s.status === statusFilter);

  const hasUnreleased = submittedCount > visibleCount;
  const hasVisible = visibleCount > 0;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="border rounded-lg">
        <CollapsibleTrigger asChild>
          <button className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors text-left">
            <ChevronRight className={`w-4 h-4 shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-90' : ''}`} />
            <div className="flex-1 min-w-0">
              <span className="font-medium">{locationName}</span>
              <span className="text-muted-foreground text-sm ml-2">{organizationName}</span>
            </div>
            <span className="text-sm text-muted-foreground whitespace-nowrap">
              {submittedCount}/{totalStaff} submitted
              {draftCount > 0 && <span className="text-amber-600 ml-1">({draftCount} draft)</span>}
            </span>
            <ReleaseStatusBadge loc={location} />
            {/* Bulk actions */}
            <div className="flex gap-1 ml-2" onClick={e => e.stopPropagation()}>
              {hasUnreleased && (
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1" disabled={isPending} onClick={() => onBulkRelease(true)}>
                  <Eye className="w-3 h-3" /> Release All
                </Button>
              )}
              {hasVisible && (
                <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" disabled={isPending} onClick={() => onBulkRelease(false)}>
                  <EyeOff className="w-3 h-3" /> Hide All
                </Button>
              )}
            </div>
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="border-t px-4 py-2 space-y-1">
            {filteredStaff.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2 pl-7">No staff matching filter.</p>
            ) : (
              filteredStaff.map(s => (
                <StaffRow
                  key={s.staffId}
                  staff={s}
                  isPending={isPending}
                  onRelease={(visible) => s.evalId && onSingleRelease(s.evalId, visible)}
                />
              ))
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

/* ── Individual staff row ── */
interface StaffRowProps {
  staff: { staffId: string; staffName: string; evalId: string | null; status: StaffDeliveryStatus };
  isPending: boolean;
  onRelease: (visible: boolean) => void;
}

function StaffRow({ staff, isPending, onRelease }: StaffRowProps) {
  const showRelease = staff.status === 'not_released';
  const showHide = ['released', 'viewed', 'reviewed', 'focus_set'].includes(staff.status);

  return (
    <div className="flex items-center gap-3 py-1.5 pl-7">
      <span className="text-sm flex-1 min-w-0 truncate">{staff.staffName}</span>
      <DeliveryStatusPill status={staff.status} />
      {showRelease && (
        <Button size="sm" variant="outline" className="h-6 text-xs gap-1" disabled={isPending} onClick={() => onRelease(true)}>
          <Eye className="w-3 h-3" /> Release
        </Button>
      )}
      {showHide && (
        <Button size="sm" variant="ghost" className="h-6 text-xs gap-1 text-muted-foreground" disabled={isPending} onClick={() => onRelease(false)}>
          <EyeOff className="w-3 h-3" /> Hide
        </Button>
      )}
    </div>
  );
}
