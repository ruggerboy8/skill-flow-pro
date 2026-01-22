import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/hooks/useAuth';
import { useStaffProfile } from '@/hooks/useStaffProfile';
import { useSim } from '@/devtools/SimProvider';
import { format, parseISO, isBefore, startOfDay } from 'date-fns';
import { useMyWeeklyScores } from '@/hooks/useMyWeeklyScores';
import { RawScoreRow } from '@/types/coachV2';
import { getDomainColorRich } from '@/lib/domainColors';
import ConfPerfDelta from '@/components/ConfPerfDelta';
import { Trash2, Tag, History, Wrench } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';

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

function StatusPill({ hasAll, hasAnyLate, isExempt }: { hasAll: boolean; hasAnyLate: boolean; isExempt?: boolean }) {
  if (isExempt) return <span className="text-muted-foreground text-xs">—</span>;
  if (!hasAll) return <Badge variant="destructive" className="h-5 px-1.5 text-[10px]">Missing</Badge>;
  if (hasAnyLate) return <Badge className="h-5 px-1.5 text-[10px] bg-yellow-100 text-yellow-800 hover:bg-yellow-100">Late</Badge>;
  return <Badge className="h-5 px-1.5 text-[10px] bg-green-100 text-green-800 hover:bg-green-100">Done</Badge>;
}

