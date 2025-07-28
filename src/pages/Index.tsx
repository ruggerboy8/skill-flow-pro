import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface WeeklyScore {
  weekly_focus_id: string;
  confidence_score: number | null;
  performance_score: number | null;
}

interface Staff {
  id: string;
  role_id: number;
}

export default function Index() {
  const [staff, setStaff] = useState<Staff | null>(null);
  const [weeklyScores, setWeeklyScores] = useState<WeeklyScore[]>([]);
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
      loadWeeklyScores();
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

  const loadWeeklyScores = async () => {
    if (!staff) return;

    setLoading(true);
    const { data, error } = await supabase
      .from('weekly_scores')
      .select('weekly_focus_id, confidence_score, performance_score')
      .eq('staff_id', staff.id);

    if (error) {
      toast({
        title: "Error",
        description: "Failed to load scores",
        variant: "destructive"
      });
    } else {
      setWeeklyScores(data || []);
    }
    setLoading(false);
  };

  const getWeekStatus = (week: number, cycle: number) => {
    // For now, mock the logic - in real implementation this would check 
    // if weekly_focus exists for this week/cycle and if scores are complete
    const hasConfidence = Math.random() > 0.5; // Mock data
    const hasPerformance = Math.random() > 0.5; // Mock data
    
    if (hasConfidence && hasPerformance) return 'completed';
    if (hasConfidence) return 'partial';
    return 'pending';
  };

  const getWeekColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-500 hover:bg-green-600 text-white';
      case 'partial': return 'bg-yellow-500 hover:bg-yellow-600 text-white';
      default: return 'bg-gray-200 hover:bg-gray-300 text-gray-700 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-300';
    }
  };

  const handleWeekClick = (week: number, cycle: number) => {
    navigate(`/week?cycle=${cycle}&week=${week}`);
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
                    const status = getWeekStatus(week, cycle);
                    
                    return (
                      <Card 
                        key={`${cycle}-${week}`}
                        className={`cursor-pointer transition-all hover:scale-105 ${getWeekColor(status)}`}
                        onClick={() => handleWeekClick(week, cycle)}
                      >
                        <CardContent className="p-6 text-center">
                          <div className="text-lg font-semibold">
                            Week {week}
                          </div>
                          <div className="text-sm mt-2 opacity-90">
                            {status === 'completed' && '✓ Complete'}
                            {status === 'partial' && '◐ Partial'}
                            {status === 'pending' && '○ Pending'}
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