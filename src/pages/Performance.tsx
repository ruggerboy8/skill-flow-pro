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
import { nowUtc, getAnchors } from '@/lib/centralTime';
interface Staff {
  id: string;
  role_id: number;
  locations?: {
    organization_id: string;
  };
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
  confidence_date?: string | null;
}


export default function Performance() {
  const { week } = useParams();
  const [staff, setStaff] = useState<Staff | null>(null);
  const [weeklyFocus, setWeeklyFocus] = useState<WeeklyFocus[]>([]);
  const [existingScores, setExistingScores] = useState<WeeklyScore[]>([]);
  const [performanceScores, setPerformanceScores] = useState<{ [key: string]: number }>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [isCarryoverWeek, setIsCarryoverWeek] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [showCarryoverBanner, setShowCarryoverBanner] = useState<boolean>(Boolean((location.state as any)?.carryover));

  const weekNum = Number(week); // week param is now just "1", "2", etc.

// Central Time gating for Performance (opens Thu 00:00 CT; allowed anytime for past weeks)
  const now = nowUtc();
  const { thuStartZ, mondayZ } = getAnchors(now);
  let beforeThursday = now < thuStartZ;
  const beforeThursdayEffective = beforeThursday && !isCarryoverWeek;

  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user, week]);

  // No longer blocking access - users can submit anytime

  const loadData = async () => {
    if (!user) return;

    // Load staff profile
    const { data: staffData, error: staffError } = await supabase
      .from('staff')
      .select('id, role_id, locations(organization_id)')
      .eq('user_id', user.id)
      .single();

    if (staffError || !staffData) {
      navigate('/setup');
      return;
    }

    setStaff(staffData);

    // Try weekly_plan first (for orgs with sequencer)
    const orgId = staffData.locations?.organization_id;
    let focusData: any[] | null = null;
    let focusError: any = null;
    
    if (orgId) {
      // Calculate current Monday
      const now = new Date();
      const dayOfWeek = now.getDay();
      const daysToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      const thisMonday = new Date(now);
      thisMonday.setDate(now.getDate() + daysToMonday);
      thisMonday.setHours(0, 0, 0, 0);
      const mondayStr = thisMonday.toISOString().split('T')[0];

      const { data: planData, error: planError } = await supabase
        .from('weekly_plan')
        .select(`
          id,
          action_id,
          display_order,
          self_select,
          pro_moves (
            action_id,
            action_statement,
            competency_id,
            competencies (
              competency_id,
              name,
              domain_id,
              domains!competencies_domain_id_fkey (
                domain_id,
                domain_name
              )
            )
          )
        `)
        .eq('org_id', orgId)
        .eq('role_id', staffData.role_id)
        .eq('week_start_date', mondayStr)
        .eq('status', 'locked')
        .order('display_order');

      if (planData && planData.length > 0) {
        console.log('📊 [Performance] Using weekly_plan data source');
        focusData = planData.map((item: any) => ({
          id: `plan:${item.id}`,
          action_id: item.action_id,
          display_order: item.display_order,
          self_select: item.self_select,
          pro_moves: { action_statement: item.pro_moves?.action_statement },
          competencies: {
            domains: {
              domain_name: item.pro_moves?.competencies?.domains?.domain_name
            }
          }
        }));
      }
    }

    // Fall back to weekly_focus if no weekly_plan data
    if (!focusData) {
      console.log('📚 [Performance] Using weekly_focus data source (fallback)');
      const result = await supabase
        .from('weekly_focus')
        .select(`
          id,
          display_order,
          self_select,
          pro_moves (
            action_statement
          ),
          competencies (
            domains!competencies_domain_id_fkey ( domain_name )
          )
        `)
        .eq('cycle', 1) // Use cycle 1 for now
        .eq('week_in_cycle', weekNum)
        .eq('role_id', staffData.role_id)
        .order('display_order');
      
      focusData = result.data;
      focusError = result.error;
    }

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
      .select('id, weekly_focus_id, confidence_score, confidence_date')
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

    // If confidence was submitted before this Monday, this is a carryover week → allow performance even Mon–Wed
    const carryover = (scoresData || []).some((s) => s.confidence_date && new Date(s.confidence_date) < mondayZ);
    setIsCarryoverWeek(carryover);
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
      </div>
    </div>
  );
}