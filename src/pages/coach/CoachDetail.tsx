import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { getDomainColor } from '@/lib/domainColors';
import ConfPerfDelta from '@/components/ConfPerfDelta';
import { QuarterlyEvalsTab } from '@/components/coach/QuarterlyEvalsTab';
import { getLocationWeekContext } from '@/lib/locationState';

interface StaffInfo {
  id: string;
  name: string;
  role_name: string;
  role_id: number;
  location_id?: string;
}

interface WeekData {
  domain_name: string;
  action_statement: string;
  confidence_score: number | null;
  performance_score: number | null;
}

interface CycleData {
  cycle: number;
  weeks: Map<number, {
    loaded: boolean;
    data: WeekData[];
    confMissing: number;
    perfMissing: number;
  }>;
}

export default function CoachDetail() {
  const { staffId } = useParams<{ staffId: string }>();
  const navigate = useNavigate();
  const { isCoach, user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [staffInfo, setStaffInfo] = useState<StaffInfo | null>(null);
  const [cycles, setCycles] = useState<CycleData[]>([]);
  const [selectedCycle, setSelectedCycle] = useState<number>(1);
  const [expandedWeeks, setExpandedWeeks] = useState<Set<string>>(new Set());
  const [currentCycle, setCurrentCycle] = useState<number | null>(null);
  const [currentWeek, setCurrentWeek] = useState<number | null>(null);

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

  useEffect(() => {
    // Load week data when cycle changes
    if (staffInfo && selectedCycle) {
      loadAllWeeksForCycle(selectedCycle, staffInfo.role_id, staffInfo.id);
    }
  }, [selectedCycle, staffInfo]);

  const loadStaffInfo = async () => {
    if (!staffId) return;

    try {
      // Get staff info
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

      // Get current cycle/week context for this staff
      if (staff.location_id) {
        const ctx = await getLocationWeekContext(staff.location_id, new Date());
        setCurrentCycle(ctx.cycleNumber);
        setCurrentWeek(ctx.weekInCycle);
      }

      // Get available cycles
      const { data: cycleData } = await supabase
        .from('weekly_focus')
        .select('cycle')
        .eq('role_id', staff.role_id)
        .order('cycle');

      if (cycleData) {
        const uniqueCycles = [...new Set(cycleData.map(c => c.cycle))];
        const cyclesWithWeeks: CycleData[] = uniqueCycles.map(cycle => ({
          cycle,
          weeks: new Map([1, 2, 3, 4, 5, 6].map(week => [week, {
            loaded: false,
            data: [],
            confMissing: 0,
            perfMissing: 0
          }]))
        }));

        setCycles(cyclesWithWeeks);
        if (uniqueCycles.length > 0) {
          // Use smart default: staff's last progress cycle, fallback to latest available
          let defaultCycle = Math.max(...uniqueCycles);
          
          try {
            console.log('Attempting to get last progress week for staff:', staff.id);
            const { data: progressData } = await supabase.rpc('get_last_progress_week', {
              p_staff_id: staff.id
            });
            
            console.log('Progress data received:', progressData);
            
            if (progressData?.[0]?.last_cycle) {
              defaultCycle = progressData[0].last_cycle;
              console.log('Using progress cycle as default:', defaultCycle);
            } else {
              console.log('No progress data, using latest cycle:', defaultCycle);
            }
          } catch (error) {
            console.log('Could not get progress data, using latest cycle:', error); 
          }
          
          console.log('Setting selected cycle to:', defaultCycle);
          setSelectedCycle(defaultCycle);
          // Load all week data for the selected cycle immediately
          loadAllWeeksForCycle(defaultCycle, staff.role_id, staff.id);
        }
      }
    } catch (error) {
      console.error('Error loading staff info:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadAllWeeksForCycle = async (cycle: number, roleId: number, staffId: string) => {
    // Load all 6 weeks for the cycle
    for (let week = 1; week <= 6; week++) {
      try {
        // Skip RPC for current week, use fallback directly
        const isCurrentWeek = cycle === currentCycle && week === currentWeek;
        
        if (!isCurrentWeek) {
          // Try RPC first for historical weeks
          const { data: weekData, error } = await supabase.rpc('get_weekly_review', {
            p_cycle: cycle,
            p_week: week,
            p_role_id: roleId,
            p_staff_id: staffId
          });

          if (!error && weekData && weekData.length) {
            // Calculate missing scores
            const confMissing = weekData.filter((item: WeekData) => item.confidence_score === null).length;
            const perfMissing = weekData.filter((item: WeekData) => item.performance_score === null).length;

            setCycles(prev => prev.map(c => {
              if (c.cycle === cycle) {
                const newWeeks = new Map(c.weeks);
                newWeeks.set(week, {
                  loaded: true,
                  data: weekData,
                  confMissing,
                  perfMissing
                });
                return { ...c, weeks: newWeeks };
              }
              return c;
            }));
            continue; // Skip fallback for this week
          }
        }

        // Fallback logic (same as loadWeekData)
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
          .eq('role_id', roleId)
          .order('display_order');

        const focusIds = (focus ?? []).map((f: any) => f.id);

        // Get user selections
        const { data: userSelections } = await supabase
          .from('weekly_self_select')
          .select(`
            weekly_focus_id,
            selected_pro_move_id,
            pro_moves(action_statement, competency_id)
          `)
          .eq('user_id', staffId)
          .in('weekly_focus_id', focusIds);

        const selectionsMap: Record<string, any> = {};
        (userSelections ?? []).forEach((sel: any) => {
          selectionsMap[sel.weekly_focus_id] = sel;
        });

        // Map competency -> domain
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

        // Get existing scores
        let scoreMap: Record<string, { confidence_score: number|null, performance_score: number|null }> = {};
        if (focusIds.length) {
          const { data: scores } = await supabase
            .from('weekly_scores')
            .select('weekly_focus_id, confidence_score, performance_score')
            .eq('staff_id', staffId)
            .in('weekly_focus_id', focusIds);
          (scores ?? []).forEach((s: any) => {
            scoreMap[s.weekly_focus_id] = {
              confidence_score: s.confidence_score,
              performance_score: s.performance_score
            };
          });
        }

        // Build view rows
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

        // Calculate missing scores
        const confMissing = rows.filter((item: WeekData) => item.confidence_score === null).length;
        const perfMissing = rows.filter((item: WeekData) => item.performance_score === null).length;

        setCycles(prev => prev.map(c => {
          if (c.cycle === cycle) {
            const newWeeks = new Map(c.weeks);
            newWeeks.set(week, {
              loaded: true,
              data: rows,
              confMissing,
              perfMissing
            });
            return { ...c, weeks: newWeeks };
          }
          return c;
        }));

      } catch (error) {
        console.error(`Error loading week ${week} data:`, error);
      }
    }
  };

  const loadWeekData = async (cycle: number, week: number) => {
    if (!staffInfo) return;

    try {
      // Skip RPC for current week (shows "no pro moves" issue), use fallback directly
      const isCurrentWeek = cycle === currentCycle && week === currentWeek;
      
      if (!isCurrentWeek) {
        // Try RPC first for historical weeks (works fine when scores exist)
        const { data: weekData, error } = await supabase.rpc('get_weekly_review', {
          p_cycle: cycle,
          p_week: week,
          p_role_id: staffInfo.role_id,
          p_staff_id: staffInfo.id
        });

        if (!error && weekData && weekData.length) {
          // Calculate missing scores
          const confMissing = weekData.filter((item: WeekData) => item.confidence_score === null).length;
          const perfMissing = weekData.filter((item: WeekData) => item.performance_score === null).length;

          setCycles(prev => prev.map(c => {
            if (c.cycle === cycle) {
              const newWeeks = new Map(c.weeks);
              newWeeks.set(week, {
                loaded: true,
                data: weekData,
                confMissing,
                perfMissing
              });
              return { ...c, weeks: newWeeks };
            }
            return c;
          }));
          return;
        }
      }

      // Fallback: compose from weekly_focus + optional scores (same logic as StatsScores)
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
        .eq('role_id', staffInfo.role_id)
        .order('display_order');

      const focusIds = (focus ?? []).map((f: any) => f.id);

      // Get user selections for self-select items
      const { data: userSelections } = await supabase
        .from('weekly_self_select')
        .select(`
          weekly_focus_id,
          selected_pro_move_id,
          pro_moves(action_statement, competency_id)
        `)
        .eq('user_id', staffInfo.id) // Use staff ID for coach view
        .in('weekly_focus_id', (focus ?? []).map((f: any) => f.id));

      const selectionsMap: Record<string, any> = {};
      (userSelections ?? []).forEach((sel: any) => {
        selectionsMap[sel.weekly_focus_id] = sel;
      });

      // Map competency -> domain name
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

      // Overlay any existing scores
      let scoreMap: Record<string, { confidence_score: number|null, performance_score: number|null }> = {};
      if (focusIds.length) {
        const { data: scores } = await supabase
          .from('weekly_scores')
          .select('weekly_focus_id, confidence_score, performance_score')
          .eq('staff_id', staffInfo.id)
          .in('weekly_focus_id', focusIds);
        (scores ?? []).forEach((s: any) => {
          scoreMap[s.weekly_focus_id] = {
            confidence_score: s.confidence_score,
            performance_score: s.performance_score
          };
        });
      }

      // Build view rows
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

      // Calculate missing scores
      const confMissing = rows.filter((item: WeekData) => item.confidence_score === null).length;
      const perfMissing = rows.filter((item: WeekData) => item.performance_score === null).length;

      setCycles(prev => prev.map(c => {
        if (c.cycle === cycle) {
          const newWeeks = new Map(c.weeks);
          newWeeks.set(week, {
            loaded: true,
            data: rows,
            confMissing,
            perfMissing
          });
          return { ...c, weeks: newWeeks };
        }
        return c;
      }));

    } catch (error) {
      console.error('Error loading week data:', error);
    }
  };

  const handleWeekExpand = (cycleWeekKey: string) => {
    const [cycleStr, weekStr] = cycleWeekKey.split('-');
    const cycle = parseInt(cycleStr);
    const week = parseInt(weekStr);

    setExpandedWeeks(prev => {
      const newSet = new Set(prev);
      if (newSet.has(cycleWeekKey)) {
        newSet.delete(cycleWeekKey);
      } else {
        newSet.add(cycleWeekKey);
        // Load data if not already loaded
        const cycleData = cycles.find(c => c.cycle === cycle);
        const weekData = cycleData?.weeks.get(week);
        if (weekData && !weekData.loaded) {
          loadWeekData(cycle, week);
        }
      }
      return newSet;
    });
  };

  const getStatusBadge = (rows: any[] | null) => {
    const total = rows?.length || 0;
    if (total === 0) return null;
    const confCount = (rows || []).filter(r => r.confidence_score !== null).length;
    const perfCount = (rows || []).filter(r => r.performance_score !== null).length;
    if (confCount === 0) return null; // Grey
    if (perfCount === total) return <Badge variant="outline" className="text-green-600 border-green-400">✓</Badge>;
    if (confCount === total && perfCount < total) return <Badge variant="outline" className="text-yellow-600 border-yellow-400">●</Badge>;
    return null;
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

  const selectedCycleData = cycles.find(c => c.cycle === selectedCycle);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => navigate(-1)}
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
          <Select value={selectedCycle.toString()} onValueChange={(value) => setSelectedCycle(parseInt(value))}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {cycles.map(cycle => (
                <SelectItem key={cycle.cycle} value={cycle.cycle.toString()}>
                  Cycle {cycle.cycle}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Week Accordion */}
          {selectedCycleData && (
            <Accordion type="multiple" value={Array.from(expandedWeeks)}>
              {[1, 2, 3, 4, 5, 6].map(week => {
                const weekData = selectedCycleData.weeks.get(week);
                const cycleWeekKey = `${selectedCycle}-${week}`;

                return (
                  <AccordionItem key={week} value={cycleWeekKey}>
                    <AccordionTrigger 
                      onClick={() => handleWeekExpand(cycleWeekKey)}
                      className="hover:no-underline"
                    >
                      <div className="flex items-center justify-between w-full">
                        <div className="flex items-center gap-3">
                          <span>Week {week}</span>
                          {/* Current Week Pill */}
                          {selectedCycle === currentCycle && week === currentWeek && (
                            <Badge variant="outline" className="text-xs">
                              Current Week
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {weekData && weekData.loaded && 
                            getStatusBadge(weekData.data)
                          }
                        </div>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      {weekData?.loaded ? (
                        weekData.data.length > 0 ? (
                          <div className="space-y-3">
                            {weekData.data.map((item, index) => (
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
                                  </div>
                                </CardContent>
                              </Card>
                            ))}
                          </div>
                        ) : (
                          <p className="text-muted-foreground py-4">Loading...</p>
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
          )}

          {cycles.length === 0 && (
            <Card>
              <CardContent className="py-16 text-center">
                <p className="text-muted-foreground">No cycles found for this staff member.</p>
              </CardContent>
            </Card>
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