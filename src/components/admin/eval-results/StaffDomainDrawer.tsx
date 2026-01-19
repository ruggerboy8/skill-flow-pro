import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { getDomainColor } from '@/lib/domainColors';
import type { EvalFilters } from '@/types/analytics';
import { periodToDateRange } from '@/types/analytics';

interface StaffDomainDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  staffId: string;
  staffName: string;
  domainId: number;
  domainName: string;
  filters: EvalFilters;
}

interface CompetencyData {
  competency_id: number;
  competency_name: string;
  framework: string | null;
  observer_avg: number | null;
  self_avg: number | null;
  n_items: number;
  last_eval_at: string | null;
}

export function StaffDomainDrawer({
  open,
  onOpenChange,
  staffId,
  staffName,
  domainId,
  domainName,
  filters
}: StaffDomainDrawerProps) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['staff-domain-competencies', staffId, domainId, filters],
    queryFn: async () => {
      if (!filters.organizationId || !staffId || !domainId) return [];

      const dateRange = periodToDateRange(filters.evaluationPeriod);
      const evalTypes = filters.evaluationPeriod.type === 'Baseline' 
        ? ['Baseline'] 
        : ['Quarterly'];

      const params = {
        p_org_id: filters.organizationId,
        p_staff_id: staffId,
        p_domain_id: domainId,
        p_start: dateRange.start.toISOString(),
        p_end: dateRange.end.toISOString(),
        ...(filters.locationIds?.length ? { p_location_ids: filters.locationIds } : {}),
        ...(filters.roleIds?.length ? { p_role_ids: filters.roleIds } : {}),
        p_eval_types: evalTypes,
      };

      const { data, error } = await supabase.rpc('get_staff_domain_competencies', params);
      if (error) throw error;
      return data as CompetencyData[];
    },
    enabled: open && !!filters.organizationId && !!staffId && !!domainId
  });

  const formatValue = (value: number | null) => {
    return value != null ? value.toFixed(1) : '—';
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[400px] sm:w-[540px]">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <span
              className="inline-block w-3 h-3 rounded-sm"
              style={{ backgroundColor: getDomainColor(domainName) }}
            />
            {domainName} - {staffName}
          </SheetTitle>
          <SheetDescription>
            Competency breakdown for this staff member in {domainName}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6">
          {isLoading && (
            <div className="space-y-4">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          )}

          {error && (
            <div className="text-center py-8">
              <p className="text-destructive">Error loading competency data</p>
            </div>
          )}

          {data && data.length === 0 && (
            <div className="text-center py-8">
              <p className="text-muted-foreground">No competency data found for this domain</p>
            </div>
          )}

          {data && data.length > 0 && (
            <div className="space-y-4">
              {data.map((competency) => (
                <div
                  key={competency.competency_id}
                  className="border-l-4 pl-4 py-3 rounded-r bg-muted/30"
                  style={{ borderColor: getDomainColor(domainName) }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">
                        {competency.competency_name}
                      </span>
                      {competency.framework && (
                        <Badge variant="outline" className="text-[10px] leading-4">
                          {competency.framework.toUpperCase()}
                        </Badge>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {competency.n_items} item{competency.n_items !== 1 ? 's' : ''}
                    </span>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">Observer</div>
                      <div className="font-medium">
                        {formatValue(competency.observer_avg)}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">Self</div>
                      <div className="font-medium">
                        {formatValue(competency.self_avg)}
                      </div>
                    </div>
                  </div>

                  {/* Optional: Add a simple comparison bar */}
                  {competency.observer_avg != null && competency.self_avg != null && (
                    <div className="mt-3">
                      <div className="flex items-center gap-2 text-xs">
                        <div className="flex-1 bg-blue-100 rounded-full h-2 relative">
                          <div
                            className="bg-blue-500 h-2 rounded-full"
                            style={{ width: `${(competency.observer_avg / 5) * 100}%` }}
                          />
                        </div>
                        <span className="w-8 text-blue-600 font-medium">Obs</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs mt-1">
                        <div className="flex-1 bg-green-100 rounded-full h-2 relative">
                          <div
                            className="bg-green-500 h-2 rounded-full"
                            style={{ width: `${(competency.self_avg / 5) * 100}%` }}
                          />
                        </div>
                        <span className="w-8 text-green-600 font-medium">Self</span>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
