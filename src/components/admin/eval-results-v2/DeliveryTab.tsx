import { useState, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronRight, Eye, EyeOff, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useEvalDeliveryProgress, type LocationProgress, type StaffDeliveryStatus } from '@/hooks/useEvalDeliveryProgress';
import { EvalPeriodSelector } from './EvalPeriodSelector';
import { BatchTranscriptProcessor } from './BatchTranscriptProcessor';
import { DeliveryStatusPill } from './DeliveryStatusPill';
import { bulkSetVisibilityByLocation, setEvaluationVisibility } from '@/lib/evaluations';
import type { EvaluationPeriod } from '@/lib/evalPeriods';
import { formatEvalPeriod } from '@/lib/evalPeriods';
import { useStaffProfile } from '@/hooks/useStaffProfile';

const STATUS_SORT_ORDER: Record<StaffDeliveryStatus, number> = {
  not_released: 0,
  released: 1,
  viewed: 2,
  reviewed: 3,
  focus_set: 4,
  draft: 5,
  no_eval: 6,
};

function sortStaff(staff: LocationProgress['staffDetails']) {
  return [...staff].sort((a, b) => {
    const orderDiff = STATUS_SORT_ORDER[a.status] - STATUS_SORT_ORDER[b.status];
    if (orderDiff !== 0) return orderDiff;
    return a.staffName.localeCompare(b.staffName);
  });
}

interface DeliveryTabProps {
  period: EvaluationPeriod;
  onPeriodChange: (period: EvaluationPeriod) => void;
}

