import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { nowUtc, getAnchors, nextMondayStr } from '@/lib/centralTime';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getDomainColor } from '@/lib/domainColors';

interface Staff {
  id: string;
  role_id: number;
}

interface WeeklyFocus {
  id: string;
  display_order: number;
  self_select?: boolean;
  competency_id?: number;
  pro_moves?: {
    action_statement: string;
  };
  competencies?: {
    domains?: { domain_name?: string }
  };
}

export default function Confidence() {
  const { week } = useParams();
  const [staff, setStaff] = useState<Staff | null>(null);
  const [weeklyFocus, setWeeklyFocus] = useState<WeeklyFocus[]>([]);
  const [scores, setScores] = useState<{ [key: string]: number }>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submittedCount, setSubmittedCount] = useState(0);
  const [selectedActions, setSelectedActions] = useState<{ [key: string]: string | null }>({});
  const [optionsByCompetency, setOptionsByCompetency] = useState<{ [key: number]: { action_id: string; action_statement: string }[] }>({});
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const weekNum = Number(week); // week param is now just "1", "2", etc.

const now = nowUtc();
const { monCheckInZ, tueDueZ } = getAnchors(now);
const beforeCheckIn = now < monCheckInZ;
const afterTueNoon = now >= tueDueZ;
const hasConfidence = weeklyFocus.length > 0 && submittedCount >= weeklyFocus.length;

  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user, week]);

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

  const loadData = async () => {
    if (!user) return;

    console.log('Loading confidence data for week:', week, 'user:', user.id);

    // Load staff profile
    const { data: staffData, error: staffError } = await supabase
      .from('staff')
      .select('id, role_id')
      .eq('user_id', user.id)
      .single();

    if (staffError || !staffData) {
      console.error('Staff error:', staffError);
      navigate('/setup');
      return;
    }

    console.log('Staff data loaded:', staffData);
    setStaff(staffData);

    // Load weekly focus using direct query with cycle/week_in_cycle
    const { data: focusData, error: focusError } = await supabase
      .from('weekly_focus')
      .select(`
        id,
        display_order,
        self_select,
        competency_id,
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

    if (focusError) {
      console.error('Focus error:', focusError);
      toast({
        title: 'Error',
        description: 'No Pro Moves found for this week',
        variant: 'destructive'
      });
      navigate('/');
      return;
    }

    console.log('Focus data found:', focusData);
    setWeeklyFocus(focusData);

    // Load existing confidence scores for this week
    const focusIds = focusData.map((f) => f.id);
    const { data: existing, error: existingError } = await supabase
      .from('weekly_scores')
      .select('weekly_focus_id, confidence_score, selected_action_id')
      .eq('staff_id', staffData.id)
      .in('weekly_focus_id', focusIds);

    if (existingError) {
      console.error('Existing scores error:', existingError);
    }

    const submitted = existing?.filter((r) => r.confidence_score != null).length ?? 0;
    setSubmittedCount(submitted);

    // Pre-fill selected actions if previously chosen
    const selectedByFocus: { [key: string]: string | null } = {};
    (existing || []).forEach((r) => {
      if (r.selected_action_id) {
        selectedByFocus[r.weekly_focus_id] = r.selected_action_id as unknown as string;
      }
    });
    if (Object.keys(selectedByFocus).length > 0) {
      setSelectedActions((prev) => ({ ...prev, ...selectedByFocus }));
    }

    // Load self-select options for competencies
    const compIds = Array.from(
      new Set(
        focusData
          .filter((f) => f.self_select && !!f.competency_id)
          .map((f) => f.competency_id as number)
      )
    );

    if (compIds.length > 0) {
      const { data: opts, error: optsError } = await supabase
        .from('pro_moves')
        .select('action_id, action_statement, competency_id')
        .in('competency_id', compIds)
        .order('action_statement');

      if (optsError) {
        console.error('Options load error:', optsError);
      } else if (opts) {
        const grouped: { [key: number]: { action_id: string; action_statement: string }[] } = {};
        opts.forEach((o: any) => {
          const cid = o.competency_id as number;
          if (!grouped[cid]) grouped[cid] = [];
          grouped[cid].push({ action_id: o.action_id, action_statement: o.action_statement });
        });
        setOptionsByCompetency(grouped);
      }
    }

    setLoading(false);
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
      if (focus.self_select && selectedActions[focus.id]) {
        base.selected_action_id = selectedActions[focus.id];
      }
      return base;
    });
    const { error } = await supabase
      .from('weekly_scores')
      .upsert(scoreInserts, {
        onConflict: 'staff_id,weekly_focus_id'
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
              Rate how confident you are you'll do each action 100% this week
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
                      {focus.pro_moves?.action_statement || 'Self-Select'}
                      {focus.competencies?.domains?.domain_name && (
                        <span
                          className="inline-flex items-center rounded px-2 py-0.5 text-[10px]"
                          style={{ backgroundColor: getDomainColor(focus.competencies.domains.domain_name) }}
                        >
                          {focus.competencies.domains.domain_name}
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