export default function ScoreHistoryV2() {
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [currentWeekOf, setCurrentWeekOf] = useState<string | null>(null);
  const [openMonths, setOpenMonths] = useState<string[]>([]);
  const [openWeeks, setOpenWeeks] = useState<string[]>([]);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingWeek, setDeletingWeek] = useState<string | null>(null);
  const [retiredActionIds, setRetiredActionIds] = useState<Set<number>>(new Set());
  
  const { isSuperAdmin } = useAuth();
  const { overrides } = useSim();
  const { data: staffProfile } = useStaffProfile({ redirectToSetup: false, showErrorToast: false });
  const isMasquerading = overrides.enabled && overrides.masqueradeStaffId;
  const staffId = staffProfile?.id || null;
  const { weekSummaries, loading } = useMyWeeklyScores({ 
    weekOf: null,
    staffId: isMasquerading ? staffId : undefined
  });
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  // Check if backfill is currently enabled
  const hasActiveBackfill = staffProfile?.allow_backfill_until && 
    new Date(staffProfile.allow_backfill_until) > new Date();

  // Fetch retired status for all action_ids in score history
  useEffect(() => {
    const fetchRetiredStatus = async () => {
      // Collect all unique action_ids from all scores
      const allActionIds = new Set<number>();
      weekSummaries.forEach((summary) => {
        summary.scores.forEach((score: RawScoreRow) => {
          if (score.action_id) allActionIds.add(score.action_id);
        });
      });

      if (allActionIds.size === 0) return;

      const { data } = await supabase
        .from('pro_moves')
        .select('action_id')
        .in('action_id', Array.from(allActionIds))
        .eq('active', false);

      if (data) {
        setRetiredActionIds(new Set(data.map(d => d.action_id)));
      }
    };

    if (!loading && weekSummaries.size > 0) {
      fetchRetiredStatus();
    }
  }, [loading, weekSummaries]);

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

    const years: YearGroup[] = Array.from(yearMap.entries())
      .map(([year, monthMap]) => ({
        year,
        months: Array.from(monthMap.values()).sort((a, b) => b.monthKey.localeCompare(a.monthKey)),
      }))
      .sort((a, b) => b.year - a.year);

    return years;
  }, [weekSummaries]);

  useEffect(() => {
    if (groupedData.length > 0 && currentWeekOf) {
      const currentDate = parseISO(currentWeekOf);
      const currentMonthKey = format(currentDate, 'yyyy-MM');
      const mKey = `month-${currentMonthKey}`;
      const wKey = `week-${currentWeekOf}`;
      setOpenMonths([mKey]);
      setOpenWeeks([wKey]);
    }
  }, [groupedData, currentWeekOf]);

  const filteredYears = selectedYear ? groupedData.filter(y => y.year === selectedYear) : groupedData;

  const jumpToCurrentWeek = () => {
    if (!currentWeekOf) return;
    const d = parseISO(currentWeekOf);
    const mKey = `month-${format(d, 'yyyy-MM')}`;
    const wKey = `week-${currentWeekOf}`;
    setOpenMonths([mKey]);
    setOpenWeeks([wKey]);
    setTimeout(() => {
      const element = document.getElementById(wKey);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 100);
  };

  const handleDeleteWeek = async () => {
    if (!deletingWeek || !staffId) return;
    try {
      const { error } = await supabase.from('weekly_scores').delete().eq('staff_id', staffId).eq('week_of', deletingWeek);
      if (error) throw error;
      toast({ title: 'Scores deleted', description: `All scores deleted.` });
      queryClient.invalidateQueries({ queryKey: ['weekly-scores'] });
      queryClient.invalidateQueries({ queryKey: ['my-weekly-scores'] });
    } catch (error) {
      console.error('Error deleting scores:', error);
      toast({ title: 'Error', description: 'Failed to delete scores.', variant: 'destructive' });
    } finally {
      setDeleteDialogOpen(false);
      setDeletingWeek(null);
    }
  };

  const openDeleteDialog = (weekOf: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeletingWeek(weekOf);
    setDeleteDialogOpen(true);
  };

  if (loading) {
    return (
      <Card className="border-0 md:border rounded-none md:rounded-xl shadow-none md:shadow-sm bg-transparent md:bg-card">
        <CardContent className="py-12">
          <div className="flex items-center justify-center text-muted-foreground">Loading scores...</div>
        </CardContent>
      </Card>
    );
  }

  if (groupedData.length === 0) {
    return (
      <Card className="border-0 md:border rounded-none md:rounded-xl shadow-none md:shadow-sm bg-transparent md:bg-card">
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground">No score data available yet.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-0 md:border rounded-none md:rounded-xl shadow-none md:shadow-sm bg-transparent md:bg-card">
      <CardHeader className="pb-3 px-0 md:px-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <History className="w-5 h-5" />
            Score History
          </CardTitle>
          
          <div className="flex items-center gap-2">
            {groupedData.length > 1 && (
              <Select value={selectedYear?.toString() || ""} onValueChange={(value) => setSelectedYear(parseInt(value))}>
                <SelectTrigger className="w-24 h-8 text-xs">
                  <SelectValue placeholder="Year" />
                </SelectTrigger>
                <SelectContent>
                  {groupedData.map(y => (
                    <SelectItem key={y.year} value={y.year.toString()}>{y.year}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            
            {currentWeekOf && (
              <Button variant="outline" size="sm" onClick={jumpToCurrentWeek} className="h-8 text-xs">
                Current
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="pt-0 px-0 md:px-6">
        <div className="space-y-1">
          {filteredYears.map((yearData) => (
            <div key={yearData.year} className="relative">
              {/* Sticky Year Header */}
              <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border/50 py-2 px-1 -mx-1">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  {yearData.year}
                </span>
              </div>
              
              {/* Month Accordions */}
              <Accordion type="multiple" value={openMonths} onValueChange={setOpenMonths} className="space-y-2 pt-2">
                {yearData.months.map((monthData) => (
                  <AccordionItem key={monthData.monthKey} value={`month-${monthData.monthKey}`} className="border-0 rounded-lg">
                    <AccordionTrigger className="px-2 py-2 text-sm hover:no-underline hover:bg-muted/50 rounded-lg -mx-1 px-3">
                      <span className="font-semibold">{format(parseISO(monthData.monthKey + '-01'), 'MMMM')}</span>
                    </AccordionTrigger>
                    
                    <AccordionContent className="pb-2 pt-1">
                      <Accordion type="multiple" value={openWeeks} onValueChange={setOpenWeeks} className="space-y-2">
                        {monthData.weeks.map(({ weekOf, summary, scores }) => {
                          const isExempt = scores.length > 0 && (scores[0] as any).is_week_exempt;
                          const hasAllConf = summary.conf_count === summary.assignment_count;
                          const hasAllPerf = summary.perf_count === summary.assignment_count;
                          const isCurrentWeek = weekOf === currentWeekOf;
                          const weekLabel = format(parseISO(weekOf), 'MMM d');
                          
                          // Check if this week is in the past (not current week)
                          const weekDate = parseISO(weekOf);
                          const isPastWeek = isBefore(weekDate, startOfDay(new Date())) && !isCurrentWeek;
                          
                          // Show backfill button if: user has backfill permission, week is in the past, and confidence is missing
                          const canBackfillConfidence = hasActiveBackfill && isPastWeek && !hasAllConf && !isExempt;

                          return (
                            <AccordionItem 
                              key={weekOf} 
                              value={`week-${weekOf}`} 
                              className="border rounded-lg bg-card shadow-sm" 
                              id={`week-${weekOf}`}
                            >
                              <AccordionTrigger className="px-2 md:px-3 py-2 text-sm hover:no-underline">
                                <div className="flex flex-col gap-1.5 w-full text-left">
                                  {/* Top Row: Date & Main Badges */}
                                  <div className="flex items-center justify-between w-full pr-2">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="font-bold text-sm">Week of {weekLabel}</span>
                                      {isCurrentWeek && (
                                        <Badge variant="default" className="text-[10px] h-5 px-1.5">Current</Badge>
                                      )}
                                      {isExempt && (
                                        <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 text-[10px] h-5 px-1.5">Exempt</Badge>
                                      )}
                                    </div>
                                    {isSuperAdmin && scores.length > 0 && (
                                      <Button 
                                        variant="ghost" 
                                        size="icon" 
                                        className="h-6 w-6 text-muted-foreground hover:text-destructive" 
                                        onClick={(e) => openDeleteDialog(weekOf, e)}
                                      >
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </Button>
                                    )}
                                  </div>

                                  {/* Bottom Row: Status Summary */}
                                  {!isExempt && (
                                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                                      <div className="flex items-center gap-1.5">
                                        <span>Conf:</span>
                                        {canBackfillConfidence ? (
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            className="h-5 px-2 text-[10px] border-blue-300 text-blue-700 hover:bg-blue-100 dark:border-blue-700 dark:text-blue-300 dark:hover:bg-blue-900"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              navigate(`/confidence/current/step/1?mode=repair&weekOf=${weekOf}`);
                                            }}
                                          >
                                            <Wrench className="h-3 w-3 mr-1" />
                                            Backfill
                                          </Button>
                                        ) : (
                                          <StatusPill hasAll={hasAllConf} hasAnyLate={summary.has_any_late} />
                                        )}
                                      </div>
                                      <div className="flex items-center gap-1.5">
                                        <span>Perf:</span>
                                        <StatusPill hasAll={hasAllPerf} hasAnyLate={summary.has_any_late} />
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </AccordionTrigger>
                              
                              <AccordionContent className="px-2 md:px-3 pb-3 pt-1 border-t">
                                {scores.length > 0 ? (
                                  <div className="space-y-2 pt-2">
                                    {scores.map((score, index) => {
                                      const domainColor = getDomainColorRich(score.domain_name || 'General');
                                      const isRetired = score.action_id ? retiredActionIds.has(score.action_id) : false;
                                      return (
                                        <div 
                                          key={index} 
                                          className={`flex overflow-hidden rounded-lg border border-border/50 bg-muted/20 ${isRetired ? 'opacity-70' : ''}`}
                                        >
                                          {/* Mini Spine */}
                                          <div 
                                            className="w-1.5 flex-shrink-0 rounded-l-lg"
                                            style={{ backgroundColor: domainColor }}
                                          />
                                          
                                          {/* Content */}
                                          <div className="flex-1 p-2 md:p-3 min-w-0">
                                            {/* Row 1: Domain & Score Delta */}
                                            <div className="flex items-start justify-between gap-2">
                                              <div className="flex items-center gap-2 flex-wrap">
                                                <span 
                                                  className="text-[10px] font-semibold uppercase"
                                                  style={{ color: domainColor }}
                                                >
                                                  {score.domain_name || 'General'}
                                                </span>
                                                {score.self_select && (
                                                  <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                                    <Tag className="w-3 h-3" />
                                                    <span>Self-Select</span>
                                                  </div>
                                                )}
                                                {isRetired && (
                                                  <Badge 
                                                    variant="outline" 
                                                    className="text-[9px] h-4 px-1 text-muted-foreground border-muted-foreground/30"
                                                  >
                                                    Retired
                                                  </Badge>
                                                )}
                                              </div>
                                              
                                              <div className="scale-90 origin-right shrink-0">
                                                <ConfPerfDelta 
                                                  confidence={score.confidence_score}
                                                  performance={score.performance_score} 
                                                />
                                              </div>
                                            </div>

                                            {/* Row 2: Action Statement */}
                                            <p className="text-sm leading-snug text-foreground/90 mt-1">
                                              {score.action_statement || 'Pro Move'}
                                            </p>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                ) : (
                                  <p className="text-muted-foreground py-4 text-sm text-center italic">No scores recorded.</p>
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
            </div>
          ))}
        </div>
      </CardContent>

      {/* Delete Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete scores?</AlertDialogTitle>
            <AlertDialogDescription>
              Permanently delete all scores for <strong>{deletingWeek && format(parseISO(deletingWeek), 'MMM d')}</strong>?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteWeek} className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
