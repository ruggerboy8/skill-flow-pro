// Updated Confidence Wizard to use progress-based approach instead of ISO week
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import NumberScale from '@/components/NumberScale';
import { getDomainColor } from '@/lib/domainColors';
import { nowUtc, getAnchors, nextMondayStr } from '@/lib/centralTime';
import { useNow } from '@/providers/NowProvider';
import { useSim } from '@/devtools/SimProvider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { assembleCurrentWeek } from '@/lib/weekAssembly';

interface Staff {
  id: string;
  role_id: number;
}

interface WeeklyFocus {
  id: string;
  display_order: number;
  action_statement: string;
  cycle: number;
  week_in_cycle: number;
  domain_name: string;
}

export default function ConfidenceWizard() {
  const { n } = useParams();
  const [staff, setStaff] = useState<Staff | null>(null);
  const [weeklyFocus, setWeeklyFocus] = useState<WeeklyFocus[]>([]);
  const [currentFocus, setCurrentFocus] = useState<WeeklyFocus | null>(null);
  const [scores, setScores] = useState<{ [key: string]: number }>({});
  const [selectedActions, setSelectedActions] = useState<{ [key: string]: string | null }>({});
  const [selfSelectById, setSelfSelectById] = useState<Record<string, boolean>>({});
  const [competencyById, setCompetencyById] = useState<Record<string, number | null>>({});
  const [competencyNameById, setCompetencyNameById] = useState<Record<string, string>>({});
  const [optionsByCompetency, setOptionsByCompetency] = useState<{ [key: number]: { action_id: string; action_statement: string }[] }>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [hasConfidence, setHasConfidence] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const now = useNow();
  const { overrides } = useSim();

  // Use simulated time if available for time gating
  const effectiveNow = overrides.enabled && overrides.nowISO ? new Date(overrides.nowISO) : now;
  const { monCheckInZ, tueDueZ } = getAnchors(effectiveNow);
  const beforeCheckIn = effectiveNow < monCheckInZ;
  const afterTueNoon = effectiveNow >= tueDueZ;

  const currentIndex = Math.max(0, (Number(n) || 1) - 1);

  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user]);

  useEffect(() => {
    if (weeklyFocus.length > 0 && currentIndex < weeklyFocus.length) {
      setCurrentFocus(weeklyFocus[currentIndex]);
    }
  }, [currentIndex, weeklyFocus]);

  // Central Time gating and route guard
  useEffect(() => {
    if (!loading && weeklyFocus.length > 0) {
      if (beforeCheckIn) {
        toast({
          title: "Confidence opens at 9:00 a.m. CT.",
          description: "Please come back after the window opens."
        });
        navigate('/week');
      } else if (afterTueNoon && !hasConfidence) {
        toast({
          title: "Confidence window closed",
          description: `You'll get a fresh start on Mon, ${nextMondayStr(now)}.`
        });
        navigate('/week');
      }
    }
  }, [loading, weeklyFocus, beforeCheckIn, afterTueNoon, hasConfidence, navigate]);

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

    // Use the unified site-based approach to get current week assignments
    const {assignments} = await assembleCurrentWeek(user.id, overrides);
    console.log('assignemnts', assignments)

    if (!assignments || assignments.length === 0) {
      toast({
        title: 'Error',
        description: 'Failed to load Pro Moves',
        variant: 'destructive'
      });
      navigate('/week');
      return;
    }

    // Transform assignments to WeeklyFocus format
    const transformedFocusData: WeeklyFocus[] = assignments.map((assignment) => ({
      id: assignment.weekly_focus_id,
      display_order: assignment.display_order,
      action_statement: assignment.action_statement || '',
      cycle: 1, // Will be updated when we have cycle info in assignments
      week_in_cycle: 1, // Will be updated when we have week info in assignments
      domain_name: assignment.domain_name
    }));

    setWeeklyFocus(transformedFocusData);

    // Check if confidence already submitted for all focus items and prefill selections
    const focusIds = transformedFocusData.map(f => f.id);
    const { data: scoresData } = await supabase
      .from('weekly_scores')
      .select('weekly_focus_id, confidence_score, selected_action_id')
      .eq('staff_id', staffData.id)
      .in('weekly_focus_id', focusIds);

    const submittedCount = (scoresData || []).filter((s) => s.confidence_score !== null).length;
    const hasConfidenceReal = submittedCount === assignments.length;
    const hasConfidenceSimulated = overrides.enabled && overrides.forceHasConfidence !== null 
      ? overrides.forceHasConfidence 
      : hasConfidenceReal;
    setHasConfidence(hasConfidenceSimulated);

    const selectedByFocus: { [key: string]: string | null } = {};
    (scoresData || []).forEach((r) => {
      if (r.selected_action_id) selectedByFocus[r.weekly_focus_id] = String(r.selected_action_id);
    });
    setSelectedActions(selectedByFocus);

    // Load self-select metadata and competency names
    const { data: meta } = await supabase
      .from('weekly_focus')
      .select(`
        id, 
        self_select, 
        competency_id,
        competencies(name)
      `)
      .in('id', focusIds);
    const selfSel: Record<string, boolean> = {};
    const compMap: Record<string, number | null> = {};
    const compNameMap: Record<string, string> = {};
    (meta || []).forEach((m: any) => {
      selfSel[m.id] = !!m.self_select;
      compMap[m.id] = (m.competency_id ?? null) as number | null;
      if (m.competencies?.name) {
        compNameMap[m.id] = m.competencies.name;
      }
    });
    setSelfSelectById(selfSel);
    setCompetencyById(compMap);
    setCompetencyNameById(compNameMap);

    // Fetch options for competencies
    const compIds = Array.from(new Set((meta || [])
      .map((m: any) => m.competency_id)
      .filter((cid: any) => !!cid)));
    if (compIds.length) {
      const { data: opts } = await supabase
        .from('pro_moves')
        .select('action_id, action_statement, competency_id')
        .in('competency_id', compIds)
        .order('action_statement');
      const grouped: { [key: number]: { action_id: string; action_statement: string }[] } = {};
      (opts || []).forEach((o: any) => {
        if (!grouped[o.competency_id]) grouped[o.competency_id] = [];
        grouped[o.competency_id].push({ action_id: String(o.action_id), action_statement: o.action_statement });
      });
      setOptionsByCompetency(grouped);
    }

    setLoading(false);
  };

  const handleNext = () => {
    if (currentIndex < weeklyFocus.length - 1) {
      navigate(`/confidence/current/step/${currentIndex + 2}`);
    } else {
      handleSubmit();
    }
  };

  const handleBack = () => {
    if (currentIndex > 0) {
      navigate(`/confidence/current/step/${currentIndex}`);
    }
  };

  const handleSubmit = async () => {
    if (!staff || !currentFocus) return;

    // Hard-guard: block late submissions after Tue 12:00 CT when not already complete
    const { tueDueZ } = getAnchors(effectiveNow);
    if (effectiveNow >= tueDueZ && !hasConfidence) {
      toast({
        title: 'Confidence window closed',
        description: `You'll get a fresh start on Mon, ${nextMondayStr(effectiveNow)}.`,
      });
      navigate('/week');
      return;
    }

    setSubmitting(true);

    const scoreInserts = weeklyFocus.map(focus => {
      const base: any = {
        staff_id: staff.id,
        weekly_focus_id: focus.id,
        confidence_score: scores[focus.id] || 1,
      };
      if (selfSelectById[focus.id] && selectedActions[focus.id]) {
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
        description: "Great! Come back later to rate your performance."
      });
      navigate('/');
    }

    setSubmitting(false);
  };

  const handleScoreChange = (score: number) => {
    if (!currentFocus) return;
    setScores(prev => ({
      ...prev,
      [currentFocus.id]: score
    }));
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">Loading...</div>
      </div>
    );
  }

  if (!currentFocus) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">Focus item not found</div>
      </div>
    );
  }

  const hasScore = scores[currentFocus.id] !== undefined;
  const hasRequiredSelection = !selfSelectById[currentFocus.id] || selectedActions[currentFocus.id];
  const canProceed = hasScore && hasRequiredSelection;
  const isLastItem = currentIndex === weeklyFocus.length - 1;

  return (
    <div className="min-h-screen p-2 sm:p-4 bg-background">
      <div className="max-w-md mx-auto space-y-4">
        <Card style={{ backgroundColor: getDomainColor(currentFocus.domain_name) }}>
          <CardHeader>
            <div className="flex items-center justify-center">
              <Badge variant="outline" className="bg-white/80 text-gray-900">
                {currentIndex + 1} / {weeklyFocus.length}
              </Badge>
            </div>
            <CardTitle className="text-center text-gray-900">Rate Your Confidence</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6 p-3 sm:p-6">
            <div className="p-3 sm:p-4 bg-white/80 rounded-lg">
              <div className="flex gap-2 mb-2">
                <Badge 
                  variant="secondary" 
                  className="text-xs font-semibold bg-white text-gray-900"
                >
                  {currentFocus.domain_name}
                </Badge>
                {selfSelectById[currentFocus.id] && competencyNameById[currentFocus.id] && (
                  <Badge 
                    variant="outline" 
                    className="text-xs font-semibold bg-white text-gray-700"
                  >
                    {competencyNameById[currentFocus.id]}
                  </Badge>
                )}
              </div>
              
              {selfSelectById[currentFocus.id] ? (
                <div className="space-y-3">
                  <Label htmlFor="pro-move-select" className="text-sm font-medium text-gray-900">
                    Choose the Pro Move you'd like to focus on this week.
                  </Label>
                  <Select
                    value={selectedActions[currentFocus.id] || ""}
                    onValueChange={(value) => {
                      setSelectedActions(prev => ({
                        ...prev,
                        [currentFocus.id]: value
                      }));
                    }}
                  >
                    <SelectTrigger id="pro-move-select" className="w-full">
                      <SelectValue placeholder="Choose a Pro Move..." />
                    </SelectTrigger>
                    <SelectContent className="bg-white border shadow-lg z-50">
                      {competencyById[currentFocus.id] && 
                       optionsByCompetency[competencyById[currentFocus.id]]?.map((option) => (
                        <SelectItem 
                          key={option.action_id} 
                          value={option.action_id}
                          className="cursor-pointer hover:bg-gray-100"
                        >
                          {option.action_statement}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <p className="text-sm font-medium text-gray-900">{currentFocus.action_statement}</p>
              )}
            </div>

            <div className="text-center">
              <p className="text-sm font-medium text-gray-800 mb-4">
                How confident are you that you'll do this 100% this week?
              </p>
            </div>

            <NumberScale
              value={scores[currentFocus.id] || null}
              onChange={handleScoreChange}
            />

            <div className="flex gap-2">
              <Button 
                variant="outline" 
                onClick={() => currentIndex > 0 ? handleBack() : navigate('/')}
                className="flex-1"
              >
                {currentIndex > 0 ? 'Back' : 'Home'}
              </Button>
              <Button 
                onClick={handleNext}
                disabled={!canProceed || submitting}
                className="flex-1"
              >
                {submitting ? 'Saving...' : isLastItem ? 'Submit' : 'Next'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}