import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { getDomainColor } from '@/lib/domainColors';
import ThisWeekPanel from '@/components/home/ThisWeekPanel';
interface WeeklyFocus {
  id: string;
  display_order: number;
  action_statement: string;
  domain_name: string;
}
interface WeekStatus {
  cycle: number;
  week_in_cycle: number;
  hasConfidence: boolean;
  hasPerformance: boolean;
}
interface Staff {
  id: string;
  role_id: number;
}
export default function Index() {
  const [staff, setStaff] = useState<Staff | null>(null);
  const [weekStatuses, setWeekStatuses] = useState<WeekStatus[]>([]);
  const [currentWeekFocus, setCurrentWeekFocus] = useState<WeeklyFocus[]>([]);
  const [loading, setLoading] = useState(true);
  const {
    user,
    signOut
  } = useAuth();
  const {
    toast
  } = useToast();
  const navigate = useNavigate();
  useEffect(() => {
    if (user) {
      loadStaffProfile();
    }
  }, [user]);
  useEffect(() => {
    if (staff) {
      loadWeekData();
    }
  }, [staff]);
  const loadStaffProfile = async () => {
    if (!user) return;
    const {
      data,
      error
    } = await supabase.from('staff').select('id, role_id').eq('user_id', user.id).single();
    if (error) {
      if (error.code === 'PGRST116') {
        // No staff record found, redirect to setup
        navigate('/setup');
      } else {
        toast({
          title: "Error",
          description: "Failed to load profile",
          variant: "destructive"
        });
      }
    } else {
      setStaff(data);
    }
  };
  const loadWeekData = async () => {
    if (!staff) return;
    setLoading(true);

    // Calculate week status based on completion for cycle 1
    const weekStatusMap = new Map<string, WeekStatus>();
    for (let weekInCycle = 1; weekInCycle <= 6; weekInCycle++) {
      // Get weekly focus for this week
      const {
        data: focusData
      } = await supabase.from('weekly_focus').select('id').eq('role_id', staff.role_id).eq('cycle', 1).eq('week_in_cycle', weekInCycle);
      const focusIds = focusData?.map(f => f.id) || [];
      if (focusIds.length > 0) {
        const {
          data: scoresData
        } = await supabase.from('weekly_scores').select('weekly_focus_id, confidence_score, performance_score').eq('staff_id', staff.id).in('weekly_focus_id', focusIds);
        const hasConfidence = (scoresData || []).every(score => score.confidence_score !== null);
        const hasPerformance = (scoresData || []).every(score => score.performance_score !== null);
        weekStatusMap.set(`1-${weekInCycle}`, {
          cycle: 1,
          week_in_cycle: weekInCycle,
          hasConfidence: hasConfidence && scoresData && scoresData.length === focusIds.length,
          hasPerformance: hasPerformance && scoresData && scoresData.length === focusIds.length
        });
      }
    }
    setWeekStatuses(Array.from(weekStatusMap.values()));

    // Load current week's pro moves
    const nextWeek = getNextIncompleteWeek();
    if (nextWeek) {
      const {
        data: currentFocusData
      } = (await supabase.rpc('get_focus_cycle_week', {
        p_cycle: nextWeek.cycle,
        p_week: nextWeek.week,
        p_role_id: staff.role_id
      })) as {
        data: WeeklyFocus[] | null;
        error: any;
      };
      setCurrentWeekFocus(currentFocusData || []);
    }
    setLoading(false);
  };
  const getTileStatus = (cycle: number, weekInCycle: number): 'grey' | 'yellow' | 'green' => {
    const weekStatus = weekStatuses.find(ws => ws.cycle === cycle && ws.week_in_cycle === weekInCycle);
    if (!weekStatus) return 'grey';
    // Strict logic
    if (!weekStatus.hasConfidence) return 'grey';
    if (weekStatus.hasPerformance) return 'green';
    // If all confidence but not all performance, show yellow elsewhere. Here we only know overall flags.
    return 'yellow';
  };
  const getWeekColor = (status: 'grey' | 'yellow' | 'green') => {
    switch (status) {
      case 'green':
        return 'bg-green-400 hover:bg-green-500 text-white';
      case 'yellow':
        return 'bg-yellow-300 hover:bg-yellow-400 text-black';
      default:
        return 'bg-gray-300 hover:bg-gray-400 text-black';
    }
  };
  const getTooltipText = (status: 'grey' | 'yellow' | 'green') => {
    switch (status) {
      case 'grey':
        return 'Not started';
      case 'yellow':
        return 'Confidence submitted – performance pending';
      case 'green':
        return 'All done – great job!';
    }
  };
  const getNextIncompleteWeek = (): {
    cycle: number;
    week: number;
  } | null => {
    // First priority: Find a week where confidence is done but performance is not (yellow status)
    for (let week = 1; week <= 6; week++) {
      const status = getTileStatus(1, week);
      if (status === 'yellow') {
        return {
          cycle: 1,
          week
        };
      }
    }
    
    // Second priority: Find the first week that hasn't been started yet (grey status)
    for (let week = 1; week <= 6; week++) {
      const status = getTileStatus(1, week);
      if (status === 'grey') {
        return {
          cycle: 1,
          week
        };
      }
    }
    
    return null; // All weeks complete
  };
  const handleWeekClick = async (cycle: number, weekInCycle: number) => {
    if (!staff) return;
    const weekStatus = weekStatuses.find(ws => ws.cycle === cycle && ws.week_in_cycle === weekInCycle);

    // If week is completed, go to review
    if (weekStatus && weekStatus.hasConfidence && weekStatus.hasPerformance) {
      navigate(`/review/${cycle}/${weekInCycle}`);
      return;
    }

    // Check if weekly_focus exists for this cycle/week/role using new query
    const {
      data: focusRows,
      error
    } = await supabase.from('v_weekly_focus').select('id, display_order, action_statement').eq('cycle', cycle).eq('week_in_cycle', weekInCycle).eq('role_id', staff.role_id).order('display_order');
    if (error || !focusRows || focusRows.length === 0) {
      toast({
        title: "No Pro Moves",
        description: `Cycle ${cycle}, Week ${weekInCycle} doesn't have any Pro Moves configured yet.`,
        variant: "default"
      });
      return;
    }

    // Navigate to week info page
    navigate(`/week/${cycle}-${weekInCycle}`);
  };
  const handleSignOut = async () => {
    await signOut();
  };
  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">Loading...</div>
      </div>;
  }
  const nextWeek = getNextIncompleteWeek();
  return <div className="min-h-screen bg-background p-4">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold">SkillCheck Progress</h1>
          
        </div>

            {/* Dynamic This Week panel with banner + single CTA */}
            <ThisWeekPanel />
          
        <div className="space-y-8">
          <div className="space-y-4">
            <h2 className="text-xl font-semibold text-center">
              Cycle 1
            </h2>
            
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {Array.from({
              length: 6
            }, (_, weekIndex) => {
              const weekInCycle = weekIndex + 1;
              const status = getTileStatus(1, weekInCycle);
              return <Card key={`1-${weekInCycle}`} className={`cursor-pointer transition-all hover:scale-105 ${getWeekColor(status)}`} onClick={() => handleWeekClick(1, weekInCycle)} title={getTooltipText(status)}>
                    <CardContent className="p-3 sm:p-6 text-center">
                      <div className="text-lg font-semibold">
                        Week {weekInCycle}
                      </div>
                      <div className="text-sm mt-2 opacity-90">
                        {status === 'green' && '✓ Completed'}
                        {status === 'yellow' && '◐ In Progress'}
                        {status === 'grey' && '○ Not Started'}
                      </div>
                    </CardContent>
                  </Card>;
            })}
            </div>
          </div>
        </div>
      </div>
    </div>;
}