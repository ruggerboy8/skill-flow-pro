import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { supabase } from '@/integrations/supabase/client';
import { ChevronLeft, ChevronRight, History, Bot, Edit } from 'lucide-react';
import { formatWeekOf } from '@/lib/plannerUtils';

interface HistoryPanelProps {
  roleId: number;
  roleName: string;
}

interface WeekRecord {
  week_start_date: string;
  status: string;
  display_order: number;
  action_id: number;
  generated_by: string | null;
  overridden: boolean | null;
  rank_version: string | null;
  pro_move_name: string;
  domain_name: string;
}

interface GroupedWeek {
  weekStart: string;
  status: string;
  generatedBy: string | null;
  rankVersion: string | null;
  moves: Array<{ name: string; domain: string; displayOrder: number }>;
}

export function HistoryPanel({ roleId, roleName }: HistoryPanelProps) {
  const [loading, setLoading] = useState(false);
  const [monthOffset, setMonthOffset] = useState(0);
  const [weeks, setWeeks] = useState<GroupedWeek[]>([]);
  const [selectedWeek, setSelectedWeek] = useState<GroupedWeek | null>(null);

  useEffect(() => {
    loadHistory();
  }, [roleId, monthOffset]);

  const loadHistory = async () => {
    setLoading(true);
    try {
      const now = new Date();
      const targetMonth = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
      const startOfWindow = new Date(targetMonth);
      startOfWindow.setDate(startOfWindow.getDate() - 84); // 12 weeks before
      const endOfMonth = new Date(targetMonth.getFullYear(), targetMonth.getMonth() + 1, 0);

      const { data, error } = await supabase
        .from('weekly_plan')
        .select(`
          week_start_date,
          status,
          display_order,
          action_id,
          generated_by,
          overridden,
          rank_version,
          pro_moves!inner(name, domains!inner(name))
        `)
        .is('org_id', null)
        .eq('role_id', roleId)
        .gte('week_start_date', startOfWindow.toISOString().split('T')[0])
        .lte('week_start_date', endOfMonth.toISOString().split('T')[0])
        .order('week_start_date', { ascending: false })
        .order('display_order', { ascending: true });

      if (error) throw error;

      // Group by week
      const grouped: Record<string, GroupedWeek> = {};
      (data || []).forEach((row: any) => {
        const weekStart = row.week_start_date;
        if (!grouped[weekStart]) {
          grouped[weekStart] = {
            weekStart,
            status: row.status,
            generatedBy: row.generated_by,
            rankVersion: row.rank_version,
            moves: [],
          };
        }
        grouped[weekStart].moves.push({
          name: row.pro_moves.name,
          domain: row.pro_moves.domains.name,
          displayOrder: row.display_order,
        });
      });

      setWeeks(Object.values(grouped));
    } catch (error) {
      console.error('Error loading history:', error);
    } finally {
      setLoading(false);
    }
  };

  const getMonthLabel = () => {
    const now = new Date();
    const targetMonth = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
    return targetMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <History className="h-5 w-5 text-muted-foreground" />
              Assignment History - {roleName}
            </CardTitle>
            <CardDescription>Past global pro-move assignments</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setMonthOffset(monthOffset - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-medium min-w-[120px] text-center">
              {getMonthLabel()}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setMonthOffset(monthOffset + 1)}
              disabled={monthOffset >= 0}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-center py-8 text-muted-foreground">Loading...</div>
        ) : weeks.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No assignments found for this period
          </div>
        ) : (
          <div className="space-y-2">
            {weeks.map((week) => (
              <div
                key={week.weekStart}
                className="p-3 border rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                onClick={() => setSelectedWeek(week)}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-2 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">Week of {formatWeekOf(week.weekStart)}</span>
                      <Badge variant={week.status === 'locked' ? 'default' : 'secondary'}>
                        {week.status}
                      </Badge>
                      {week.generatedBy && (
                        <Badge variant="outline" className="gap-1">
                          {week.generatedBy === 'auto' ? (
                            <>
                              <Bot className="h-3 w-3" />
                              Auto
                            </>
                          ) : (
                            <>
                              <Edit className="h-3 w-3" />
                              Manual
                            </>
                          )}
                        </Badge>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {week.moves.slice(0, 3).map((move, idx) => (
                        <Badge key={idx} variant="outline" className="text-xs">
                          {move.domain}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <Sheet open={!!selectedWeek} onOpenChange={() => setSelectedWeek(null)}>
          <SheetContent>
            <SheetHeader>
              <SheetTitle>
                {selectedWeek && `Week of ${formatWeekOf(selectedWeek.weekStart)}`}
              </SheetTitle>
              <SheetDescription>Assignment details</SheetDescription>
            </SheetHeader>
            {selectedWeek && (
              <div className="mt-6 space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Badge variant={selectedWeek.status === 'locked' ? 'default' : 'secondary'}>
                      {selectedWeek.status}
                    </Badge>
                    {selectedWeek.generatedBy && (
                      <Badge variant="outline" className="gap-1">
                        {selectedWeek.generatedBy === 'auto' ? (
                          <>
                            <Bot className="h-3 w-3" />
                            Auto
                          </>
                        ) : (
                          <>
                            <Edit className="h-3 w-3" />
                            Manual
                          </>
                        )}
                      </Badge>
                    )}
                  </div>
                  {selectedWeek.rankVersion && (
                    <p className="text-sm text-muted-foreground">
                      Rank version: {selectedWeek.rankVersion}
                    </p>
                  )}
                </div>

                <div className="space-y-3">
                  <h4 className="font-semibold">Pro-Moves</h4>
                  {selectedWeek.moves.map((move, idx) => (
                    <div key={idx} className="p-3 border rounded-lg">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="secondary">#{move.displayOrder}</Badge>
                        <Badge variant="outline">{move.domain}</Badge>
                      </div>
                      <p className="text-sm">{move.name}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </SheetContent>
        </Sheet>
      </CardContent>
    </Card>
  );
}
