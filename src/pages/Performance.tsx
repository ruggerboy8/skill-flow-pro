import { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/useAuth';
import { useStaffProfile } from '@/hooks/useStaffProfile';
import { useWeeklyAssignments } from '@/hooks/useWeeklyAssignments';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { nowUtc } from '@/lib/centralTime';
import { getSubmissionPolicy } from '@/lib/submissionPolicy';

interface WeeklyScore {
  id: string;
  weekly_focus_id: string;
  assignment_id?: string | null;
  confidence_score: number;
  confidence_date?: string | null;
}


export default function Performance() {
  const { week } = useParams();
  const [existingScores, setExistingScores] = useState<WeeklyScore[]>([]);
  const [performanceScores, setPerformanceScores] = useState<{ [key: string]: number }>({});
  const [submitting, setSubmitting] = useState(false);
  const [isCarryoverWeek, setIsCarryoverWeek] = useState(false);
  const { user } = useAuth();
  const { data: staff, isLoading: staffLoading } = useStaffProfile();
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [showCarryoverBanner, setShowCarryoverBanner] = useState<boolean>(Boolean((location.state as any)?.carryover));
  

  const weekNum = Number(week); // week param is now just "1", "2", etc.

  // Fetch weekly assignments using the shared hook
  const { data: weeklyFocus = [], isLoading: assignmentsLoading } = useWeeklyAssignments({
    roleId: staff?.role_id,
    enabled: !!staff && !staffLoading,
  });

  const loading = staffLoading || assignmentsLoading;

// Central Time gating for Performance (opens Thu 00:01 CT; allowed anytime for past weeks)
  const now = nowUtc();
  const policy = getSubmissionPolicy(now, 'America/Chicago');
  let beforeThursday = !policy.isPerformanceOpen(now);
  const beforeThursdayEffective = beforeThursday && !isCarryoverWeek;

  useEffect(() => {
    if (staff && weeklyFocus.length > 0) {
      loadScoresData();
    }
  }, [staff, weeklyFocus]);

  // No longer blocking access - users can submit anytime

  const loadScoresData = async () => {
    if (!staff || !user || weeklyFocus.length === 0) return;

    const focusIds = weeklyFocus.map(f => f.id);
    
    // Query scores by both assignment_id and weekly_focus_id to handle V2 + legacy fallback
    // Note: assignment_id is stored with 'assign:' prefix in V2
    const { data: scoresData, error: scoresError } = await supabase
      .from('weekly_scores')
      .select('id, weekly_focus_id, assignment_id, confidence_score, confidence_date')
      .eq('staff_id', staff.id)
      .or(focusIds.map(id => `assignment_id.eq.assign:${id},weekly_focus_id.eq.${id}`).join(','))
      .not('confidence_score', 'is', null);

    // Check we have scores for all assignments
    // Note: strip 'assign:' prefix when matching assignment_id
    const matchedScores = scoresData?.filter(score => {
      const assignIdWithoutPrefix = score.assignment_id?.replace('assign:', '');
      return weeklyFocus.some(f => f.id === assignIdWithoutPrefix || f.id === score.weekly_focus_id);
    }) || [];
    
    if (scoresError || matchedScores.length !== weeklyFocus.length) {
      toast({ title: "Error", description: "Complete confidence ratings first (Monday)", variant: "destructive" });
      navigate('/week');
      return;
    }

    setExistingScores(matchedScores);
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

    const updates = existingScores.map(score => {
      // Find matching focus by either assignment_id (strip 'assign:' prefix) or weekly_focus_id
      const assignIdWithoutPrefix = score.assignment_id?.replace('assign:', '');
      const matchingFocus = weeklyFocus.find(f => 
        f.id === assignIdWithoutPrefix || f.id === score.weekly_focus_id
      );
      
      return {
        id: score.id,
        performance_score: matchingFocus ? performanceScores[matchingFocus.id] : undefined
      };
    });

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
    const score = existingScores.find(s => {
      const assignIdWithoutPrefix = s.assignment_id?.replace('assign:', '');
      return assignIdWithoutPrefix === focusId || s.weekly_focus_id === focusId;
    });
    return score?.confidence_score || 0;
  };

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

        {/* Early submission message - no longer blocking */}
        {beforeThursdayEffective && (
          <Card>
            <CardHeader>
              <CardTitle className="text-center">Early Performance Submission</CardTitle>
              <CardDescription className="text-center">
                You can submit performance now, or come back Thursday during normal hours.
              </CardDescription>
            </CardHeader>
          </Card>
        )}

        {/* Show performance form for all users */}
        {weeklyFocus.map((focus, index) => (
              <Card key={focus.id}>
                <CardHeader>
                  <div className="flex items-start gap-2">
                    <Badge variant="outline" className="text-xs">
                      {index + 1}
                    </Badge>
                    <div className="flex-1">
                      <CardTitle className="text-sm font-medium leading-relaxed mb-2">
                        {focus.action_statement || 'Self-Select'}
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
      </div>
    </div>
  );
}