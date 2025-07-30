import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { getDomainColor } from '@/lib/domainColors';

interface StaffInfo {
  id: string;
  name: string;
  role_name: string;
  role_id: number;
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
  const { isCoach } = useAuth();
  const [loading, setLoading] = useState(true);
  const [staffInfo, setStaffInfo] = useState<StaffInfo | null>(null);
  const [cycles, setCycles] = useState<CycleData[]>([]);
  const [selectedCycle, setSelectedCycle] = useState<number>(1);
  const [expandedWeeks, setExpandedWeeks] = useState<Set<string>>(new Set());

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
      // Get staff info
      const { data: staffData, error: staffError } = await supabase
        .from('staff')
        .select('id, name, role_id, roles!inner(role_name)')
        .eq('id', staffId)
        .single();

      if (staffError) throw staffError;
      if (!staffData) throw new Error('Staff member not found');

      const staff: StaffInfo = {
        id: staffData.id,
        name: staffData.name,
        role_name: (staffData.roles as any).role_name,
        role_id: staffData.role_id
      };

      setStaffInfo(staff);

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
          setSelectedCycle(Math.max(...uniqueCycles));
        }
      }
    } catch (error) {
      console.error('Error loading staff info:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadWeekData = async (cycle: number, week: number) => {
    if (!staffInfo) return;

    try {
      const { data: weekData, error } = await supabase.rpc('get_weekly_review', {
        p_cycle: cycle,
        p_week: week,
        p_role_id: staffInfo.role_id,
        p_staff_id: staffInfo.id
      });

      if (error) throw error;

      // Calculate missing scores
      const confMissing = (weekData || []).filter((item: WeekData) => item.confidence_score === null).length;
      const perfMissing = (weekData || []).filter((item: WeekData) => item.performance_score === null).length;

      setCycles(prev => prev.map(c => {
        if (c.cycle === cycle) {
          const newWeeks = new Map(c.weeks);
          newWeeks.set(week, {
            loaded: true,
            data: weekData || [],
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

  const getStatusBadge = (confMissing: number, perfMissing: number, totalItems: number) => {
    if (totalItems === 0) return null;
    if (confMissing === totalItems) {
      return null; // Grey - no badge shown
    } else if (perfMissing === totalItems) {
      return <Badge variant="outline" className="text-yellow-600 border-yellow-400">●</Badge>;
    } else if (confMissing === 0 && perfMissing === 0) {
      return <Badge variant="outline" className="text-green-600 border-green-400">✓</Badge>;
    } else {
      return <Badge variant="outline" className="text-yellow-600 border-yellow-400">●</Badge>;
    }
  };

  const getRowHighlight = (confidence: number | null, performance: number | null) => {
    if (confidence !== null && confidence <= 2) {
      return 'bg-orange-50';
    }
    if (confidence !== null && performance !== null && (performance - confidence) >= 1) {
      return 'bg-teal-50';
    }
    return '';
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

  const currentCycle = cycles.find(c => c.cycle === selectedCycle);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-4">
        <h1 className="text-3xl font-bold">{staffInfo.role_name} · {staffInfo.name}</h1>
        
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
      </div>

      {/* Week Accordion */}
      {currentCycle && (
        <Accordion type="multiple" value={Array.from(expandedWeeks)}>
          {[1, 2, 3, 4, 5, 6].map(week => {
            const weekData = currentCycle.weeks.get(week);
            const cycleWeekKey = `${selectedCycle}-${week}`;

            return (
              <AccordionItem key={week} value={cycleWeekKey}>
                <AccordionTrigger 
                  onClick={() => handleWeekExpand(cycleWeekKey)}
                  className="hover:no-underline"
                >
                  <div className="flex items-center gap-3 w-full">
                    <span>Week {week}</span>
                    {weekData && weekData.loaded && 
                      getStatusBadge(weekData.confMissing, weekData.perfMissing, weekData.data.length)
                    }
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  {weekData?.loaded ? (
                    weekData.data.length > 0 ? (
                      <div className="space-y-3">
                        {weekData.data.map((item, index) => (
                          <Card 
                            key={index} 
                            className={`${getRowHighlight(item.confidence_score, item.performance_score)}`}
                          >
                            <CardContent className="p-4">
                              <div className="flex items-center gap-4">
                                <Badge 
                                  style={{ backgroundColor: getDomainColor(item.domain_name) }}
                                  className="text-gray-800 border-0"
                                >
                                  {item.domain_name}
                                </Badge>
                                <div className="flex-1">
                                  <p className="text-sm">{item.action_statement}</p>
                                </div>
                                <div className="flex gap-4 text-sm">
                                  <div>
                                    <span className="text-muted-foreground">Conf: </span>
                                    <span className="font-medium">
                                      {item.confidence_score ?? '-'}
                                    </span>
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground">Perf: </span>
                                    <span className="font-medium">
                                      {item.performance_score ?? '-'}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    ) : (
                      <p className="text-muted-foreground py-4">No Pro-Moves scheduled for this week.</p>
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
    </div>
  );
}