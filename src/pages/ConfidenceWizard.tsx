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
  const { week, n } = useParams();
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

  const weekNum = Number(week);
  
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
  }, [user, week, n]);

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

    // Determine user's current cycle/week position (like assembleWeek does)
    // First try ISO week lookup
    let { data: focusData, error: focusError } = await supabase
      .from('weekly_focus')
      .select(`
        id,
        display_order,
        action_id,
        competency_id,
        cycle,
        week_in_cycle,
        self_select,
        pro_moves(action_statement),
        competencies(
          domain_id,
          domains(domain_name)
        )
      `)
      .eq('iso_year', 2025)
      .eq('iso_week', weekNum)
      .eq('role_id', staffData.role_id)
      .order('display_order');

    // If no ISO week data, fall back to cycle/week logic (like assembleWeek)
    if (!focusData || focusData.length === 0) {
      // Check if user completed backfill to determine cycle position
      const { data: hasScores } = await supabase
        .from('weekly_scores')
        .select('id')
        .eq('staff_id', staffData.id)
        .limit(1);

      if (hasScores && hasScores.length > 0) {
        // User completed backfill, should be on cycle 2 week 1
        const { data: cycle2Data } = await supabase
          .from('weekly_focus')
          .select(`
            id,
            display_order,
            action_id,
            competency_id,
            cycle,
            week_in_cycle,
            self_select,
            pro_moves(action_statement),
            competencies(
              domain_id,
              domains(domain_name)
            )
          `)
          .eq('cycle', 2)
          .eq('week_in_cycle', 1)
          .eq('role_id', staffData.role_id)
          .order('display_order');
        
        if (cycle2Data) focusData = cycle2Data;
      }
    }

    if (focusError || !focusData || focusData.length === 0) {
      toast({
        title: 'Error',
        description: 'Failed to load Pro Moves',
        variant: 'destructive'
      });
      navigate('/week');
      return;
    }

    // Transform the data to match WeeklyFocus interface
    const transformedFocusData: WeeklyFocus[] = focusData.map((item: any) => ({
      id: item.id,
      display_order: item.display_order,
      action_statement: item.pro_moves?.action_statement || '',
      cycle: item.cycle,
      week_in_cycle: item.week_in_cycle,
      domain_name: item.competencies?.domains?.domain_name || 'Unknown'
    }));

    setWeeklyFocus(transformedFocusData);
    setCurrentFocus(transformedFocusData[currentIndex]);

    // Check if confidence already submitted for all focus items and prefill selections
    const focusIds = transformedFocusData.map(f => f.id);
    const { data: scoresData } = await supabase
      .from('weekly_scores')
      .select('weekly_focus_id, confidence_score, selected_action_id')
      .eq('staff_id', staffData.id)
      .in('weekly_focus_id', focusIds);

    const submittedCount = (scoresData || []).filter((s) => s.confidence_score !== null).length;
    const hasConfidenceReal = submittedCount === focusData.length;
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
      navigate(`/confidence/${weekNum}/step/${currentIndex + 2}`);
    } else {
      handleSubmit();
    }
  };

  const handleBack = () => {
    if (currentIndex > 0) {
      navigate(`/confidence/${weekNum}/step/${currentIndex}`);
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
            <CardDescription className="text-center text-gray-800">
              How confident are you that you'll do this 100% this week?
            </CardDescription>
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

            <NumberScale
              value={scores[currentFocus.id] || null}
              onChange={handleScoreChange}
            />

            <div className="flex gap-2">
              {currentIndex > 0 && (
                <Button 
                  variant="outline" 
                  onClick={handleBack}
                  className="flex-1"
                >
                  Back
                </Button>
              )}
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
