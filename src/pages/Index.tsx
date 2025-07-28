import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface WeeklyFocus {
  id: string;
  iso_week: number;
  iso_year: number;
  role_id: number;
  action_id: number;
}

interface WeekStatus {
  weekly_focus_id: string;
  confidence_score: number | null;
  performance_score: number | null;
  iso_week: number;
  iso_year: number;
}

interface Staff {
  id: string;
  role_id: number;
}

export default function Index() {
  const [staff, setStaff] = useState<Staff | null>(null);
  const [weekStatuses, setWeekStatuses] = useState<WeekStatus[]>([]);
  const [weeklyFocus, setWeeklyFocus] = useState<WeeklyFocus[]>([]);
  const [loading, setLoading] = useState(true);
  const { user, signOut } = useAuth();
  const { toast } = useToast();
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

    const { data, error } = await supabase
      .from('staff')
      .select('id, role_id')
      .eq('user_id', user.id)
      .single();

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
    
    // Load weekly focus for this staff's role
    const { data: focusData, error: focusError } = await supabase
      .from('weekly_focus')
      .select('id, iso_week, iso_year, role_id, action_id')
      .eq('role_id', staff.role_id);

    if (focusError) {
      toast({
        title: "Error",
        description: "Failed to load weekly focus",
        variant: "destructive"
      });
      setLoading(false);
      return;
    }

    setWeeklyFocus(focusData || []);

    // Load weekly scores for this staff
    const { data: scoresData, error: scoresError } = await supabase
      .from('weekly_scores')
      .select(`
        weekly_focus_id, 
        confidence_score, 
        performance_score,
        weekly_focus!inner(iso_week, iso_year)
      `)
      .eq('staff_id', staff.id);

    if (scoresError) {
      toast({
        title: "Error",
        description: "Failed to load scores",
        variant: "destructive"
      });
    } else {
      // Transform the data to match our interface
      const transformedData: WeekStatus[] = scoresData?.map(item => ({
        weekly_focus_id: item.weekly_focus_id,
        confidence_score: item.confidence_score,
        performance_score: item.performance_score,
        iso_week: (item.weekly_focus as any).iso_week,
        iso_year: (item.weekly_focus as any).iso_year
      })) || [];
      
      setWeekStatuses(transformedData);
    }
    setLoading(false);
  };

  const getTileStatus = (week: number, year: number = new Date().getFullYear()): 'grey' | 'yellow' | 'green' => {
    const weekStatus = weekStatuses.find(ws => ws.iso_week === week && ws.iso_year === year);
    
    if (!weekStatus) return 'grey';
    if (weekStatus.performance_score === null) return 'yellow';
    return 'green';
  };

  const getWeekColor = (status: 'grey' | 'yellow' | 'green') => {
    switch (status) {
      case 'green': return 'bg-green-400 hover:bg-green-500 text-white';
      case 'yellow': return 'bg-yellow-300 hover:bg-yellow-400 text-black';
      default: return 'bg-gray-300 hover:bg-gray-400 text-black';
    }
  };

  const getTooltipText = (status: 'grey' | 'yellow' | 'green') => {
    switch (status) {
      case 'grey': return 'Not started';
      case 'yellow': return 'Confidence submitted – performance pending';
      case 'green': return 'All done – great job!';
    }
  };

  const handleWeekClick = async (week: number, year: number = new Date().getFullYear()) => {
    if (!staff) return;

    // Check if weekly_focus exists for this week/year/role
    const weekFocus = weeklyFocus.find(wf => wf.iso_week === week && wf.iso_year === year);
    
    if (!weekFocus) {
      toast({
        title: "No Pro Moves set yet",
        description: `Week ${week} doesn't have any Pro Moves configured yet.`,
        variant: "default"
      });
      return;
    }

    const status = getTileStatus(week, year);
    
    if (status === 'grey') {
      // No scores yet, go to confidence
      navigate(`/confidence/${week}`);
    } else if (status === 'yellow') {
      // Has confidence, missing performance
      navigate(`/performance/${week}`);
    } else {
      // Already completed
      toast({
        title: "Already completed",
        description: `Week ${week} is already completed. Great job!`,
        variant: "default"
      });
    }
  };

  const handleSignOut = async () => {
    await signOut();
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">Loading...</div>
      </div>
    );
  }

  const totalCycles = 4; // Adjust as needed

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold">SkillCheck Cycles</h1>
          <Button onClick={handleSignOut} variant="outline">
            Sign Out
          </Button>
        </div>

        <div className="space-y-12">
          {Array.from({ length: totalCycles }, (_, cycleIndex) => {
            const cycle = cycleIndex + 1;
            return (
              <div key={cycle} className="space-y-4">
                <h2 className="text-xl font-semibold text-center">
                  Cycle {cycle}
                </h2>
                
                <div className="grid grid-cols-3 gap-4">
                  {Array.from({ length: 6 }, (_, weekIndex) => {
                    const week = weekIndex + 1;
                    const currentYear = new Date().getFullYear();
                    const status = getTileStatus(week, currentYear);
                    
                    return (
                      <Card 
                        key={`${cycle}-${week}`}
                        className={`cursor-pointer transition-all hover:scale-105 ${getWeekColor(status)}`}
                        onClick={() => handleWeekClick(week, currentYear)}
                        title={getTooltipText(status)}
                      >
                        <CardContent className="p-6 text-center">
                          <div className="text-lg font-semibold">
                            Week {week}
                          </div>
                          <div className="text-sm mt-2 opacity-90">
                            {status === 'green' && '✓ All done – great job!'}
                            {status === 'yellow' && '◐ Confidence submitted – performance pending'}
                            {status === 'grey' && '○ Not started'}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}