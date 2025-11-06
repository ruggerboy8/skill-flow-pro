import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react';
import { format, startOfMonth, endOfMonth, eachWeekOfInterval, startOfWeek, addMonths, subMonths } from 'date-fns';

interface PlanHistoryProps {
  roleId: number;
}

interface WeekSummary {
  weekStart: string;
  count: number;
  status: 'locked' | 'proposed' | 'incomplete' | 'empty';
  rows: any[];
}

export function PlanHistory({ roleId }: PlanHistoryProps) {
  const [loading, setLoading] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [weeks, setWeeks] = useState<WeekSummary[]>([]);
  const [selectedWeek, setSelectedWeek] = useState<WeekSummary | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    loadHistoryForMonth();
  }, [roleId, currentMonth]);

  const loadHistoryForMonth = async () => {
    setLoading(true);
    try {
      const monthStart = startOfMonth(currentMonth);
      const monthEnd = endOfMonth(currentMonth);
      
      // Get all Mondays in this month (and a bit before/after)
      const allWeeks = eachWeekOfInterval(
        { start: subMonths(monthStart, 1), end: addMonths(monthEnd, 1) },
        { weekStartsOn: 1 }
      ).filter(week => week >= subMonths(monthStart, 1) && week <= addMonths(monthEnd, 1));

      const weekSummaries: WeekSummary[] = [];

      for (const monday of allWeeks) {
        const weekStartStr = format(monday, 'yyyy-MM-dd');

        const { data: planData, count } = await supabase
          .from('weekly_plan')
          .select(`
            *,
            pro_moves!inner(action_statement, competencies!inner(domains!inner(domain_name)))
          `, { count: 'exact' })
          .is('org_id', null)
          .eq('role_id', roleId)
          .eq('week_start_date', weekStartStr)
          .order('display_order');

        let status: 'locked' | 'proposed' | 'incomplete' | 'empty' = 'empty';
        if (count === 3) {
          const firstStatus = planData?.[0]?.status;
          status = (firstStatus === 'locked' || firstStatus === 'proposed') ? firstStatus : 'empty';
        } else if (count && count > 0) {
          status = 'incomplete';
        }

        weekSummaries.push({
          weekStart: weekStartStr,
          count: count || 0,
          status,
          rows: planData || []
        });
      }

      setWeeks(weekSummaries);
    } catch (error: any) {
      console.error('[PlanHistory] Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleWeekClick = (week: WeekSummary) => {
    setSelectedWeek(week);
    setDrawerOpen(true);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'locked':
        return 'default';
      case 'proposed':
        return 'secondary';
      case 'incomplete':
        return 'outline';
      case 'empty':
        return 'outline';
      default:
        return 'outline';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'locked':
        return '🔒';
      case 'proposed':
        return '📝';
      case 'incomplete':
        return '⚠️';
      case 'empty':
        return '⬜';
      default:
        return '❓';
    }
  };

  if (loading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Month Navigator */}
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4" />
          <span className="font-medium">{format(currentMonth, 'MMMM yyyy')}</span>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Week Grid */}
      <div className="grid gap-2">
        {weeks.map((week) => (
          <Card
            key={week.weekStart}
            className="cursor-pointer hover:bg-accent transition-colors"
            onClick={() => handleWeekClick(week)}
          >
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{getStatusIcon(week.status)}</span>
                  <div>
                    <div className="font-medium">Week of {format(new Date(week.weekStart), 'MMM d, yyyy')}</div>
                    <div className="text-sm text-muted-foreground">{week.count}/3 moves</div>
                  </div>
                </div>
                <Badge variant={getStatusColor(week.status)}>
                  {week.status.toUpperCase()}
                </Badge>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Week Detail Drawer */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Week of {selectedWeek && format(new Date(selectedWeek.weekStart), 'MMMM d, yyyy')}</SheetTitle>
            <SheetDescription>
              {selectedWeek && (
                <>
                  Status: <Badge variant={getStatusColor(selectedWeek.status)}>{selectedWeek.status}</Badge>
                  <span className="ml-2">• {selectedWeek.count}/3 moves</span>
                </>
              )}
            </SheetDescription>
          </SheetHeader>
          <div className="mt-6 space-y-4">
            {selectedWeek?.rows.map((row: any, idx: number) => (
              <Card key={idx}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="font-mono text-sm text-muted-foreground">{row.display_order}</div>
                    <div className="flex-1">
                      <div className="font-medium">{row.pro_moves?.action_statement}</div>
                      <div className="flex gap-2 mt-2">
                        <Badge variant="outline">{row.pro_moves?.competencies?.domains?.domain_name}</Badge>
                        <Badge variant={row.generated_by === 'auto' ? 'default' : 'secondary'} className="text-xs">
                          {row.generated_by}
                        </Badge>
                        {row.overridden && <Badge variant="outline" className="text-xs">Overridden</Badge>}
                      </div>
                      {row.rank_version && (
                        <div className="text-xs text-muted-foreground mt-1">{row.rank_version}</div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
            {selectedWeek && selectedWeek.count === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                No plan data for this week
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
