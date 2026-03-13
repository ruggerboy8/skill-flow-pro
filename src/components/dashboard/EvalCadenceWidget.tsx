import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { differenceInDays, parseISO, format } from 'date-fns';
import { cn } from '@/lib/utils';
import { ClipboardCheck } from 'lucide-react';

interface StaffEvalRecord {
  staffId: string;
  staffName: string;
  lastEvalDate: string | null;
  daysSince: number | null;
}

interface EvalCadenceWidgetProps {
  locationId: string;
}

function cadenceColor(daysSince: number | null): string {
  if (daysSince === null) return 'text-rose-700 dark:text-rose-400';
  if (daysSince > 90) return 'text-rose-700 dark:text-rose-400';
  if (daysSince > 60) return 'text-amber-700 dark:text-amber-400';
  return 'text-emerald-700 dark:text-emerald-400';
}

function cadenceBadge(daysSince: number | null): { label: string; className: string } {
  if (daysSince === null) return { label: 'No eval on record', className: 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-400' };
  if (daysSince > 90) return { label: `${daysSince}d ago`, className: 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-400' };
  if (daysSince > 60) return { label: `${daysSince}d ago`, className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400' };
  return { label: `${daysSince}d ago`, className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400' };
}

export function EvalCadenceWidget({ locationId }: EvalCadenceWidgetProps) {
  const [records, setRecords] = useState<StaffEvalRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!locationId) return;

    async function fetchCadence() {
      setLoading(true);
      setError(null);
      try {
        // Fetch active staff at this location
        const { data: staffData, error: staffErr } = await supabase
          .from('staff')
          .select('id, name')
          .eq('primary_location_id', locationId)
          .eq('is_participant', true)
          .eq('is_paused', false);

        if (staffErr) throw staffErr;
        const staffList = staffData || [];

        if (staffList.length === 0) {
          setRecords([]);
          return;
        }

        const staffIds = staffList.map(s => s.id);

        // Fetch latest submitted eval per staff
        const { data: evalData, error: evalErr } = await supabase
          .from('evaluations')
          .select('staff_id, observed_at')
          .in('staff_id', staffIds)
          .eq('status', 'submitted')
          .order('observed_at', { ascending: false });

        if (evalErr) throw evalErr;

        // Latest eval per staff
        const latestByStaff = new Map<string, string>();
        (evalData || []).forEach(ev => {
          if (!latestByStaff.has(ev.staff_id) && ev.observed_at) {
            latestByStaff.set(ev.staff_id, ev.observed_at);
          }
        });

        const now = new Date();
        const result: StaffEvalRecord[] = staffList.map(s => {
          const lastEvalDate = latestByStaff.get(s.id) ?? null;
          const daysSince = lastEvalDate
            ? differenceInDays(now, parseISO(lastEvalDate))
            : null;
          return {
            staffId: s.id,
            staffName: s.name,
            lastEvalDate,
            daysSince,
          };
        });

        // Sort: no eval → red → amber → green
        result.sort((a, b) => {
          const da = a.daysSince ?? 99999;
          const db = b.daysSince ?? 99999;
          return db - da;
        });

        setRecords(result);
      } catch (err: any) {
        setError(err.message || 'Failed to load eval cadence');
      } finally {
        setLoading(false);
      }
    }

    fetchCadence();
  }, [locationId]);

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <ClipboardCheck className="h-4 w-4" />
            Evaluation Cadence
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <ClipboardCheck className="h-4 w-4" />
            Evaluation Cadence
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-destructive">Error loading eval cadence</p>
        </CardContent>
      </Card>
    );
  }

  if (records.length === 0) {
    return null;
  }

  const overdueCount = records.filter(r => r.daysSince === null || r.daysSince > 90).length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <ClipboardCheck className="h-4 w-4" />
              Evaluation Cadence
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Process health — are evaluations happening on schedule?
            </p>
          </div>
          {overdueCount > 0 && (
            <Badge className="bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-400 shrink-0">
              {overdueCount} overdue
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="divide-y">
          {records.map(r => {
            const badge = cadenceBadge(r.daysSince);
            return (
              <div key={r.staffId} className="flex items-center justify-between py-2 gap-3">
                <span className="text-sm font-medium">{r.staffName}</span>
                <Badge variant="secondary" className={cn('text-xs shrink-0', badge.className)}>
                  {badge.label}
                </Badge>
              </div>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground mt-3">
          ≤60 days — good · 60–90 days — due soon · &gt;90 days — overdue
        </p>
      </CardContent>
    </Card>
  );
}
