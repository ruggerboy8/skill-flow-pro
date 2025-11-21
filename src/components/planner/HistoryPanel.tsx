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
      
      // Show: 3 months past → 3 months future
      const startDate = new Date(now);
      startDate.setMonth(startDate.getMonth() - 3 + monthOffset);
      
      const endDate = new Date(now);
      endDate.setMonth(endDate.getMonth() + 3 + monthOffset);

      const startDateStr = startDate.toISOString().split('T')[0];
      const endDateStr = endDate.toISOString().split('T')[0];

      // Fetch from all three sources
      const [planData, focusData, assignmentsData] = await Promise.all([
        // Weekly plan (cycles 4+)
        supabase
          .from('weekly_plan')
          .select(`
            week_start_date,
            status,
            display_order,
            action_id,
            generated_by,
            rank_version,
            pro_moves:fk_weekly_plan_action_id!inner(
              action_statement, 
              competencies:fk_pro_moves_competency_id!inner(
                domains:fk_competencies_domain_id!inner(domain_name)
              )
            )
          `)
          .is('org_id', null)
          .eq('role_id', roleId)
          .gte('week_start_date', startDateStr)
          .lte('week_start_date', endDateStr)
          .order('week_start_date', { ascending: false }),
        
        // Weekly focus (cycles 1-3)
        supabase
          .from('weekly_focus')
          .select(`
            week_start_date,
            display_order,
            action_id,
            cycle,
            week_in_cycle,
            pro_moves:action_id!inner(
              action_statement,
              competencies:fk_pro_moves_competency_id!inner(
                domains:fk_competencies_domain_id!inner(domain_name)
              )
            )
          `)
          .eq('role_id', roleId)
          .gte('week_start_date', startDateStr)
          .lte('week_start_date', endDateStr)
          .order('week_start_date', { ascending: false }),

        // Weekly assignments (V2)
        supabase
          .from('weekly_assignments')
          .select(`
            week_start_date,
            status,
            display_order,
            action_id,
            source,
            pro_moves:action_id!inner(
              action_statement,
              competencies:fk_pro_moves_competency_id!inner(
                domains:fk_competencies_domain_id!inner(domain_name)
              )
            )
          `)
          .is('org_id', null)
          .is('location_id', null)
          .eq('role_id', roleId)
          .gte('week_start_date', startDateStr)
          .lte('week_start_date', endDateStr)
          .order('week_start_date', { ascending: false })
      ]);

      // Group by week from all sources
      const grouped: Record<string, GroupedWeek> = {};

      // Process weekly_plan
      (planData.data || []).forEach((row: any) => {
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
          name: row.pro_moves.action_statement,
          domain: row.pro_moves.competencies.domains.domain_name,
          displayOrder: row.display_order,
        });
      });

      // Process weekly_focus
      (focusData.data || []).forEach((row: any) => {
        const weekStart = row.week_start_date;
        if (!grouped[weekStart]) {
          grouped[weekStart] = {
            weekStart,
            status: 'locked',
            generatedBy: 'legacy',
            rankVersion: null,
            moves: [],
          };
        }
        grouped[weekStart].moves.push({
          name: row.pro_moves.action_statement,
          domain: row.pro_moves.competencies.domains.domain_name,
          displayOrder: row.display_order,
        });
      });

      // Process weekly_assignments
      (assignmentsData.data || []).forEach((row: any) => {
        const weekStart = row.week_start_date;
        if (!grouped[weekStart]) {
          grouped[weekStart] = {
            weekStart,
            status: row.status,
            generatedBy: row.source === 'global' ? 'sequencer' : row.source,
            rankVersion: null,
            moves: [],
          };
        }
        grouped[weekStart].moves.push({
          name: row.pro_moves.action_statement,
          domain: row.pro_moves.competencies.domains.domain_name,
          displayOrder: row.display_order,
        });
      });

      // Sort moves within each week
      Object.values(grouped).forEach(week => {
        week.moves.sort((a, b) => a.displayOrder - b.displayOrder);
      });

      // Separate past and future
      const todayStr = now.toISOString().split('T')[0];
      const allWeeks = Object.values(grouped);
      const futureWeeks = allWeeks.filter(w => w.weekStart >= todayStr);
      const pastWeeks = allWeeks.filter(w => w.weekStart < todayStr).reverse();

      setWeeks([...futureWeeks, ...pastWeeks]);
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
      <CardContent className="space-y-4">
        {loading ? (
          <div className="text-center py-8 text-muted-foreground">Loading...</div>
        ) : weeks.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No assignments found for this period
          </div>
        ) : (
          <>
            {weeks.map((week, idx) => {
              const weekDate = new Date(week.weekStart + 'T12:00:00');
              const isFuture = week.weekStart >= new Date().toISOString().split('T')[0];
              const isPast = !isFuture;
              const showFutureHeader = idx === 0 && isFuture;
              const showPastHeader = idx > 0 && weeks[idx - 1].weekStart >= new Date().toISOString().split('T')[0] && isPast;

              return (
                <div key={week.weekStart}>
                  {showFutureHeader && (
                    <div className="text-sm font-semibold text-muted-foreground py-2 mb-2">
                      📅 Upcoming Weeks
                    </div>
                  )}
                  {showPastHeader && (
                    <div className="text-sm font-semibold text-muted-foreground py-2 mb-2 border-t pt-4">
                      📜 Past Weeks
                    </div>
                  )}
                  
                  <div className="border rounded-lg p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold">Week of {formatWeekOf(week.weekStart)}</p>
                        <p className="text-xs text-muted-foreground">
                          {week.generatedBy === 'sequencer' || week.generatedBy === 'auto' ? '🤖 Auto' : '✏️ Manual'}
                          {week.rankVersion && ` • v${week.rankVersion}`}
                        </p>
                      </div>
                      <Badge variant={week.status === 'scheduled' ? 'default' : 'secondary'}>
                        {week.status}
                      </Badge>
                    </div>

                    <div className="space-y-2">
                      {week.moves.map((move, idx) => (
                        <div key={idx} className="flex items-center gap-2 text-sm">
                          <span className="font-medium text-muted-foreground">#{move.displayOrder}</span>
                          <Badge 
                            variant="outline" 
                            className="shrink-0"
                            style={{
                              borderColor: `hsl(var(--domain-${move.domain.toLowerCase().replace(/\s+/g, '-')}))`,
                              color: `hsl(var(--domain-${move.domain.toLowerCase().replace(/\s+/g, '-')}))`
                            }}
                          >
                            {move.domain}
                          </Badge>
                          <span className="text-muted-foreground truncate">{move.name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </>
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
