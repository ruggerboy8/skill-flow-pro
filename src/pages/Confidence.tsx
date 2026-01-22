import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/useAuth';
import { useStaffProfile } from '@/hooks/useStaffProfile';
import { useWeeklyAssignments } from '@/hooks/useWeeklyAssignments';
import { useToast } from '@/hooks/use-toast';
import { useWeeklyAssignmentsV2Enabled } from '@/lib/featureFlags';
import { supabase } from '@/integrations/supabase/client';
import { nowUtc, getAnchors, nextMondayStr } from '@/lib/centralTime';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getDomainColor } from '@/lib/domainColors';

export default function Confidence() {
  const { week } = useParams();
  const [scores, setScores] = useState<{ [key: string]: number }>({});
  const [submitting, setSubmitting] = useState(false);
  const [submittedCount, setSubmittedCount] = useState(0);
  const [selectedActions, setSelectedActions] = useState<{ [key: string]: string | null }>({});
  const [optionsByCompetency, setOptionsByCompetency] = useState<{ [key: number]: { action_id: string; action_statement: string }[] }>({});
  const { user } = useAuth();
  const { data: staff, isLoading: staffLoading } = useStaffProfile();
  const { toast } = useToast();
  const navigate = useNavigate();
  const v2Enabled = useWeeklyAssignmentsV2Enabled;

  const weekNum = Number(week); // week param is now just "1", "2", etc.

  // Fetch weekly assignments using the shared hook
  const { data: weeklyFocus = [], isLoading: assignmentsLoading } = useWeeklyAssignments({
    roleId: staff?.role_id,
    enabled: !!staff && !staffLoading,
  });

  const loading = staffLoading || assignmentsLoading;

const now = nowUtc();
const { monCheckInZ, tueDueZ } = getAnchors(now);
const beforeCheckIn = now < monCheckInZ;
const afterTueNoon = now >= tueDueZ;
const hasConfidence = weeklyFocus.length > 0 && submittedCount >= weeklyFocus.length;

  useEffect(() => {
    if (staff && weeklyFocus.length > 0) {
      loadScoresAndOptions();
    }
  }, [staff, weeklyFocus]);

  // Route guards with toasts for deep-links
  useEffect(() => {
    if (!loading && weeklyFocus.length > 0 && beforeCheckIn) {
      toast({ title: 'Confidence opens at 9:00 a.m. CT.' });
      navigate('/');
    }
  }, [loading, weeklyFocus, beforeCheckIn, navigate]);

  useEffect(() => {
    if (!loading && weeklyFocus.length > 0 && afterTueNoon && !hasConfidence) {
      toast({
        title: 'Confidence window closed',
        description: `You’ll get a fresh start on Mon, ${nextMondayStr(now)}.`
      });
      navigate('/');
    }
  }, [loading, weeklyFocus, afterTueNoon, hasConfidence, navigate]);

  const loadScoresAndOptions = async () => {
    if (!staff || !user || weeklyFocus.length === 0) return;

    console.log('Loading scores and options for week:', week);

    // Load existing confidence scores for this week
    const focusIds = weeklyFocus.map((f) => f.id);
    
    // Query scores by both assignment_id and weekly_focus_id to handle V2 + legacy fallback
    // Note: assignment_id is stored with 'assign:' prefix in V2
    const { data: existing, error: existingError } = await supabase
      .from('weekly_scores')
      .select('weekly_focus_id, assignment_id, confidence_score, selected_action_id')
      .eq('staff_id', staff.id)
      .or(focusIds.map(id => `assignment_id.eq.assign:${id},weekly_focus_id.eq.${id}`).join(','));

    if (existingError) {
      console.error('Existing scores error:', existingError);
    }

    const submitted = existing?.filter((r) => r.confidence_score != null).length ?? 0;
    setSubmittedCount(submitted);

    // Pre-fill selected actions and scores by matching either assignment_id or weekly_focus_id
    const selectedActionsMap: { [key: string]: string | null } = {};
    const scoresMap: { [key: string]: number } = {};
    
    existing?.forEach((r) => {
      // Find matching focus by either assignment_id (strip 'assign:' prefix) or weekly_focus_id
      const assignIdWithoutPrefix = r.assignment_id?.replace('assign:', '');
      const matchingFocus = weeklyFocus.find(f => 
        f.id === assignIdWithoutPrefix || f.id === r.weekly_focus_id
      );
      
      if (matchingFocus) {
        if (r.selected_action_id) {
          selectedActionsMap[matchingFocus.id] = r.selected_action_id.toString();
        }
        if (r.confidence_score != null) {
          scoresMap[matchingFocus.id] = r.confidence_score;
        }
      }
    });
    
    setSelectedActions(selectedActionsMap);
    setScores(scoresMap);

    // Load pro-move options for self-select competencies
    const selfSelectFocus = weeklyFocus.filter(f => f.self_select && f.competency_id);
    if (selfSelectFocus.length > 0) {
      const competencyIds = selfSelectFocus.map(f => f.competency_id).filter(Boolean) as number[];
      const { data: proMoves } = await supabase
        .from('pro_moves')
        .select('action_id, action_statement, competency_id')
        .in('competency_id', competencyIds)
        .eq('active', true)
        .order('action_statement');

      const optionsMap: { [key: number]: { action_id: string; action_statement: string }[] } = {};
      (proMoves || []).forEach((pm: any) => {
        if (!optionsMap[pm.competency_id]) {
          optionsMap[pm.competency_id] = [];
        }
        optionsMap[pm.competency_id].push({
          action_id: pm.action_id.toString(),
          action_statement: pm.action_statement,
        });
      });
      setOptionsByCompetency(optionsMap);
    }
  };

  const handleScoreChange = (focusId: string, score: string) => {
    setScores(prev => ({
      ...prev,
      [focusId]: parseInt(score)
    }));
  };

  const canSubmit = () => {
    const allScored = weeklyFocus.every(focus => scores[focus.id] !== undefined);
    const selfSelectOk = weeklyFocus.every(focus => !focus.self_select || !!selectedActions[focus.id]);
    return allScored && selfSelectOk;
  };
  const handleSubmit = async () => {
    if (!staff || !canSubmit()) return;

setSubmitting(true);

    // Hard guard: block late submissions after Tue 12:00 CT
    {
      const now = nowUtc();
      const { tueDueZ } = getAnchors(now);
      if (now >= tueDueZ && !hasConfidence) {
        toast({
          title: "Confidence window closed",
          description: `You’ll get a fresh start on Mon, ${nextMondayStr(now)}.`
        });
        setSubmitting(false);
        navigate('/');
        return;
      }
    }


    const scoreInserts = weeklyFocus.map(focus => {
      const base: any = {
        staff_id: staff.id,
        weekly_focus_id: focus.id,
        confidence_score: scores[focus.id]
      };
      
      // Add assignment_id with 'assign:' prefix when V2 enabled
      if (v2Enabled) {
        base.assignment_id = `assign:${focus.id}`;
      }
      
      if (focus.self_select && selectedActions[focus.id]) {
        base.selected_action_id = selectedActions[focus.id];
      }
      return base;
    });
    // Use assignment_id conflict when V2 enabled, otherwise weekly_focus_id
    const conflictColumns = v2Enabled ? 'staff_id,assignment_id' : 'staff_id,weekly_focus_id';
    
    const { error } = await supabase
      .from('weekly_scores')
      .upsert(scoreInserts, {
        onConflict: conflictColumns
      });

    if (error) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    } else {
      toast({
        title: "Confidence saved",
        description: "See you Thursday for performance rating!"
      });
      navigate('/');
    }

    setSubmitting(false);
  };

  const getScoreLabel = (score: number) => {
    switch (score) {
      case 1: return 'Not Confident';
      case 2: return 'A Bit';
      case 3: return 'Mostly';
      case 4: return 'Totally';
      default: return '';
    }
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
            <CardTitle className="text-center">Monday Confidence</CardTitle>
            <CardDescription className="text-center">
              Rate how confident you are that you're already doing each action 100% of the time
            </CardDescription>
            <Badge variant="outline" className="mx-auto">
              Cycle 1 · Week {weekNum}
            </Badge>
          </CardHeader>
        </Card>

        {/* Gating states based on Central Time */}
        {beforeCheckIn && (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="text-center">Opens at 9:00 a.m. CT</CardTitle>
                <CardDescription className="text-center">
                  Confidence ratings open Monday at 9:00 a.m. Central Time.
                </CardDescription>
              </CardHeader>
            </Card>
            <Button 
              variant="outline"
              onClick={() => navigate('/')}
              className="w-full"
            >
              Back to Week View
            </Button>
          </>
        )}

        {!beforeCheckIn && afterTueNoon && !hasConfidence && (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="text-center">Confidence window closed</CardTitle>
                <CardDescription className="text-center">
                  You’ll get a fresh start on Mon, {nextMondayStr(now)}.
                </CardDescription>
              </CardHeader>
            </Card>
            <Button 
              variant="outline"
              onClick={() => navigate('/')}
              className="w-full"
            >
              Back to Week View
            </Button>
          </>
        )}

        {hasConfidence && (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="text-center">Confidence already submitted</CardTitle>
                <CardDescription className="text-center">
                  Thanks! You can rate performance starting Thursday.
                </CardDescription>
              </CardHeader>
            </Card>
            <Button 
              variant="outline"
              onClick={() => navigate('/')}
              className="w-full"
            >
              Back to Week View
            </Button>
          </>
        )}

        {/* Active window: Mon 9:00 → Tue 11:59 and not submitted yet */}
        {!beforeCheckIn && !afterTueNoon && !hasConfidence && (
          <>
            {weeklyFocus.map((focus, index) => (
              <Card key={focus.id}>
                <CardHeader>
                  <div className="flex items-start gap-2">
                    <Badge variant="outline" className="text-xs">
                      {index + 1}
                    </Badge>
                    <CardTitle className="text-sm font-medium leading-relaxed flex items-center gap-2">
                      {focus.action_statement || 'Self-Select'}
                      {focus.domain_name && (
                        <span
                          className="inline-flex items-center rounded px-2 py-0.5 text-[10px]"
                          style={{ backgroundColor: getDomainColor(focus.domain_name) }}
                        >
                          {focus.domain_name}
                        </span>
                      )}
                    </CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  {focus.self_select && (
                    <div className="mb-3">
                      <Label className="text-xs mb-1 block">Choose a Pro Move</Label>
                      <Select
                        value={selectedActions[focus.id] || ''}
                        onValueChange={(value) => setSelectedActions(prev => ({ ...prev, [focus.id]: value }))}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select a Pro Move" />
                        </SelectTrigger>
                        <SelectContent>
                          {focus.competency_id && optionsByCompetency[focus.competency_id] ? (
                            optionsByCompetency[focus.competency_id].map((opt) => (
                              <SelectItem key={opt.action_id} value={opt.action_id}>
                                {opt.action_statement}
                              </SelectItem>
                            ))
                          ) : (
                            <SelectItem value="__none" disabled>
                              No options available
                            </SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <RadioGroup
                    value={scores[focus.id]?.toString() || ''}
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
                {submitting ? 'Saving...' : 'Save Confidence Ratings'}
              </Button>
              <Button 
                variant="outline"
                onClick={() => navigate('/')}
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