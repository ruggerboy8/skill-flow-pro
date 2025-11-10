import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { getDomainColor } from '@/lib/domainColors';
import ConfPerfDelta from '@/components/ConfPerfDelta';
import { Trash2 } from 'lucide-react';
import { useLocation, Link, useNavigate } from 'react-router-dom';
import { getLocationWeekContext } from '@/lib/locationState';

interface WeekData {
  domain_name: string;
  action_statement: string;
  confidence_score: number | null;
  performance_score: number | null;
}

interface WeekStatusRow {
  week_of: string;
  total: number;
  conf_count: number;
  perf_count: number;
  cycle: number | null;
  week_in_cycle: number | null;
  source: 'onboarding' | 'ongoing';
}

interface MonthData {
  monthLabel: string;
  weeks: WeekStatusRow[];
  loadedWeekData: Map<string, WeekData[]>;
}

interface YearData {
  year: number;
  months: MonthData[];
}

// Helper to get Monday of current week
const mondayOf = (d: Date = new Date()): Date => {
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  const m = new Date(d);
  m.setDate(d.getDate() + diff);
  m.setHours(0, 0, 0, 0);
  return m;
};

export default function StatsScores() {
  const [years, setYears] = useState<YearData[]>([]);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [staffData, setStaffData] = useState<{ id: string; role_id: number } | null>(null);
  const [currentWeekOf, setCurrentWeekOf] = useState<string | null>(null);
  const [currentCycle, setCurrentCycle] = useState<number | null>(null);
  const [currentWeek, setCurrentWeek] = useState<number | null>(null);
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (user) {
      loadStaffData();
    }
  }, [user]);

  useEffect(() => {
    if (staffData) {
      loadCalendarData();
    }
  }, [staffData]);

  // Handle return from repair with auto-scroll
  useEffect(() => {
    if (location.state?.repairJustSubmitted && location.hash) {
      const id = location.hash.slice(1);
      setTimeout(() => {
        const element = document.getElementById(id);
        if (element) {
          element.scrollIntoView({ behavior: "smooth", block: "start" });
          navigate(location.pathname + location.search + location.hash, { 
            replace: true, 
            state: undefined 
          });
        }
      }, 100);
    }
  }, [location.state, location.hash, location.pathname, location.search, navigate]);

  const loadStaffData = async () => {
    if (!user) return;

    const { data: staffRow } = await supabase
      .from('staff')
      .select('id, role_id, primary_location_id')
      .eq('user_id', user.id)
      .single();

    if (staffRow) {
      setStaffData({ id: staffRow.id, role_id: staffRow.role_id });

      if (staffRow.primary_location_id) {
        const ctx = await getLocationWeekContext(staffRow.primary_location_id, new Date());
        setCurrentCycle(ctx.cycleNumber);
        setCurrentWeek(ctx.weekInCycle);
      }
    }
  };

  const loadCalendarData = async () => {
    if (!staffData) return;
    setLoading(true);
    
    try {
      const { data: statusRows, error } = await supabase.rpc('get_calendar_week_status', {
        p_staff_id: staffData.id,
        p_role_id: staffData.role_id
      });

      if (error) throw error;

      const rows = statusRows as WeekStatusRow[];
      if (!rows || rows.length === 0) {
        setYears([]);
        setLoading(false);
        return;
      }

      // Compute current Monday
      const currentMonday = mondayOf(new Date()).toISOString().split('T')[0];
      setCurrentWeekOf(currentMonday);

      // Group by Year → Month
      const yearMap = new Map<number, Map<string, WeekStatusRow[]>>();
      
      rows.forEach(row => {
        const weekDate = new Date(row.week_of);
        const year = weekDate.getFullYear();
        const monthLabel = weekDate.toLocaleString('en-US', { month: 'long', year: 'numeric' });

        if (!yearMap.has(year)) {
          yearMap.set(year, new Map());
        }
        const monthMap = yearMap.get(year)!;
        if (!monthMap.has(monthLabel)) {
          monthMap.set(monthLabel, []);
        }
        monthMap.get(monthLabel)!.push(row);
      });

      // Convert to YearData structure
      const yearData: YearData[] = Array.from(yearMap.entries())
        .map(([year, monthMap]) => ({
          year,
          months: Array.from(monthMap.entries()).map(([monthLabel, weeks]) => ({
            monthLabel,
            weeks: weeks.sort((a, b) => new Date(b.week_of).getTime() - new Date(a.week_of).getTime()),
            loadedWeekData: new Map()
          }))
        }))
        .sort((a, b) => b.year - a.year);

      setYears(yearData);
      
      // Auto-select most recent year
      if (yearData.length > 0) {
        setSelectedYear(yearData[0].year);
      }
    } catch (error) {
      console.error('Error loading calendar data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadWeekData = async (cycle: number, week: number): Promise<WeekData[]> => {
    if (!staffData) return [];

    try {
      const isCurrentWeek = cycle === currentCycle && week === currentWeek;
      
      if (!isCurrentWeek) {
        const { data: rpcRows } = await supabase.rpc('get_weekly_review', {
          p_cycle: cycle,
          p_week: week,
          p_role_id: staffData.role_id,
          p_staff_id: staffData.id
        });

        if (rpcRows && rpcRows.length) {
          return rpcRows as WeekData[];
        }
      }

      // Fallback: compose from weekly_focus + optional scores
      const { data: focus } = await supabase
        .from('weekly_focus')
        .select(`
          id,
          display_order,
          self_select,
          competency_id,
          pro_moves(action_statement, competency_id)
        `)
        .eq('cycle', cycle)
        .eq('week_in_cycle', week)
        .eq('role_id', staffData.role_id)
        .order('display_order');

      const focusIds = (focus ?? []).map((f: any) => f.id);

      const { data: userSelections } = await supabase
        .from('weekly_self_select')
        .select(`
          weekly_focus_id,
          selected_pro_move_id,
          pro_moves(action_statement, competency_id)
        `)
        .eq('user_id', user?.id)
        .in('weekly_focus_id', (focus ?? []).map((f: any) => String(f.id)));

      const selectionsMap: Record<string, any> = {};
      (userSelections ?? []).forEach((sel: any) => {
        selectionsMap[sel.weekly_focus_id] = sel;
      });

      const allCompIds = Array.from(
        new Set([
          ...(focus ?? []).map((f: any) => f.pro_moves?.competency_id).filter(Boolean),
          ...(focus ?? []).map((f: any) => f.competency_id).filter(Boolean),
          ...(userSelections ?? []).map((sel: any) => sel.pro_moves?.competency_id).filter(Boolean)
        ])
      ) as number[];
      let domainMap: Record<number, string> = {};
      if (allCompIds.length) {
        const { data: comps } = await supabase
          .from('competencies')
          .select('competency_id, domain_id')
          .in('competency_id', allCompIds);

        const domainIds = Array.from(new Set((comps ?? []).map(c => c.domain_id).filter(Boolean)));
        if (domainIds.length) {
          const { data: domains } = await supabase
            .from('domains')
            .select('domain_id, domain_name')
            .in('domain_id', domainIds);
          const idName: Record<number, string> = {};
          (domains ?? []).forEach(d => { idName[d.domain_id] = d.domain_name; });
          (comps ?? []).forEach(c => {
            if (c.domain_id && idName[c.domain_id]) {
              domainMap[c.competency_id] = idName[c.domain_id];
            }
          });
        }
      }

      let scoreMap: Record<string, { confidence_score: number|null, performance_score: number|null }> = {};
      if (focusIds.length) {
        const { data: scores } = await supabase
          .from('weekly_scores')
          .select('weekly_focus_id, confidence_score, performance_score')
          .eq('staff_id', staffData.id)
          .in('weekly_focus_id', focusIds.map(String));
        (scores ?? []).forEach((s: any) => {
          scoreMap[s.weekly_focus_id] = {
            confidence_score: s.confidence_score,
            performance_score: s.performance_score
          };
        });
      }

      const rows: WeekData[] = (focus ?? []).map((f: any) => {
        let action_statement = 'Pro Move';
        let compId: number | null = null;
        
        if (f.self_select) {
          const selection = selectionsMap[f.id];
          if (selection?.pro_moves) {
            action_statement = selection.pro_moves.action_statement;
            compId = selection.pro_moves.competency_id;
          } else {
            action_statement = 'Self-Select';
            compId = f.competency_id;
          }
        } else {
          action_statement = f.pro_moves?.action_statement || 'Pro Move';
          compId = f.pro_moves?.competency_id;
        }
        
        const domain_name = compId ? (domainMap[compId] || 'General') : 'General';
        const sc = scoreMap[f.id] || { confidence_score: null, performance_score: null };
        
        return {
          domain_name,
          action_statement,
          confidence_score: sc.confidence_score,
          performance_score: sc.performance_score
        };
      });

      return rows;
    } catch (error) {
      console.error('Error loading week data:', error);
      return [];
    }
  };

  const onWeekExpand = async (yearIndex: number, monthIndex: number, row: WeekStatusRow) => {
    let weekData: WeekData[];

    if (row.source === 'onboarding' && row.cycle && row.week_in_cycle) {
      weekData = await loadWeekData(row.cycle, row.week_in_cycle);
    } else {
      const { data, error } = await supabase.rpc('get_week_detail_by_week', {
        p_staff_id: staffData!.id,
        p_role_id: staffData!.role_id,
        p_week_of: row.week_of
      });

      if (error) {
        console.error('Error loading ongoing week detail:', error);
        weekData = [];
      } else {
        weekData = (data as WeekData[]) || [];
      }
    }

    setYears(prev => {
      const updated = [...prev];
      updated[yearIndex].months[monthIndex].loadedWeekData.set(row.week_of, weekData);
      return updated;
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">Loading scores...</div>
      </div>
    );
  }

  if (years.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground">No score data available yet.</p>
        </CardContent>
      </Card>
    );
  }

  const filteredYears = selectedYear ? years.filter(y => y.year === selectedYear) : years;

  return (
    <div className="space-y-4 max-w-full overflow-x-hidden">
      {/* Status Legend */}
      <div className="flex items-center justify-center bg-muted/30 p-3 rounded-lg">
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span>✓ all done</span>
          <span>● in progress / late</span>
          <span>— not started</span>
        </div>
      </div>
      
      {/* Year Selector */}
      {years.length > 1 && (
        <Select value={selectedYear?.toString() || ""} onValueChange={(value) => setSelectedYear(parseInt(value))}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Select year" />
          </SelectTrigger>
          <SelectContent>
            {years.map(y => (
              <SelectItem key={y.year} value={y.year.toString()}>
                {y.year}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      
      {/* Year → Month → Week Accordion */}
      <Accordion type="multiple" className="space-y-4">
        {filteredYears.map((yearData, yearIndex) => (
          <AccordionItem key={yearData.year} value={`year-${yearData.year}`} className="border rounded-lg">
            <AccordionTrigger className="px-4">
              <h3 className="text-lg font-semibold">{yearData.year}</h3>
            </AccordionTrigger>
            
            <AccordionContent className="px-4 pb-4">
              <Accordion type="multiple" className="space-y-2">
                {yearData.months.map((monthData, monthIndex) => (
                  <AccordionItem key={monthData.monthLabel} value={`month-${monthData.monthLabel}`} className="border rounded">
                    <AccordionTrigger className="px-3 py-2">
                      <span className="font-medium">{monthData.monthLabel}</span>
                    </AccordionTrigger>
                    
                    <AccordionContent className="px-3 pb-3">
                      <Accordion type="multiple" className="space-y-2">
                        {monthData.weeks.map(weekRow => (
                          <WeekAccordion
                            key={weekRow.week_of}
                            weekRow={weekRow}
                            staffData={staffData}
                            onExpand={() => onWeekExpand(yearIndex, monthIndex, weekRow)}
                            weekData={monthData.loadedWeekData.get(weekRow.week_of) || []}
                            onWeekDeleted={() => loadCalendarData()}
                            currentWeekOf={currentWeekOf}
                            currentCycle={currentCycle}
                            currentWeek={currentWeek}
                            location={location}
                          />
                        ))}
                      </Accordion>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}

interface WeekAccordionProps {
  weekRow: WeekStatusRow;
  staffData: { id: string; role_id: number } | null;
  onExpand: () => void;
  weekData: WeekData[];
  onWeekDeleted: () => void;
  currentWeekOf: string | null;
  currentCycle: number | null;
  currentWeek: number | null;
  location: any;
}

function WeekAccordion({ weekRow, staffData, onExpand, weekData, onWeekDeleted, currentWeekOf, currentCycle, currentWeek, location }: WeekAccordionProps) {
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();

  useEffect(() => {
    if (user) {
      checkSuperAdminStatus();
    }
  }, [user]);

  async function checkSuperAdminStatus() {
    if (!user) return;
    try {
      const { data } = await supabase.rpc('is_super_admin', { _user_id: user.id });
      setIsSuperAdmin(!!data);
    } catch (error) {
      console.error('Error checking super admin status:', error);
    }
  }

  async function handleDeleteThisWeek() {
    if (!user || !staffData) return;
    
    setDeleteLoading(true);
    try {
      let data, error;

      if (weekRow.source === 'onboarding' && weekRow.cycle && weekRow.week_in_cycle) {
        const result = await supabase.rpc('delete_week_data', {
          p_staff_id: staffData.id,
          p_role_id: staffData.role_id,
          p_cycle: weekRow.cycle,
          p_week: weekRow.week_in_cycle
        });
        data = result.data;
        error = result.error;
      } else {
        const result = await supabase.rpc('delete_week_data_by_week', {
          p_staff_id: staffData.id,
          p_role_id: staffData.role_id,
          p_week_of: weekRow.week_of
        });
        data = result.data;
        error = result.error;
      }

      if (error) throw error;

      toast({ 
        title: 'Success', 
        description: (data as any)?.message || `Deleted data for ${weekLabel}.` 
      });
      
      onWeekDeleted();
    } catch (error: any) {
      console.error('Error deleting week data:', error);
      toast({ 
        title: 'Error', 
        description: error.message || 'Failed to delete week data', 
        variant: 'destructive' 
      });
    } finally {
      setDeleteLoading(false);
      setShowDeleteDialog(false);
    }
  }

  const weekLabel = new Date(weekRow.week_of).toLocaleDateString('en-US', { 
    weekday: 'short', 
    month: 'short', 
    day: 'numeric' 
  });

  const isCurrentWeek = weekRow.week_of === currentWeekOf;

  const isPastWeek = () => {
    if (currentCycle == null || currentWeek == null) return false;
    if (weekRow.cycle && weekRow.week_in_cycle) {
      return weekRow.cycle < currentCycle || (weekRow.cycle === currentCycle && weekRow.week_in_cycle < currentWeek);
    }
    return new Date(weekRow.week_of) < new Date(currentWeekOf || '');
  };

  const generateRepairLinks = () => {
    if (!isPastWeek()) return null;

    const anchorId = `week-${weekRow.week_of}`;
    const returnTo = encodeURIComponent(`${location.pathname}${location.search}#${anchorId}`);

    const { total, conf_count, perf_count } = weekRow;
    const showConf = total > 0 && conf_count < total;
    const showPerf = total > 0 && conf_count === total && perf_count < total;

    if (!showConf && !showPerf) return null;

    let baseUrlConf = `/confidence/current/step/1?mode=repair&weekOf=${weekRow.week_of}`;
    let baseUrlPerf = `/performance/current/step/1?mode=repair&weekOf=${weekRow.week_of}`;
    
    if (weekRow.cycle && weekRow.week_in_cycle) {
      baseUrlConf += `&cycle=${weekRow.cycle}&wk=${weekRow.week_in_cycle}`;
      baseUrlPerf += `&cycle=${weekRow.cycle}&wk=${weekRow.week_in_cycle}`;
    }

    return (
      <div className="flex gap-2 text-xs">
        {showConf && (
          <Link to={`${baseUrlConf}&returnTo=${returnTo}`} className="text-blue-600 underline opacity-70 hover:opacity-100" onClick={(e) => e.stopPropagation()}>
            Backfill Confidence
          </Link>
        )}
        {showPerf && (
          <Link to={`${baseUrlPerf}&returnTo=${returnTo}`} className="text-blue-600 underline opacity-70 hover:opacity-100" onClick={(e) => e.stopPropagation()}>
            Backfill Performance
          </Link>
        )}
      </div>
    );
  };

  const getStatusBadge = () => {
    const { total, conf_count, perf_count } = weekRow;
    if (total === 0) return null;
    if (conf_count === 0) return null;
    if (perf_count === total) return <span className="text-green-600 text-lg font-bold">✓</span>;
    if (conf_count === total && perf_count < total) return <span className="text-yellow-600 text-lg font-bold">●</span>;
    return null;
  };

  return (
    <>
      <AccordionItem value={`week-${weekRow.week_of}`} className="border rounded" id={`week-${weekRow.week_of}`}>
        <AccordionTrigger className="px-3 py-2 text-sm" onClick={onExpand}>
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-3">
              <span className="font-medium">Week of {weekLabel}</span>
              {isCurrentWeek && (
                <Badge variant="outline" className="text-xs">Current Week</Badge>
              )}
              {generateRepairLinks()}
            </div>
            <div className="flex items-center gap-2">
              {getStatusBadge()}
              {isSuperAdmin && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 text-red-600 hover:text-red-800 hover:bg-red-50"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowDeleteDialog(true);
                  }}
                  disabled={deleteLoading}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              )}
            </div>
          </div>
        </AccordionTrigger>
        
        <AccordionContent className="px-3 pb-3">
          {weekData.length > 0 ? (
            <div className="space-y-2">
              {weekData.map((item, index) => (
                <div
                  key={index}
                  className="flex items-center gap-3 p-3 rounded-lg"
                >
                  <Badge 
                    className="text-xs font-semibold ring-1 ring-border/50 text-black"
                    style={{ backgroundColor: `hsl(${getDomainColor(item.domain_name)})` }}
                  >
                    {item.domain_name}
                  </Badge>
                  <span className="flex-1 text-sm">
                    {item.action_statement}
                  </span>
                  <ConfPerfDelta confidence={item.confidence_score} performance={item.performance_score} />
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground py-4">Loading...</p>
          )}
        </AccordionContent>
      </AccordionItem>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Week Data</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete all confidence and performance scores, as well as any self-selection data 
              for {weekLabel}. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteThisWeek}
              disabled={deleteLoading}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteLoading ? 'Deleting...' : 'Delete Week'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
