import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { getDomainColor } from '@/lib/domainColors';

interface WeekData {
  domain_name: string;
  action_statement: string;
  confidence_score: number | null;
  performance_score: number | null;
}

interface CycleData {
  cycle: number;
  weeks: Map<number, WeekData[]>;
  hasAnyConfidence: boolean;
}

export default function StatsScores() {
  const [cycles, setCycles] = useState<CycleData[]>([]);
  const [loading, setLoading] = useState(true);
  const [staffData, setStaffData] = useState<{ id: string; role_id: number } | null>(null);
  const { user } = useAuth();

  useEffect(() => {
    if (user) {
      loadStaffData();
    }
  }, [user]);

  useEffect(() => {
    if (staffData) {
      loadCycleData();
    }
  }, [staffData]);

  const loadStaffData = async () => {
    if (!user) return;

    const { data } = await supabase
      .from('staff')
      .select('id, role_id')
      .eq('user_id', user.id)
      .single();

    if (data) {
      setStaffData(data);
    }
  };

  const loadCycleData = async () => {
    if (!staffData) return;

    try {
      // Get all cycles that have weekly_focus data for this role
      const { data: cycleData } = await supabase
        .from('weekly_focus')
        .select('cycle')
        .eq('role_id', staffData.role_id)
        .order('cycle');

      if (!cycleData) return;

      const uniqueCycles = [...new Set(cycleData.map(c => c.cycle))];
      const cyclesWithData: CycleData[] = [];

      for (const cycle of uniqueCycles) {
        // Check if this cycle has any confidence scores
        const { data: confidenceCheck } = await supabase
          .from('weekly_scores')
          .select('confidence_score, weekly_focus!inner(cycle)')
          .eq('staff_id', staffData.id)
          .eq('weekly_focus.cycle', cycle)
          .not('confidence_score', 'is', null);

        const hasAnyConfidence = (confidenceCheck?.length || 0) > 0;

        // Get all weeks for this cycle
        const { data: weeksData } = await supabase
          .from('weekly_focus')
          .select('week_in_cycle')
          .eq('role_id', staffData.role_id)
          .eq('cycle', cycle)
          .order('week_in_cycle');

        const weeks = new Map<number, WeekData[]>();
        
        if (weeksData) {
          const uniqueWeeks = [...new Set(weeksData.map(w => w.week_in_cycle))];
          
          for (const week of uniqueWeeks) {
            weeks.set(week, []);
          }
        }

        cyclesWithData.push({
          cycle,
          weeks,
          hasAnyConfidence
        });
      }

      setCycles(cyclesWithData);
    } catch (error) {
      console.error('Error loading cycle data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadWeekData = async (cycle: number, week: number): Promise<WeekData[]> => {
    if (!staffData) return [];

    try {
      const { data } = await supabase.rpc('get_weekly_review', {
        p_cycle: cycle,
        p_week: week,
        p_role_id: staffData.role_id,
        p_staff_id: staffData.id
      });

      return data || [];
    } catch (error) {
      console.error('Error loading week data:', error);
      return [];
    }
  };

  const hasWeekConfidence = async (cycle: number, week: number): Promise<boolean> => {
    if (!staffData) return false;

    const { data } = await supabase
      .from('weekly_scores')
      .select('confidence_score, weekly_focus!inner(cycle, week_in_cycle)')
      .eq('staff_id', staffData.id)
      .eq('weekly_focus.cycle', cycle)
      .eq('weekly_focus.week_in_cycle', week)
      .not('confidence_score', 'is', null)
      .single();

    return !!data;
  };

  const onWeekExpand = async (cycleIndex: number, week: number) => {
    const cycle = cycles[cycleIndex];
    if (!cycle) return;

    const weekData = await loadWeekData(cycle.cycle, week);
    
    setCycles(prev => {
      const updated = [...prev];
      updated[cycleIndex].weeks.set(week, weekData);
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

  if (cycles.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground">No score data available yet.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Accordion type="multiple" className="space-y-4">
        {cycles.map((cycle, cycleIndex) => (
          <AccordionItem
            key={cycle.cycle}
            value={`cycle-${cycle.cycle}`}
            className="border rounded-lg"
          >
            <AccordionTrigger 
              className={`px-4 sticky top-0 bg-white z-10 ${!cycle.hasAnyConfidence ? 'opacity-50 cursor-not-allowed' : ''}`}
              disabled={!cycle.hasAnyConfidence}
            >
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-semibold">Cycle {cycle.cycle}</h3>
                {!cycle.hasAnyConfidence && (
                  <span className="text-sm text-muted-foreground">Complete Week 1 confidence to unlock</span>
                )}
              </div>
            </AccordionTrigger>
            
            {cycle.hasAnyConfidence && (
              <AccordionContent className="px-4 pb-4">
                <Accordion type="multiple" className="space-y-2">
                  {Array.from(cycle.weeks.keys()).map(week => (
                    <WeekAccordion
                      key={week}
                      cycle={cycle.cycle}
                      week={week}
                      staffData={staffData}
                      onExpand={() => onWeekExpand(cycleIndex, week)}
                      weekData={cycle.weeks.get(week) || []}
                    />
                  ))}
                </Accordion>
              </AccordionContent>
            )}
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}

interface WeekAccordionProps {
  cycle: number;
  week: number;
  staffData: { id: string; role_id: number } | null;
  onExpand: () => void;
  weekData: WeekData[];
}

function WeekAccordion({ cycle, week, staffData, onExpand, weekData }: WeekAccordionProps) {
  const [hasConfidence, setHasConfidence] = useState<boolean | null>(null);
  const [hasPerformance, setHasPerformance] = useState<boolean | null>(null);

  useEffect(() => {
    checkConfidence();
  }, [cycle, week, staffData]);

  const checkConfidence = async () => {
    if (!staffData) return;

    const { data, error } = await supabase
      .from('weekly_scores')
      .select('confidence_score, performance_score, weekly_focus!inner(cycle, week_in_cycle)')
      .eq('staff_id', staffData.id)
      .eq('weekly_focus.cycle', cycle)
      .eq('weekly_focus.week_in_cycle', week);

    if (error) {
      console.error(error);
      return;
    }

    if (!data || data.length === 0) {
      setHasConfidence(false);
      setHasPerformance(false);
      return;
    }

    // Check if ALL items have confidence scores
    const allHaveConfidence = data.every(r => r.confidence_score !== null);
    // Check if ALL items have performance scores  
    const allHavePerformance = data.every(r => r.performance_score !== null);
    // Check if ANY items have confidence scores
    const someHaveConfidence = data.some(r => r.confidence_score !== null);
    // Check if ANY items have performance scores
    const someHavePerformance = data.some(r => r.performance_score !== null);

    // hasConfidence = true if at least some confidence scores exist (to show the week)
    setHasConfidence(someHaveConfidence);
    // hasPerformance = true only if ALL items are completely done (confidence + performance)
    setHasPerformance(allHaveConfidence && allHavePerformance);
  };

  const handleExpand = () => {
    if (hasConfidence && weekData.length === 0) {
      onExpand();
    }
  };

  if (hasConfidence === null) {
    return <div className="h-12 bg-gray-100 animate-pulse rounded" />;
  }

  const getStatusBadge = () => {
    if (hasConfidence && hasPerformance) {
      // Both completed - green checkmark
      return <span className="text-green-600 text-lg font-bold">✓</span>;
    } else if (hasConfidence || hasPerformance) {
      // In progress - yellow dot
      return <span className="text-yellow-600 text-lg font-bold">●</span>;
    }
    // Not started - nothing
    return null;
  };

  return (
    <AccordionItem value={`week-${cycle}-${week}`} className="border rounded">
      <AccordionTrigger 
        className={`px-3 py-2 text-sm ${!hasConfidence ? 'opacity-50 cursor-not-allowed' : ''}`}
        disabled={!hasConfidence}
        onClick={handleExpand}
      >
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-3">
            <span className="font-medium">Week {week}</span>
            {!hasConfidence && (
              <span className="text-xs text-muted-foreground">Submit confidence to unlock week</span>
            )}
          </div>
          {getStatusBadge()}
        </div>
      </AccordionTrigger>
      
      {hasConfidence && (
        <AccordionContent className="px-3 pb-3">
          <div className="space-y-2">
            {weekData.map((item, index) => (
              <div
                key={index}
                className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg"
              >
                <Badge 
                  className="text-xs font-semibold text-slate-800 rounded-full px-2 py-0.5"
                  style={{ backgroundColor: getDomainColor(item.domain_name) }}
                >
                  {item.domain_name}
                </Badge>
                <span className="flex-1 text-sm text-slate-800">
                  {item.action_statement}
                </span>
                <div className="flex flex-col items-center gap-1">
                  <span className="text-xs text-muted-foreground">conf</span>
                  <Badge className="bg-emerald-500 text-white rounded-full px-2 py-0.5 text-xs font-semibold">
                    {item.confidence_score || 'N/A'}
                  </Badge>
                </div>
                <div className="flex flex-col items-center gap-1">
                  <span className="text-xs text-muted-foreground">perf</span>
                  <Badge className="bg-indigo-500 text-white rounded-full px-2 py-0.5 text-xs font-semibold">
                    {item.performance_score || '—'}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </AccordionContent>
      )}
    </AccordionItem>
  );
}