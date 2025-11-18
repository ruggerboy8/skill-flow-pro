import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { getDomainColor } from '@/lib/domainColors';
import ConfPerfDelta from '@/components/ConfPerfDelta';
import { QuarterlyEvalsTab } from '@/components/coach/QuarterlyEvalsTab';
import OnTimeRateWidget from '@/components/coach/OnTimeRateWidget';

interface StaffInfo {
  id: string;
  name: string;
  role_name: string;
  role_id: number;
  location_id?: string;
}

interface WeekData {
  weekly_focus_id: string;
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

export default function CoachDetail() {
  const { staffId } = useParams<{ staffId: string }>();
  const navigate = useNavigate();
  const { isCoach, user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [staffInfo, setStaffInfo] = useState<StaffInfo | null>(null);
  const [years, setYears] = useState<YearData[]>([]);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [openYears, setOpenYears] = useState<string[]>([]);
  const [openMonths, setOpenMonths] = useState<string[]>([]);
  const [openWeeks, setOpenWeeks] = useState<string[]>([]);
  const [prefetchedWeeks, setPrefetchedWeeks] = useState<Set<string>>(new Set());

  // Redirect if not coach
  useEffect(() => {
    if (!loading && !isCoach) {
      navigate('/');
    }
  }, [isCoach, loading, navigate]);

  useEffect(() => {
    if (staffId) {
      loadStaffInfo();
    }
  }, [staffId]);

  const loadStaffInfo = async () => {
    if (!staffId) return;

    try {
      const { data: staffData, error: staffError } = await supabase
        .from('staff')
        .select('id, name, role_id, primary_location_id, roles!inner(role_name)')
        .eq('id', staffId)
        .single();

      if (staffError) throw staffError;
      if (!staffData) throw new Error('Staff member not found');

      const staff: StaffInfo = {
        id: staffData.id,
        name: staffData.name,
        role_name: (staffData.roles as any).role_name,
        role_id: staffData.role_id,
        location_id: staffData.primary_location_id
      };

      setStaffInfo(staff);
      await loadCalendarData(staff);
    } catch (error) {
      console.error('Error loading staff info:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadCalendarData = async (staff: StaffInfo) => {
    try {
      const { data: statusRows, error } = await supabase.rpc('get_calendar_week_status', {
        p_staff_id: staff.id,
        p_role_id: staff.role_id
      });

      if (error) throw error;

      const rows = statusRows as WeekStatusRow[];
      if (!rows || rows.length === 0) {
        setYears([]);
        return;
      }

      // Build year → month structure
      const yearMap = new Map<number, Map<string, { label: string; weeks: WeekStatusRow[] }>>();
      
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
            weeks: []
          });
        }
        m.get(monthKey)!.weeks.push(row);
      });

      // Convert to arrays
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
            .sort((a, b) => b.monthKey.localeCompare(a.monthKey))
        }))
        .sort((a, b) => b.year - a.year);

      setYears(yearData);
      
      // Auto-select most recent year
      if (yearData.length > 0) {
        const latestYear = yearData[0].year;
        setSelectedYear(latestYear);
        setOpenYears([latestYear.toString()]);
        
        // Auto-open most recent month
        if (yearData[0].months.length > 0) {
          const latestMonthKey = yearData[0].months[0].monthKey;
          setOpenMonths([latestMonthKey]);
        }
      }
    } catch (error) {
      console.error('Error loading calendar data:', error);
    }
  };

  const loadWeekData = async (cycle: number, week: number, weekOf: string): Promise<WeekData[]> => {
    if (!staffInfo) return [];

    try {
      // Use unified RPC that handles both weekly_focus and weekly_plan
      const { data, error } = await supabase.rpc('get_staff_week_assignments', {
        p_staff_id: staffInfo.id,
        p_role_id: staffInfo.role_id,
        p_week_start: weekOf
      });

      if (error) {
        console.error('[CoachDetail] RPC error:', error);
        throw error;
      }

      // Parse JSONB response
      const parsed = typeof data === 'string' ? JSON.parse(data) : data;
      const assignments = parsed?.assignments || [];

      // Handle self-select slots: fetch user selections for display names
      const selfSelectIds = assignments
        .filter((row: any) => row.self_select)
        .map((row: any) => row.focus_id);

      let selectionsMap: Record<string, any> = {};
      if (selfSelectIds.length > 0) {
        const { data: userSelections } = await supabase
          .from('weekly_self_select')
          .select(`
            weekly_focus_id,
            selected_pro_move_id,
            pro_moves(action_statement, competency_id)
          `)
          .eq('user_id', staffInfo.id)
          .in('weekly_focus_id', selfSelectIds);

        (userSelections ?? []).forEach((sel: any) => {
          selectionsMap[sel.weekly_focus_id] = sel;
        });
      }

      // Map RPC results to WeekData format
      const rows: WeekData[] = assignments.map((row: any) => {
        let action_statement = row.action_statement;

        // Override with user selection if applicable
        if (row.self_select) {
          const selection = selectionsMap[row.focus_id];
          if (selection?.pro_moves) {
            action_statement = selection.pro_moves.action_statement;
          } else {
            action_statement = 'Self-Select (not chosen)';
          }
        }

        return {
          weekly_focus_id: row.focus_id,
          domain_name: row.domain_name,
          action_statement,
          confidence_score: row.confidence_score ?? null,
          performance_score: row.performance_score ?? null
        };
      });

      return rows;
    } catch (error) {
      console.error('[CoachDetail] Error loading week data:', error);
      return [];
    }
  };

  const onWeekExpand = async (yearValue: number, monthKey: string, row: WeekStatusRow) => {
    if (prefetchedWeeks.has(row.week_of)) return;

    let weekData: WeekData[];

    // RPC handles both weekly_focus (cycles 1-3) and weekly_plan (cycles 4+)
    weekData = await loadWeekData(row.cycle ?? 1, row.week_in_cycle ?? 1, row.week_of);

    setPrefetchedWeeks(prev => new Set([...prev, row.week_of]));

    setYears(prevYears =>
      prevYears.map(y =>
        y.year === yearValue
          ? {
              ...y,
              months: y.months.map(m =>
                m.monthKey === monthKey
                  ? { ...m, loadedWeekData: new Map(m.loadedWeekData).set(row.week_of, weekData) }
                  : m
              )
            }
          : y
      )
    );
  };

  const handleDeleteScore = async (weeklyFocusId: string, scoreType: 'confidence' | 'performance') => {
    if (!staffInfo) return;
    
    const confirmMsg = scoreType === 'confidence' 
      ? 'Delete this confidence score?' 
      : 'Delete this performance score?';
    
    if (!confirm(confirmMsg)) return;

    try {
      const updateData = scoreType === 'confidence'
        ? { confidence_score: null, confidence_date: null, confidence_late: null }
        : { performance_score: null, performance_date: null, performance_late: null };

      const { error } = await supabase
        .from('weekly_scores')
        .update(updateData)
        .eq('staff_id', staffInfo.id)
        .eq('weekly_focus_id', weeklyFocusId);

      if (error) throw error;

      // Reload calendar data to refresh
      await loadCalendarData(staffInfo);
    } catch (error) {
      console.error(`Error deleting ${scoreType} score:`, error);
      alert(`Failed to delete ${scoreType} score. Please try again.`);
    }
  };

  const getStatusBadge = (weekRow: WeekStatusRow) => {
    const { total, conf_count, perf_count } = weekRow;
    if (total === 0) return <span className="text-xs text-muted-foreground">—</span>;
    if (conf_count === 0) return <span className="text-xs text-muted-foreground">—</span>;
    if (perf_count === total) return <Badge variant="outline" className="text-green-600 border-green-400">✓</Badge>;
    if (conf_count === total && perf_count < total) return <Badge variant="outline" className="text-yellow-600 border-yellow-400">●</Badge>;
    return <span className="text-xs text-muted-foreground">—</span>;
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-10 w-48" />
        <div className="space-y-4">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (!staffInfo) {
    return (
      <Card>
        <CardContent className="py-16 text-center">
          <p>Staff member not found.</p>
        </CardContent>
      </Card>
    );
  }

  const displayYears = selectedYear ? years.filter(y => y.year === selectedYear) : years;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => navigate('/coach')}
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Staff List
          </Button>
          <h1 className="text-3xl font-bold">{staffInfo.role_name} · {staffInfo.name}</h1>
        </div>
      </div>

      {/* Main Content Tabs */}
      <Tabs defaultValue="performance" className="w-full">
        <TabsList>
          <TabsTrigger value="performance">Performance History</TabsTrigger>
          <TabsTrigger value="quarterly-evals">Quarterly Evals</TabsTrigger>
        </TabsList>
        
        <TabsContent value="performance" className="space-y-4">
          {/* On-Time Submission Rate */}
          <OnTimeRateWidget staffId={staffInfo.id} />
          
          {years.length === 0 ? (
            <Card>
              <CardContent className="py-16 text-center">
                <p className="text-muted-foreground">No performance data found for this staff member.</p>
              </CardContent>
            </Card>
          ) : (
            <>
              {years.length > 1 && (
                <div className="flex gap-2">
                  {years.map(y => (
                    <Button
                      key={y.year}
                      variant={selectedYear === y.year ? "default" : "outline"}
                      size="sm"
                      onClick={() => setSelectedYear(y.year)}
                    >
                      {y.year}
                    </Button>
                  ))}
                </div>
              )}

              {displayYears.map(yearData => (
                <Accordion
                  key={yearData.year}
                  type="multiple"
                  value={openYears}
                  onValueChange={setOpenYears}
                >
                  <AccordionItem value={yearData.year.toString()}>
                    <AccordionTrigger className="text-xl font-semibold">
                      {yearData.year}
                    </AccordionTrigger>
                    <AccordionContent>
                      <Accordion
                        type="multiple"
                        value={openMonths}
                        onValueChange={setOpenMonths}
                      >
                        {yearData.months.map(monthData => (
                          <AccordionItem key={monthData.monthKey} value={monthData.monthKey}>
                            <AccordionTrigger className="text-lg font-medium">
                              {monthData.monthLabel}
                            </AccordionTrigger>
                            <AccordionContent>
                              <Accordion
                                type="multiple"
                                value={openWeeks}
                                onValueChange={setOpenWeeks}
                              >
                                {monthData.weeks.map(weekRow => {
                                  const [year, month, day] = weekRow.week_of.split('-').map(Number);
                                  const weekDate = new Date(year, month - 1, day);
                                  const weekLabel = weekDate.toLocaleDateString('en-US', { 
                                    weekday: 'short', 
                                    month: 'short', 
                                    day: 'numeric' 
                                  });

                                  const weekData = monthData.loadedWeekData.get(weekRow.week_of);
                                  const isPrefetched = prefetchedWeeks.has(weekRow.week_of);

                                  return (
                                    <AccordionItem key={weekRow.week_of} value={weekRow.week_of}>
                                      <AccordionTrigger
                                        onClick={() => onWeekExpand(yearData.year, monthData.monthKey, weekRow)}
                                        className="hover:no-underline"
                                      >
                                        <div className="flex items-center justify-between w-full">
                                          <div className="flex items-center gap-3">
                                            <span>Week of {weekLabel}</span>
                                            {weekRow.is_current_week && (
                                              <Badge variant="outline" className="text-xs">
                                                Current Week
                                              </Badge>
                                            )}
                                          </div>
                                          <div className="flex items-center gap-2">
                                            {getStatusBadge(weekRow)}
                                          </div>
                                        </div>
                                      </AccordionTrigger>
                                      <AccordionContent>
                                        {isPrefetched && weekData ? (
                                          weekData.length > 0 ? (
                                            <div className="space-y-3">
                                              {weekData.map((item, index) => (
                                                <Card key={index}>
                                                  <CardContent className="p-4">
                                                    <div className="flex items-center gap-4">
                                                      <Badge 
                                                        style={{ backgroundColor: getDomainColor(item.domain_name) }}
                                                        className="ring-1 ring-border/50 text-foreground"
                                                      >
                                                        {item.domain_name}
                                                      </Badge>
                                                      <div className="flex-1">
                                                        <p className="text-sm">{item.action_statement}</p>
                                                      </div>
                                                      <ConfPerfDelta confidence={item.confidence_score} performance={item.performance_score} />
                                                      <div className="flex items-center gap-1">
                                                        {item.confidence_score !== null && (
                                                          <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => handleDeleteScore(item.weekly_focus_id, 'confidence')}
                                                            className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                                                            title="Delete confidence score"
                                                          >
                                                            <Trash2 className="h-4 w-4" />
                                                          </Button>
                                                        )}
                                                        {item.performance_score !== null && (
                                                          <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => handleDeleteScore(item.weekly_focus_id, 'performance')}
                                                            className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                                                            title="Delete performance score"
                                                          >
                                                            <Trash2 className="h-4 w-4" />
                                                          </Button>
                                                        )}
                                                      </div>
                                                    </div>
                                                  </CardContent>
                                                </Card>
                                              ))}
                                            </div>
                                          ) : (
                                            <p className="text-muted-foreground py-4">No data for this week.</p>
                                          )
                                        ) : (
                                          <div className="space-y-3">
                                            {[...Array(3)].map((_, i) => (
                                              <Skeleton key={i} className="h-16 w-full" />
                                            ))}
                                          </div>
                                        )}
                                      </AccordionContent>
                                    </AccordionItem>
                                  );
                                })}
                              </Accordion>
                            </AccordionContent>
                          </AccordionItem>
                        ))}
                      </Accordion>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              ))}
            </>
          )}
        </TabsContent>

        <TabsContent value="quarterly-evals">
          {user && staffInfo && (
            <QuarterlyEvalsTab 
              staffId={staffInfo.id}
              staffInfo={staffInfo}
              currentUserId={user.id}
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
