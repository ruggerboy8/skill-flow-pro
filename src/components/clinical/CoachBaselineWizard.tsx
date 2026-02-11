import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useStaffProfile } from '@/hooks/useStaffProfile';
import { DomainAssessmentStep } from '@/components/doctor/DomainAssessmentStep';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { CheckCircle2, ArrowLeft } from 'lucide-react';

interface DomainGroup {
  domain_id: number;
  domain_name: string;
  color_hex: string;
  proMoves: { action_id: number; action_statement: string; competency_name: string }[];
}

interface CoachBaselineWizardProps {
  doctorStaffId: string;
  doctorName: string;
  onBack: () => void;
}

export function CoachBaselineWizard({ doctorStaffId, doctorName, onBack }: CoachBaselineWizardProps) {
  const { data: staff } = useStaffProfile();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [currentDomainIndex, setCurrentDomainIndex] = useState(0);
  const [assessmentId, setAssessmentId] = useState<string | null>(null);
  const [ratings, setRatings] = useState<Record<number, { score: number | null; note: string }>>({});
  const [isComplete, setIsComplete] = useState(false);

  // Fetch or create assessment
  const { data: existingAssessment } = useQuery({
    queryKey: ['coach-baseline-assessment', doctorStaffId, staff?.id],
    queryFn: async () => {
      if (!staff?.id) return null;
      const { data, error } = await supabase
        .from('coach_baseline_assessments')
        .select('id, status')
        .eq('doctor_staff_id', doctorStaffId)
        .eq('coach_staff_id', staff.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!staff?.id,
  });

  // Fetch existing items
  const { data: existingItems } = useQuery({
    queryKey: ['coach-baseline-items', assessmentId],
    queryFn: async () => {
      if (!assessmentId) return [];
      const { data, error } = await supabase
        .from('coach_baseline_items')
        .select('action_id, rating, note_text')
        .eq('assessment_id', assessmentId);
      if (error) throw error;
      return data;
    },
    enabled: !!assessmentId,
  });

  // Fetch doctor pro moves by domain (same as BaselineWizard)
  const { data: domains, isLoading: domainsLoading } = useQuery({
    queryKey: ['doctor-pro-moves-by-domain'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pro_moves')
        .select(`
          action_id,
          action_statement,
          competencies!fk_pro_moves_competency_id (
            name,
            domains!competencies_domain_id_fkey (
              domain_id,
              domain_name,
              color_hex
            )
          )
        `)
        .eq('role_id', 4)
        .eq('active', true)
        .order('action_id');
      if (error) throw error;

      const domainMap = new Map<number, DomainGroup>();
      data?.forEach((pm: any) => {
        const domain = pm.competencies?.domains;
        if (!domain?.domain_id) return;
        if (!domainMap.has(domain.domain_id)) {
          domainMap.set(domain.domain_id, {
            domain_id: domain.domain_id,
            domain_name: domain.domain_name,
            color_hex: domain.color_hex,
            proMoves: [],
          });
        }
        domainMap.get(domain.domain_id)!.proMoves.push({
          action_id: pm.action_id,
          action_statement: pm.action_statement,
          competency_name: pm.competencies?.name || '',
        });
      });
      return Array.from(domainMap.values());
    },
  });

  useEffect(() => {
    if (existingAssessment?.id) {
      setAssessmentId(existingAssessment.id);
      if (existingAssessment.status === 'completed') setIsComplete(true);
    }
  }, [existingAssessment]);

  useEffect(() => {
    if (existingItems?.length) {
      const loaded: Record<number, { score: number | null; note: string }> = {};
      existingItems.forEach(item => {
        loaded[item.action_id] = { score: item.rating, note: item.note_text || '' };
      });
      setRatings(loaded);
    }
  }, [existingItems]);

  // Create assessment
  const createMutation = useMutation({
    mutationFn: async () => {
      if (!staff?.id) throw new Error('No staff ID');
      const { data, error } = await supabase
        .from('coach_baseline_assessments')
        .insert({ doctor_staff_id: doctorStaffId, coach_staff_id: staff.id, status: 'in_progress' })
        .select('id')
        .single();
      if (error) throw error;
      return data.id;
    },
    onSuccess: (id) => setAssessmentId(id),
    onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  // Save rating
  const saveRatingMutation = useMutation({
    mutationFn: async ({ actionId, score, note }: { actionId: number; score: number | null; note: string }) => {
      if (!assessmentId) throw new Error('No assessment');
      const { error } = await supabase
        .from('coach_baseline_items')
        .upsert({
          assessment_id: assessmentId,
          action_id: actionId,
          rating: score,
          note_text: note || null,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'assessment_id,action_id' });
      if (error) throw error;
    },
  });

  // Note-only save
  const saveNoteMutation = useMutation({
    mutationFn: async ({ actionId, note }: { actionId: number; note: string }) => {
      if (!assessmentId) throw new Error('No assessment');
      const { error } = await supabase
        .from('coach_baseline_items')
        .upsert({
          assessment_id: assessmentId,
          action_id: actionId,
          note_text: note || null,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'assessment_id,action_id' });
      if (error) throw error;
    },
  });

  // Complete
  const completeMutation = useMutation({
    mutationFn: async () => {
      if (!assessmentId) throw new Error('No assessment');
      const { error } = await supabase
        .from('coach_baseline_assessments')
        .update({ status: 'completed', completed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', assessmentId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['coach-baseline-assessment'] });
      setIsComplete(true);
    },
    onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const handleRatingChange = (actionId: number, score: number | null, note: string = '') => {
    const existingNote = ratings[actionId]?.note || '';
    setRatings(prev => ({ ...prev, [actionId]: { score, note: note || existingNote } }));
    saveRatingMutation.mutate({ actionId, score, note: note || existingNote });
  };

  const handleNoteChange = (actionId: number, noteText: string) => {
    setRatings(prev => ({ ...prev, [actionId]: { score: prev[actionId]?.score ?? null, note: noteText } }));
    const existingScore = ratings[actionId]?.score;
    if (existingScore !== null && existingScore !== undefined) {
      saveRatingMutation.mutate({ actionId, score: existingScore, note: noteText });
    } else {
      saveNoteMutation.mutate({ actionId, note: noteText });
    }
  };

  // Auto-create assessment if none exists
  useEffect(() => {
    if (staff?.id && existingAssessment === null && !assessmentId && !createMutation.isPending) {
      createMutation.mutate();
    }
  }, [staff?.id, existingAssessment, assessmentId]);

  if (domainsLoading || !domains) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (isComplete) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <Button variant="ghost" onClick={onBack} className="gap-2">
          <ArrowLeft className="h-4 w-4" /> Back to Doctor Detail
        </Button>
        <Card>
          <CardContent className="pt-6 text-center space-y-4">
            <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto" />
            <h2 className="text-xl font-semibold">Assessment Complete</h2>
            <p className="text-muted-foreground">
              Your private baseline assessment for {doctorName} has been saved.
              You can view the comparison on the doctor's detail page.
            </p>
            <Button onClick={onBack}>Return to Doctor Detail</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const totalProMoves = domains.reduce((sum, d) => sum + d.proMoves.length, 0);
  const ratedCount = Object.values(ratings).filter(r => r.score !== null).length;
  const progressPct = totalProMoves > 0 ? Math.round((ratedCount / totalProMoves) * 100) : 0;
  const isLastDomain = currentDomainIndex === domains.length - 1;
  const allRated = ratedCount === totalProMoves;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Button variant="ghost" onClick={onBack} className="gap-2">
        <ArrowLeft className="h-4 w-4" /> Back to Doctor Detail
      </Button>

      <div>
        <h1 className="text-xl font-semibold">Private Assessment: {doctorName}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Rate each Pro Move based on your observations. This is visible only to clinical directors.
        </p>
      </div>

      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Domain {currentDomainIndex + 1} of {domains.length}</span>
          <span>{ratedCount} of {totalProMoves} Pro Moves rated</span>
        </div>
        <Progress value={progressPct} className="h-2" />
      </div>

      {domains[currentDomainIndex] && (
        <DomainAssessmentStep
          domain={domains[currentDomainIndex]}
          ratings={ratings}
          onRatingChange={handleRatingChange}
          onNoteChange={handleNoteChange}
          onPrevious={currentDomainIndex > 0 ? () => setCurrentDomainIndex(i => i - 1) : undefined}
          onNext={isLastDomain ? undefined : () => setCurrentDomainIndex(i => i + 1)}
          onComplete={isLastDomain && allRated ? () => completeMutation.mutate() : undefined}
          isCompleting={completeMutation.isPending}
        />
      )}
    </div>
  );
}