export function DeliveryTab({ period, onPeriodChange }: DeliveryTabProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { locations, isLoading, refetch } = useEvalDeliveryProgress(period);
  const { data: staffProfile } = useStaffProfile({ redirectToSetup: false, showErrorToast: false });
  
  const orgFilter = searchParams.get('org') || 'all';
  const statusFilter = searchParams.get('status') || 'all';

  const updateParam = useCallback((key: string, value: string) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (value === 'all') {
        next.delete(key);
      } else {
        next.set(key, value);
      }
      // Preserve tab param
      if (!next.has('tab')) next.set('tab', 'delivery');
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const setOrgFilter = (v: string) => updateParam('org', v);
  const setStatusFilter = (v: string) => updateParam('status', v);

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

      {/* Delivery summary strip */}
      <DeliverySummary locations={filteredLocations} />

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

/* ── Delivery Summary Strip ── */
function DeliverySummary({ locations }: { locations: LocationProgress[] }) {
  const counts = useMemo(() => {
    const c = { not_released: 0, released: 0, viewed: 0, reviewed: 0, focus_set: 0, draft: 0, no_eval: 0 };
    locations.forEach(loc => loc.staffDetails.forEach(s => { c[s.status]++; }));
    return c;
  }, [locations]);

  const total = counts.not_released + counts.released + counts.viewed + counts.reviewed + counts.focus_set;
  if (total === 0 && counts.draft === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground py-2 px-1">
      <span className="font-medium text-foreground">Delivery Summary</span>
      <span>Not released: <strong className="text-foreground">{counts.not_released}</strong></span>
      <span>Released: <strong className="text-foreground">{counts.released}</strong></span>
      <span>Viewed: <strong className="text-foreground">{counts.viewed}</strong></span>
      <span>Reviewed: <strong className="text-foreground">{counts.reviewed}</strong></span>
      <span>Focus: <strong className="text-foreground">{counts.focus_set}</strong></span>
      {counts.draft > 0 && <span>Draft: <strong className="text-foreground">{counts.draft}</strong></span>}
    </div>
  );
}

/* ── Progress chip for location row ── */
function ProgressChip({ label, count, total }: { label: string; count: number; total?: number }) {
  return (
    <Badge variant="outline" className="text-xs font-normal gap-1 shrink-0">
      {label} <strong>{total !== undefined ? `${count}/${total}` : count}</strong>
    </Badge>
  );
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
  const { locationName, organizationName, totalStaff, submittedCount, draftCount, visibleCount, staffDetails } = location;

  const filteredStaff = useMemo(() => {
    const base = statusFilter === 'all' ? staffDetails : staffDetails.filter(s => s.status === statusFilter);
    return sortStaff(base);
  }, [staffDetails, statusFilter]);

  const hasUnreleased = submittedCount > visibleCount;
  const hasVisible = visibleCount > 0;

  // Compute per-status counts for progress chips
  const statusCounts = useMemo(() => {
    const c = { released: 0, viewed: 0, reviewed: 0, focus_set: 0 };
    staffDetails.forEach(s => {
      if (s.status in c) c[s.status as keyof typeof c]++;
    });
    return c;
  }, [staffDetails]);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="border rounded-lg">
        <CollapsibleTrigger asChild>
          <button className="w-full grid grid-cols-[minmax(280px,1fr)_minmax(380px,620px)_auto] items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors text-left">
            {/* Left cluster */}
            <div className="flex items-center gap-2 min-w-0">
              <ChevronRight className={`w-4 h-4 shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-90' : ''}`} />
              <span className="font-medium truncate">{locationName}</span>
              <span className="text-muted-foreground text-sm truncate">{organizationName}</span>
            </div>

            {/* Middle cluster: progress chips */}
            <div className="flex items-center justify-end gap-1.5 flex-wrap">
              <ProgressChip label="Submitted" count={submittedCount} total={totalStaff} />
              {draftCount > 0 && <ProgressChip label="Draft" count={draftCount} />}
              {statusCounts.released > 0 && <ProgressChip label="Released" count={statusCounts.released} />}
              {statusCounts.viewed > 0 && <ProgressChip label="Viewed" count={statusCounts.viewed} />}
              {statusCounts.reviewed > 0 && <ProgressChip label="Reviewed" count={statusCounts.reviewed} />}
              {statusCounts.focus_set > 0 && <ProgressChip label="Focus" count={statusCounts.focus_set} />}
            </div>

            {/* Right cluster: Release All */}
            <div className="flex justify-end gap-1 shrink-0" onClick={e => e.stopPropagation()}>
              {hasUnreleased && (
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1" disabled={isPending} onClick={() => onBulkRelease(true)}>
                  <Eye className="w-3 h-3" /> Release All
                </Button>
              )}
            </div>
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="border-t py-2 space-y-0">
            {/* Hide All button inside expanded area */}
            {hasVisible && (
              <div className="flex justify-end px-4 pb-1">
                <Button size="sm" variant="ghost" className="h-7 text-xs gap-1 text-muted-foreground" disabled={isPending} onClick={() => onBulkRelease(false)}>
                  <EyeOff className="w-3 h-3" /> Hide All
                </Button>
              </div>
            )}

            {/* Filter annotation */}
            {statusFilter !== 'all' && (
              <p className="text-xs text-muted-foreground pl-10 px-4 pb-1">
                Showing {filteredStaff.length} of {staffDetails.length} staff ({statusFilter.replace('_', ' ')})
              </p>
            )}

            {filteredStaff.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2 px-4 pl-10">No staff matching filter.</p>
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
  staff: { staffId: string; staffName: string; roleName: string | null; evalId: string | null; status: StaffDeliveryStatus };
  isPending: boolean;
  onRelease: (visible: boolean) => void;
}

function StaffRow({ staff, isPending, onRelease }: StaffRowProps) {
  const navigate = useNavigate();
  const showRelease = staff.status === 'not_released';
  const showHide = ['released', 'viewed', 'reviewed', 'focus_set'].includes(staff.status);
  const hasEval = !!staff.evalId && staff.status !== 'no_eval';

  const handleNameClick = () => {
    if (hasEval && staff.evalId) {
      const returnTo = encodeURIComponent(window.location.pathname + window.location.search);
      navigate(`/evaluation/${staff.evalId}?returnTo=${returnTo}`);
    }
  };

  return (
    <div className="grid grid-cols-[minmax(280px,1fr)_160px_120px] items-center gap-3 pl-10 py-1.5 px-4">
      {/* Left: name + role */}
      <div className="flex items-center gap-2 min-w-0">
        {hasEval ? (
          <button
            onClick={handleNameClick}
            className="text-sm truncate text-primary hover:underline text-left"
          >
            {staff.staffName}
          </button>
        ) : (
          <span className="text-sm truncate">{staff.staffName}</span>
        )}
        {staff.roleName && <span className="text-xs text-muted-foreground shrink-0">{staff.roleName}</span>}
      </div>

      {/* Middle: status pill */}
      <div className="flex justify-center">
        <DeliveryStatusPill status={staff.status} />
      </div>

      {/* Right: action */}
      <div className="flex justify-end">
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
    </div>
  );
}
