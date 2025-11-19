import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { getDomainColor } from '@/lib/domainColors';
import ConfPerfDelta from '@/components/ConfPerfDelta';
import { GraduationCap, Trash2 } from 'lucide-react';
import { useLocation, Link, useNavigate } from 'react-router-dom';
import { getLocationWeekContext } from '@/lib/locationState';
import { LearnerLearnDrawer } from '@/components/learner/LearnerLearnDrawer';

interface WeekData {
  domain_name: string;
  action_statement: string;
  confidence_score: number | null;
  performance_score: number | null;
  action_id: number | null;
  resource_count: number;
  is_self_select?: boolean;
}

interface WeekStatusRow {
  week_of: string;
  total: number;
  conf_count: number;
  perf_count: number;
  cycle: number | null;
  week_in_cycle: number | null;
  source: 'onboarding' | 'ongoing';
  is_current_week: boolean;
}

interface MonthData {
  monthLabel: string;
  monthKey: string;
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
  
  // Controlled accordion state
  const [openYears, setOpenYears] = useState<string[]>([]);
  const [openMonths, setOpenMonths] = useState<string[]>([]);
  const [openWeeks, setOpenWeeks] = useState<string[]>([]);
  const [prefetchedWeeks, setPrefetchedWeeks] = useState<Set<string>>(new Set());
  
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

      // Find current week from server data
      const currentWeekRow = rows.find(r => r.is_current_week);
      const currentMonday = currentWeekRow?.week_of || mondayOf(new Date()).toISOString().split('T')[0];
      setCurrentWeekOf(currentMonday);

      // Build stable structure: Year → Month (with monthKey for sorting)
      const yearMap = new Map<number, Map<string, { label: string; firstOfMonth: Date; weeks: WeekStatusRow[] }>>();
      
      rows.forEach(row => {
        const d = new Date(row.week_of);
        const y = d.getFullYear();
        const monthKey = `${y}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const firstOfMonth = new Date(y, d.getMonth(), 1);

        if (!yearMap.has(y)) yearMap.set(y, new Map());
        const m = yearMap.get(y)!;
        if (!m.has(monthKey)) {
          m.set(monthKey, {
            label: firstOfMonth.toLocaleString('en-US', { month: 'long', year: 'numeric' }),
            firstOfMonth,
            weeks: []
          });
        }
        m.get(monthKey)!.weeks.push(row);
      });

      // Convert maps → arrays with stable sorting
      const yearData: YearData[] = [...yearMap.entries()]
        .map(([year, monthMap]) => ({
          year,
          months: [...monthMap.entries()]
            .map(([key, { label, weeks }]) => ({
              monthLabel: label,
              monthKey: key,
              weeks: weeks.sort((a, b) => new Date(b.week_of).getTime() - new Date(a.week_of).getTime()),
              loadedWeekData: new Map<string, WeekData[]>()
            }))
            .sort((a, b) => b.monthKey.localeCompare(a.monthKey)) // YYYY-MM desc
        }))
        .sort((a, b) => b.year - a.year);

      console.log('📊 Calendar data built:', {
        totalYears: yearData.length,
        years: yearData.map(y => ({
          year: y.year,
          months: y.months.map(m => ({
            month: m.monthLabel,
            weekCount: m.weeks.length,
            weeks: m.weeks.map(w => w.week_of)
          }))
        }))
      });

      setYears(yearData);
      
      // Auto-select most recent year
      if (yearData.length > 0) {
        setSelectedYear(yearData[0].year);
      }

      // Set default-open accordions for current week
      if (currentWeekRow) {
        const d = new Date(currentWeekRow.week_of);
        const yKey = `year-${d.getFullYear()}`;
        const mKey = `month-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const wKey = `week-${currentWeekRow.week_of}`;

        setOpenYears([yKey]);
        setOpenMonths([mKey]);
        setOpenWeeks([wKey]);

        // Prefetch current week data
        const yIdx = yearData.findIndex(y => y.year === d.getFullYear());
        const mIdx = yIdx >= 0 ? yearData[yIdx].months.findIndex(m => m.monthKey === mKey.replace('month-', '')) : -1;
        if (yIdx >= 0 && mIdx >= 0) {
          onWeekExpand(d.getFullYear(), yearData[yIdx].months[mIdx].monthKey, currentWeekRow, true);
        }
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
        let action_id: number | null = null;
        let is_self_select = f.self_select;
        
        if (f.self_select) {
          const selection = selectionsMap[f.id];
          if (selection?.pro_moves) {
            action_statement = selection.pro_moves.action_statement;
            compId = selection.pro_moves.competency_id;
            action_id = selection.selected_pro_move_id;
          } else {
            action_statement = 'Self-Select';
            compId = f.competency_id;
            action_id = null;
          }
        } else {
          action_statement = f.pro_moves?.action_statement || 'Pro Move';
          compId = f.pro_moves?.competency_id;
          action_id = f.action_id;
        }
        
        const domain_name = compId ? (domainMap[compId] || 'General') : 'General';
        const sc = scoreMap[f.id] || { confidence_score: null, performance_score: null };
        
        return {
          domain_name,
          action_statement,
          confidence_score: sc.confidence_score,
          performance_score: sc.performance_score,
          action_id,
          resource_count: 0, // Will be populated below
          is_self_select
        };
      });

