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
  const { focusId, index } = useParams();
  const [staff, setStaff] = useState<Staff | null>(null);
  const [weeklyFocus, setWeeklyFocus] = useState<WeeklyFocus[]>([]);
  const [currentFocus, setCurrentFocus] = useState<WeeklyFocus | null>(null);
  const [scores, setScores] = useState<{ [key: string]: number }>({});
  const [selectedActions, setSelectedActions] = useState<{ [key: string]: string | null }>({});
  const [selfSelectById, setSelfSelectById] = useState<Record<string, boolean>>({});
  const [competencyById, setCompetencyById] = useState<Record<string, number | null>>({});
  const [optionsByCompetency, setOptionsByCompetency] = useState<{ [key: number]: { action_id: string; action_statement: string }[] }>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [hasConfidence, setHasConfidence] = useState(false);
  const { user } = useAuth();
const { toast } = useToast();
const navigate = useNavigate();

  const now = nowUtc();
  const { monCheckInZ, tueDueZ } = getAnchors(now);
  const beforeCheckIn = now < monCheckInZ;
  const afterTueNoon = now >= tueDueZ;

  const currentIndex = parseInt(index || '1') - 1;

  useEffect(() => {
    if (user && focusId) {
      loadData();
    }
  }, [user, focusId]);

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
          description: `You’ll get a fresh start on Mon, ${nextMondayStr(now)}.`
        });
        navigate('/week');
      }
    }
  }, [loading, weeklyFocus, beforeCheckIn, afterTueNoon, hasConfidence, navigate]);

  const loadData = async () => {
    if (!user || !focusId) return;

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

    // Get the focus item details first
    const { data: focusDetails, error: focusDetailsError } = await supabase
      .from('weekly_focus')
      .select('id, cycle, week_in_cycle')
      .eq('id', focusId)
      .single();

    if (focusDetailsError || !focusDetails) {
      toast({
        title: "Error",
        description: "Focus item not found",
        variant: "destructive"
      });
      navigate('/');
      return;
    }

    // Load all weekly focus for this cycle/week
    const { data: focusData, error: focusError } = await supabase.rpc('get_focus_cycle_week', {
      p_cycle: focusDetails.cycle,
      p_week: focusDetails.week_in_cycle,
      p_role_id: staffData.role_id
    }) as { data: WeeklyFocus[] | null; error: any };

    if (focusError || !focusData) {
      toast({
        title: "Error",
        description: "Failed to load Pro Moves",
        variant: "destructive"
      });
      navigate('/');
      return;
    }

setWeeklyFocus(focusData);
setCurrentFocus(focusData[currentIndex]);

// Check if confidence already submitted for all focus items and prefill selections
const focusIds = focusData.map(f => f.id);
const { data: scoresData } = await supabase
  .from('weekly_scores')
  .select('weekly_focus_id, confidence_score, selected_action_id')
  .eq('staff_id', staffData.id)
  .in('weekly_focus_id', focusIds);

const submittedCount = (scoresData || []).filter((s) => s.confidence_score !== null).length;
setHasConfidence(submittedCount === focusData.length);

// Build selection map from existing
const selectedByFocus: { [key: string]: string | null } = {};
(scoresData || []).forEach((r) => {
  if (r.selected_action_id) selectedByFocus[r.weekly_focus_id] = r.selected_action_id as unknown as string;
});
setSelectedActions(selectedByFocus);

// Load self-select metadata
const { data: meta } = await supabase
  .from('weekly_focus')
  .select('id, self_select, competency_id')
  .in('id', focusIds);
const selfSel: Record<string, boolean> = {};
const compMap: Record<string, number | null> = {};
(meta || []).forEach((m: any) => {
  selfSel[m.id] = !!m.self_select;
  compMap[m.id] = (m.competency_id ?? null) as number | null;
});
setSelfSelectById(selfSel);
setCompetencyById(compMap);

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
      const nextFocus = weeklyFocus[currentIndex + 1];
      navigate(`/confidence/${nextFocus.id}/${currentIndex + 2}`);
    } else {
      handleSubmit();
    }
  };

  const handleBack = () => {
    if (currentIndex > 0) {
      const prevFocus = weeklyFocus[currentIndex - 1];
      navigate(`/confidence/${prevFocus.id}/${currentIndex}`);
    }
  };

  const handleSubmit = async () => {
    if (!staff || !currentFocus) return;

    // Hard-guard: block late submissions after Tue 12:00 CT when not already complete
    const nowSubmit = nowUtc();
    const { tueDueZ } = getAnchors(nowSubmit);
    if (nowSubmit >= tueDueZ && !hasConfidence) {
      toast({
        title: 'Confidence window closed',
        description: `You’ll get a fresh start on Mon, ${nextMondayStr(nowSubmit)}.`,
      });
      navigate('/week');
      return;
    }

    setSubmitting(true);

    const scoreInserts = weeklyFocus.map(focus => ({
      staff_id: staff.id,
      weekly_focus_id: focus.id,
      confidence_score: scores[focus.id] || 1
    }));

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
              <Badge 
                variant="secondary" 
                className="text-xs font-semibold mb-2 bg-white text-gray-900"
              >
                {currentFocus.domain_name}
              </Badge>
              <p className="text-sm font-medium text-gray-900">{currentFocus.action_statement}</p>
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
                disabled={!hasScore || submitting}
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