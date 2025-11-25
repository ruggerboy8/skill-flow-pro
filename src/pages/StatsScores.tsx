import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/hooks/useAuth';
import { format, parseISO } from 'date-fns';
import { useStaffAllWeeklyScores } from '@/hooks/useStaffAllWeeklyScores';
import { RawScoreRow } from '@/types/coachV2';
import { getDomainColor } from '@/lib/domainColors';
import ConfPerfDelta from '@/components/ConfPerfDelta';
import { CalendarOff } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface MonthGroup {
  monthKey: string;
  monthLabel: string;
  weeks: Array<{
    weekOf: string;
    summary: any;
    scores: RawScoreRow[];
  }>;
}

interface YearGroup {
  year: number;
  months: MonthGroup[];
}

export default function StatsScores() {
  const [staffId, setStaffId] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [currentWeekOf, setCurrentWeekOf] = useState<string | null>(null);
  
  // Controlled accordion state
  const [openYears, setOpenYears] = useState<string[]>([]);
  const [openMonths, setOpenMonths] = useState<string[]>([]);
  const [openWeeks, setOpenWeeks] = useState<string[]>([]);
  
  const { user } = useAuth();

  useEffect(() => {
    if (user) {
      loadStaffId();
    }
  }, [user]);

  const loadStaffId = async () => {
    if (!user) return;

    const { data: staffRow } = await supabase
      .from('staff')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (staffRow) {
      console.log('[StatsScores] Staff ID loaded:', staffRow.id);
      setStaffId(staffRow.id);
    } else {
      console.warn('[StatsScores] No staff record found for user:', user?.id);
    }
  };

  const { weekSummaries, loading } = useStaffAllWeeklyScores({ staffId: staffId || undefined });

  console.log('[StatsScores] Hook state:', {
    loading,
    weekSummariesSize: weekSummaries.size,
    weekSummariesKeys: Array.from(weekSummaries.keys()),
    staffId
  });

  // Helper to get Monday of current week
  const mondayOf = (d: Date = new Date()): Date => {
    const day = d.getDay();
    const diff = (day === 0 ? -6 : 1) - day;
    const m = new Date(d);
    m.setDate(d.getDate() + diff);
    m.setHours(0, 0, 0, 0);
    return m;
  };

  useEffect(() => {
    const currentMonday = mondayOf(new Date()).toISOString().split('T')[0];
    setCurrentWeekOf(currentMonday);
  }, []);

  // Group weeks by year and month (filter future weeks)
  const groupedData = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    const yearMap = new Map<number, Map<string, MonthGroup>>();

    const sortedEntries = Array.from(weekSummaries.entries())
      .filter(([weekOf]) => new Date(weekOf) <= now)
      .sort((a, b) => new Date(b[0]).getTime() - new Date(a[0]).getTime());

    sortedEntries.forEach(([weekOf, summary]) => {
      const date = parseISO(weekOf);
      const year = date.getFullYear();
      const monthKey = format(date, 'yyyy-MM');
      const monthLabel = format(date, 'MMMM yyyy');

      if (!yearMap.has(year)) {
        yearMap.set(year, new Map());
      }

      const monthMap = yearMap.get(year)!;
      if (!monthMap.has(monthKey)) {
        monthMap.set(monthKey, {
          monthKey,
          monthLabel,
          weeks: [],
        });
      }

      monthMap.get(monthKey)!.weeks.push({
        weekOf,
        summary,
        scores: summary.scores,
      });
    });

    // Convert to array and sort
    const years: YearGroup[] = Array.from(yearMap.entries())
      .map(([year, monthMap]) => ({
        year,
        months: Array.from(monthMap.values()).sort((a, b) => b.monthKey.localeCompare(a.monthKey)),
      }))
      .sort((a, b) => b.year - a.year);

    console.log('[StatsScores] Grouped data computed:', {
      totalYears: years.length,
      totalWeeks: sortedEntries.length,
      yearsArray: years.map(y => ({ year: y.year, monthCount: y.months.length }))
    });

    return years;
  }, [weekSummaries]);

  useEffect(() => {
    if (groupedData.length > 0 && currentWeekOf) {
      // Auto-select most recent year
      setSelectedYear(groupedData[0].year);

      // Find current week and expand accordions
      const currentDate = parseISO(currentWeekOf);
      const currentYear = currentDate.getFullYear();
      const currentMonthKey = format(currentDate, 'yyyy-MM');

      const yKey = `year-${currentYear}`;
      const mKey = `month-${currentMonthKey}`;
      const wKey = `week-${currentWeekOf}`;

      setOpenYears([yKey]);
      setOpenMonths([mKey]);
      setOpenWeeks([wKey]);
    }
  }, [groupedData, currentWeekOf]);

  const filteredYears = selectedYear ? groupedData.filter(y => y.year === selectedYear) : groupedData;

  const jumpToCurrentWeek = () => {
    if (!currentWeekOf) return;
    
    const d = parseISO(currentWeekOf);
    const yKey = `year-${d.getFullYear()}`;
    const mKey = `month-${format(d, 'yyyy-MM')}`;
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

  // Status pill component
  function StatusPill({ hasAll, hasAnyLate, isExempt }: { hasAll: boolean; hasAnyLate: boolean; isExempt?: boolean }) {
    if (isExempt) {
      return <span className="text-muted-foreground">—</span>;
    }
    if (!hasAll) {
      return (
        <Badge variant="destructive" className="bg-red-100 text-red-800 border-red-200">
          Missing
        </Badge>
      );
    }
    if (hasAnyLate) {
      return (
        <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 border-yellow-200">
          Late
        </Badge>
      );
    }
    return (
      <Badge variant="secondary" className="bg-green-100 text-green-800 border-green-200">
        Complete
      </Badge>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">Loading scores...</div>
      </div>
    );
  }

  if (groupedData.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground">No score data available yet.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4 max-w-full overflow-x-hidden">
      {/* Jump Button */}
      <div className="flex items-center justify-end gap-4">
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
      {groupedData.length > 1 && (
        <Select value={selectedYear?.toString() || ""} onValueChange={(value) => setSelectedYear(parseInt(value))}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Select year" />
          </SelectTrigger>
          <SelectContent>
            {groupedData.map(y => (
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
                        {monthData.weeks.map(({ weekOf, summary, scores }) => {
                          const isExempt = scores.length > 0 && (scores[0] as RawScoreRow & { is_week_exempt?: boolean }).is_week_exempt;
                          const hasAllConf = summary.conf_count === summary.assignment_count;
                          const hasAllPerf = summary.perf_count === summary.assignment_count;
                          const isCurrentWeek = weekOf === currentWeekOf;

                          const weekDate = parseISO(weekOf);
                          const weekLabel = format(weekDate, 'EEE, MMM d');

                          return (
                            <AccordionItem 
                              key={weekOf} 
                              value={`week-${weekOf}`} 
                              className="border rounded" 
                              id={`week-${weekOf}`}
                            >
                              <AccordionTrigger className="px-3 py-2 text-sm hover:no-underline">
                                <div className="flex items-center justify-between w-full pr-4">
                                  <div className="flex items-center gap-3">
                                    <span className="font-medium">Week of {weekLabel}</span>
                                    {isCurrentWeek && (
                                      <Badge variant="outline" className="text-xs">Current Week</Badge>
                                    )}
                                    {isExempt && (
                                      <Badge variant="secondary" className="bg-amber-100 text-amber-800 border-amber-200 text-xs">
                                        <CalendarOff className="h-3 w-3 mr-1" />
                                        Exempt
                                      </Badge>
                                    )}
                                  </div>
                                  {!isExempt && (
                                    <div className="flex items-center gap-3">
                                      <div className="flex items-center gap-2">
                                        <span className="text-xs text-muted-foreground">Confidence:</span>
                                        <StatusPill hasAll={hasAllConf} hasAnyLate={summary.has_any_late} />
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <span className="text-xs text-muted-foreground">Performance:</span>
                                        <StatusPill hasAll={hasAllPerf} hasAnyLate={summary.has_any_late} />
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </AccordionTrigger>
                              
                              <AccordionContent className="px-3 pb-3">
                                {scores.length > 0 ? (
                                  <div className="space-y-2">
                                    {scores.map((score, index) => (
                                      <div
                                        key={index}
                                        className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/30 transition-colors"
                                      >
                                        <Badge 
                                          className="text-xs font-semibold ring-1 ring-border/50 text-black shrink-0"
                                          style={{ backgroundColor: getDomainColor(score.domain_name || 'General') }}
                                        >
                                          {score.domain_name || 'General'}
                                        </Badge>
                                        
                                        <span className="flex-1 text-sm">
                                          {score.action_statement || 'Pro Move'}
                                        </span>
                                        
                                        {score.self_select && (
                                          <Badge variant="outline" className="text-xs shrink-0">
                                            Self-Select
                                          </Badge>
                                        )}
                                        
                                        <ConfPerfDelta 
                                          confidence={score.confidence_score} 
                                          performance={score.performance_score} 
                                        />
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <p className="text-muted-foreground py-4 text-sm text-center">No data available</p>
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
        ))}
      </Accordion>
    </div>
  );
}