      // Fetch resource counts for all action_ids
      const actionIds = rows.map(r => r.action_id).filter((id): id is number => id !== null);
      if (actionIds.length > 0) {
        const { data: resourceCounts } = await supabase
          .from('pro_move_resources')
          .select('action_id')
          .in('action_id', actionIds)
          .eq('status', 'published');
        
        const countMap: Record<number, number> = {};
        (resourceCounts ?? []).forEach(rc => {
          countMap[rc.action_id] = (countMap[rc.action_id] || 0) + 1;
        });
        
        rows.forEach(row => {
          if (row.action_id) {
            row.resource_count = countMap[row.action_id] || 0;
          }
        });
      }

      return rows;
    } catch (error) {
      console.error('Error loading week data:', error);
      return [];
    }
  };

  const onWeekExpand = async (yearValue: number, monthKey: string, row: WeekStatusRow, isPrefetch = false) => {
    // Avoid redundant fetches
    if (prefetchedWeeks.has(row.week_of)) return;

    let weekData: WeekData[];

    // For onboarding weeks, load data by cycle/week
    if (row.source === 'onboarding' && row.cycle !== null && row.week_in_cycle !== null) {
      weekData = await loadWeekData(row.cycle, row.week_in_cycle);
    } else {
      const { data, error } = await supabase.rpc('get_week_detail_by_week', {
        p_staff_id: staffData!.id,
        p_role_id: staffData!.role_id,
        p_week_of: row.week_of,
        p_source: row.source
      } as any);

      if (error) {
        console.error('Error loading ongoing week detail:', error);
        weekData = [];
      } else {
        weekData = (data as WeekData[]) || [];
      }
    }

    setPrefetchedWeeks(prev => new Set(prev).add(row.week_of));

    setYears(prev => {
      const updated = prev.map(y => ({ 
        ...y, 
        months: y.months.map(m => ({ 
          ...m, 
          loadedWeekData: new Map(m.loadedWeekData) 
        })) 
      }));
      
      const yIdx = updated.findIndex(y => y.year === yearValue);
      const mIdx = yIdx >= 0 ? updated[yIdx].months.findIndex(m => m.monthKey === monthKey) : -1;

      if (yIdx >= 0 && mIdx >= 0) {
        updated[yIdx].months[mIdx].loadedWeekData.set(row.week_of, weekData);
      }

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

  const jumpToCurrentWeek = () => {
    if (!currentWeekOf) return;
    
    const d = new Date(currentWeekOf);
    const yKey = `year-${d.getFullYear()}`;
    const mKey = `month-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const wKey = `week-${currentWeekOf}`;

    setOpenYears([yKey]);
    setOpenMonths([mKey]);
    setOpenWeeks([wKey]);

    setTimeout(() => {
      const element = document.getElementById(wKey);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 100);
  };

  return (
    <div className="space-y-4 max-w-full overflow-x-hidden">
      {/* Status Legend & Jump Button */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center justify-center bg-muted/30 p-3 rounded-lg flex-1">
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span title="All done">✓ all done</span>
            <span title="In progress">● in progress</span>
            <span title="Not started">— not started</span>
          </div>
        </div>
        {currentWeekOf && (
          <Button 
            variant="outline" 
            size="sm"
            onClick={jumpToCurrentWeek}
            className="shrink-0"
          >
            Jump to Current Week
          </Button>
        )}
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
      <Accordion type="multiple" value={openYears} onValueChange={setOpenYears} className="space-y-4">
        {filteredYears.map((yearData) => (
          <AccordionItem key={yearData.year} value={`year-${yearData.year}`} className="border rounded-lg">
            <AccordionTrigger className="px-4">
              <h3 className="text-lg font-semibold">{yearData.year}</h3>
            </AccordionTrigger>
            
            <AccordionContent className="px-4 pb-4">
              <Accordion type="multiple" value={openMonths} onValueChange={setOpenMonths} className="space-y-2">
                {yearData.months.map((monthData) => (
                  <AccordionItem key={monthData.monthKey} value={`month-${monthData.monthKey}`} className="border rounded">
                    <AccordionTrigger className="px-3 py-2">
                      <span className="font-medium">{monthData.monthLabel}</span>
                    </AccordionTrigger>
                    
                    <AccordionContent className="px-3 pb-3">
                      <Accordion type="multiple" value={openWeeks} onValueChange={setOpenWeeks} className="space-y-2">
                        {monthData.weeks.map(weekRow => (
                          <WeekAccordion
                            key={weekRow.week_of}
                            weekRow={weekRow}
                            staffData={staffData}
                            onExpand={() => onWeekExpand(yearData.year, monthData.monthKey, weekRow)}
                            weekData={monthData.loadedWeekData.get(weekRow.week_of)}
                            isPrefetched={prefetchedWeeks.has(weekRow.week_of)}
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
  weekData: WeekData[] | undefined;
  isPrefetched: boolean;
  onWeekDeleted: () => void;
  currentWeekOf: string | null;
  currentCycle: number | null;
  currentWeek: number | null;
  location: any;
}

function WeekAccordion({ weekRow, staffData, onExpand, weekData, isPrefetched, onWeekDeleted, currentWeekOf, currentCycle, currentWeek, location }: WeekAccordionProps) {
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [learnDrawerOpen, setLearnDrawerOpen] = useState(false);
  const [selectedLearnItem, setSelectedLearnItem] = useState<WeekData | null>(null);
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

      if (weekRow.source === 'onboarding' && weekRow.cycle !== null && weekRow.week_in_cycle !== null) {
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

  // Parse as local date to avoid timezone shift (YYYY-MM-DD should display as-is)
  const [year, month, day] = weekRow.week_of.split('-').map(Number);
  const weekDate = new Date(year, month - 1, day);
  const weekLabel = weekDate.toLocaleDateString('en-US', { 
    weekday: 'short', 
    month: 'short', 
    day: 'numeric' 
  });

  const isCurrentWeek = weekRow.is_current_week;

  const isPastWeek = () => {
    if (currentCycle == null || currentWeek == null) return false;
    if (weekRow.source === 'onboarding' && weekRow.cycle !== null && weekRow.week_in_cycle !== null) {
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
    
    // Always add cycle/week if available (not just for onboarding)
    if (weekRow.cycle !== null && weekRow.week_in_cycle !== null) {
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

  const getStatusGlyph = () => {
    const { total, conf_count, perf_count } = weekRow;
    if (total === 0) return { glyph: '—', title: 'No data', color: 'text-muted-foreground' };
    if (perf_count === total && total > 0) return { glyph: '✓', title: 'All done', color: 'text-green-600' };
    if (conf_count === total && perf_count < total) return { glyph: '●', title: 'In progress', color: 'text-yellow-600' };
    return { glyph: '—', title: 'Not started', color: 'text-muted-foreground' };
  };

  const statusGlyph = getStatusGlyph();

  return (
    <>
      <AccordionItem value={`week-${weekRow.week_of}`} className="border rounded" id={`week-${weekRow.week_of}`}>
        <div className="relative">
          <AccordionTrigger className="px-3 py-2 text-sm" onClick={onExpand}>
            <div className="flex items-center justify-between w-full pr-8">
              <div className="flex items-center gap-3">
                <span className="font-medium">Week of {weekLabel}</span>
                {isCurrentWeek && (
                  <Badge variant="outline" className="text-xs">Current Week</Badge>
                )}
                {generateRepairLinks()}
              </div>
              <div className="flex items-center gap-2">
                <span 
                  className={`text-lg font-bold ${statusGlyph.color}`}
                  title={statusGlyph.title}
                >
                  {statusGlyph.glyph}
                </span>
                <span className="text-xs text-muted-foreground">
                  {weekRow.perf_count}/{weekRow.total}
                </span>
              </div>
            </div>
          </AccordionTrigger>
          {isSuperAdmin && (
            <button
              className="absolute right-2 top-2 h-6 w-6 p-0 text-red-600 hover:text-red-800 hover:bg-red-50 rounded flex items-center justify-center"
              onClick={(e) => {
                e.stopPropagation();
                setShowDeleteDialog(true);
              }}
              disabled={deleteLoading}
            >
              <Trash2 className="h-3 w-3" />
            </button>
          )}
        </div>
        
        <AccordionContent className="px-3 pb-3">
          {!isPrefetched ? (
            <div className="space-y-2 py-2">
              <div className="animate-pulse flex items-center gap-3 p-3 rounded-lg bg-muted/30">
                <div className="h-5 w-20 bg-muted rounded" />
                <div className="flex-1 h-4 bg-muted rounded" />
                <div className="h-4 w-16 bg-muted rounded" />
              </div>
            </div>
          ) : weekData && weekData.length > 0 ? (
            <div className="space-y-2">
              {weekData.map((item, index) => (
                <div
                  key={index}
                  className="flex items-center gap-3 p-3 rounded-lg"
                >
                  <Badge 
                    className="text-xs font-semibold ring-1 ring-border/50 text-black"
                    style={{ backgroundColor: getDomainColor(item.domain_name) }}
                  >
                    {item.domain_name}
                  </Badge>
                  
                  {/* Learn Button - positioned after domain */}
                  {item.resource_count > 0 && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 gap-1.5"
                      onClick={() => {
                        setSelectedLearnItem(item);
                        setLearnDrawerOpen(true);
                      }}
                      aria-label={`Learn: ${item.action_statement}`}
                    >
                      <GraduationCap className="h-3 w-3" />
                      <span className="text-xs">Learn</span>
                    </Button>
                  )}
                  
                  <span className="flex-1 text-sm">
                    {item.action_statement}
                  </span>
                  <ConfPerfDelta confidence={item.confidence_score} performance={item.performance_score} />
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground py-4 text-sm text-center">No data available</p>
          )}
        </AccordionContent>
      </AccordionItem>

      {selectedLearnItem && (
        <LearnerLearnDrawer
          open={learnDrawerOpen}
          onOpenChange={setLearnDrawerOpen}
          actionId={selectedLearnItem.action_id!}
          proMoveTitle={selectedLearnItem.action_statement}
          domainName={selectedLearnItem.domain_name}
        />
      )}

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
