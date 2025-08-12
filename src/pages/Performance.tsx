import { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { getNowZ, getAnchors, isSameIsoWeek } from '@/lib/centralTime';
interface Staff {
  id: string;
  role_id: number;
}

interface WeeklyFocus {
  id: string;
  display_order: number;
  self_select?: boolean;
  pro_moves?: {
    action_statement: string;
  };
}

interface WeeklyScore {
  id: string;
  weekly_focus_id: string;
  confidence_score: number;
}

export default function Performance() {
  const { week } = useParams();
  const [staff, setStaff] = useState<Staff | null>(null);
  const [weeklyFocus, setWeeklyFocus] = useState<WeeklyFocus[]>([]);
  const [existingScores, setExistingScores] = useState<WeeklyScore[]>([]);
  const [performanceScores, setPerformanceScores] = useState<{ [key: string]: number }>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [showCarryoverBanner, setShowCarryoverBanner] = useState<boolean>(Boolean((location.state as any)?.carryover));

  const weekNum = Number(week); // week param is now just "1", "2", etc.

  // Central Time gating for Performance (opens Thu 00:00 CT; allowed anytime for past weeks)
  const nowZ = getNowZ();
  const { thuStartZ } = getAnchors(nowZ);
  const beforeThursday = nowZ < thuStartZ;

  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user, week]);

  const loadData = async () => {
    if (!user) return;

    // Load staff profile
    const { data: staffData, error: staffError } = await supabase
      .from('staff')
      .select('id, role_id')
      .eq('user_id', user.id)
      .single();

    if (staffError || !staffData) {
      navigate('/setup');
      return;
    }

    setStaff(staffData);

    // Load weekly focus using direct query with cycle/week_in_cycle
    const { data: focusData, error: focusError } = await supabase
      .from('weekly_focus')
      .select(`
        id,
        display_order,
        self_select,
        iso_year,
        iso_week,
        pro_moves (
          action_statement
        ),
        competencies (
          domains ( domain_name )
        )
      `)
      .eq('cycle', 1) // Use cycle 1 for now
      .eq('week_in_cycle', weekNum)
      .eq('role_id', staffData.role_id)
      .order('display_order');

    if (focusError || !focusData || focusData.length === 0) {
      toast({
        title: "Error",
        description: "No Pro Moves found for this week",
        variant: "destructive"
      });
      navigate('/week');
      return;
    }

    setWeeklyFocus(focusData);

    // Load existing confidence scores
    const focusIds = focusData.map(f => f.id);
    const { data: scoresData, error: scoresError } = await supabase
      .from('weekly_scores')
      .select('id, weekly_focus_id, confidence_score')
      .eq('staff_id', staffData.id)
      .in('weekly_focus_id', focusIds)
      .not('confidence_score', 'is', null);

    if (scoresError || !scoresData || scoresData.length !== focusData.length) {
      toast({
        title: "Error",
        description: "Please complete confidence ratings first",
        variant: "destructive"
      });
      navigate('/week');
      return;
    }

    setExistingScores(scoresData);
    setLoading(false);
  };

  const handleScoreChange = (focusId: string, score: string) => {
    setPerformanceScores(prev => ({
      ...prev,
      [focusId]: parseInt(score)
    }));
  };

  const canSubmit = () => {
    return weeklyFocus.every(focus => performanceScores[focus.id] !== undefined);
  };

  const handleSubmit = async () => {
    if (!staff || !canSubmit()) return;

    setSubmitting(true);

    const updates = existingScores.map(score => ({
      id: score.id,
      performance_score: performanceScores[score.weekly_focus_id]
    }));

    const { error } = await supabase
      .from('weekly_scores')
      .upsert(updates);

    if (error) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    } else {
      toast({
        title: "Great week!",
        description: "Enjoy your weekend!"
      });
      navigate('/week');
    }

    setSubmitting(false);
  };

  const getScoreLabel = (score: number) => {
    switch (score) {
      case 1: return 'Rarely';
      case 2: return 'Sometimes';
      case 3: return 'Usually';
      case 4: return 'Always';
      default: return '';
    }
  };

  const getConfidenceScore = (focusId: string) => {
    const score = existingScores.find(s => s.weekly_focus_id === focusId);
    return score?.confidence_score || 0;
  };

  // Determine if this screen is for the current ISO week
  const isCurrentIsoWeek = weeklyFocus.length > 0
    ? isSameIsoWeek(nowZ, (weeklyFocus as any)[0].iso_year as number, (weeklyFocus as any)[0].iso_week as number)
    : true;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 bg-background">
      <div className="max-w-md mx-auto space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-center">Thursday Performance</CardTitle>
            <CardDescription className="text-center">
              Rate how often you actually performed each action this week
            </CardDescription>
            <Badge variant="outline" className="mx-auto">
              Cycle 1 · Week {weekNum}
            </Badge>
          </CardHeader>
        </Card>

        {showCarryoverBanner && (
          <Card>
            <CardHeader>
              <CardTitle className="text-center">Finish last week’s performance</CardTitle>
              <CardDescription className="text-center">
                Pick up where you left off — submit last week’s performance now.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" className="w-full" onClick={() => setShowCarryoverBanner(false)}>
                Dismiss
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Early guard Mon–Wed: read-only message */}
        {isCurrentIsoWeek && beforeThursday ? (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="text-center">Performance opens Thursday.</CardTitle>
                <CardDescription className="text-center">
                  Come back Thursday to rate your performance. Confidence must be completed first.
                </CardDescription>
              </CardHeader>
            </Card>
            <div className="space-y-2">
              <Button 
                variant="outline"
                onClick={() => navigate('/week')}
                className="w-full"
              >
                Back to Week View
              </Button>
            </div>
          </>
        ) : (
          <>
            {weeklyFocus.map((focus, index) => (
              <Card key={focus.id}>
                <CardHeader>
                  <div className="flex items-start gap-2">
                    <Badge variant="outline" className="text-xs">
                      {index + 1}
                    </Badge>
                    <div className="flex-1">
                      <CardTitle className="text-sm font-medium leading-relaxed mb-2">
                        {focus.pro_moves?.action_statement || 'Self-Select'}
                      </CardTitle>
                      <Badge variant="secondary" className="text-xs">
                        Monday Confidence: {getConfidenceScore(focus.id)}
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <RadioGroup
                    value={performanceScores[focus.id]?.toString() || ''}
                    onValueChange={(value) => handleScoreChange(focus.id, value)}
                  >
                    {[1, 2, 3, 4].map((score) => (
                      <div key={score} className="flex items-center space-x-3 py-2">
                        <RadioGroupItem value={score.toString()} id={`${focus.id}-${score}`} />
                        <Label 
                          htmlFor={`${focus.id}-${score}`}
                          className="flex-1 cursor-pointer py-2 text-sm"
                        >
                          {score} - {getScoreLabel(score)}
                        </Label>
                      </div>
                    ))}
                  </RadioGroup>
                </CardContent>
              </Card>
            ))}

            <div className="space-y-2">
              <Button 
                onClick={handleSubmit}
                disabled={!canSubmit() || submitting}
                className="w-full h-12"
              >
                {submitting ? 'Saving...' : 'Save Performance Ratings'}
              </Button>
              
              <Button 
                variant="outline"
                onClick={() => navigate('/week')}
                className="w-full"
              >
                Back to Week View
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}