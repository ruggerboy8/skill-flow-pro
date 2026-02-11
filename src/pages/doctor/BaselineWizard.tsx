import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useStaffProfile } from '@/hooks/useStaffProfile';
import { BaselineWelcome } from '@/components/doctor/BaselineWelcome';
import { DomainAssessmentStep } from '@/components/doctor/DomainAssessmentStep';
import { BaselineComplete } from '@/components/doctor/BaselineComplete';
import { BaselineTutorial } from '@/components/doctor/BaselineTutorial';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';

interface DomainGroup {
  domain_id: number;
  domain_name: string;
  color_hex: string;
  proMoves: ProMoveItem[];
}

interface ProMoveItem {
  action_id: number;
  action_statement: string;
  competency_name: string;
}

export default function BaselineWizard() {
  const { data: staff } = useStaffProfile();
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  
  const [currentStep, setCurrentStep] = useState<'welcome' | 'assessment' | 'complete'>('welcome');
  const [currentDomainIndex, setCurrentDomainIndex] = useState(0);
  const [assessmentId, setAssessmentId] = useState<string | null>(null);
  const [ratings, setRatings] = useState<Record<number, { score: number | null; note: string }>>({});
  const [showTutorial, setShowTutorial] = useState(false);
  const [forceOpenProMoveId, setForceOpenProMoveId] = useState<number | null>(null);

  // Fetch existing assessment
  const { data: existingAssessment } = useQuery({
    queryKey: ['my-baseline-assessment', staff?.id],
    queryFn: async () => {
      if (!staff?.id) return null;
      const { data, error } = await supabase
        .from('doctor_baseline_assessments')
        .select('id, status')
        .eq('doctor_staff_id', staff.id)
        .maybeSingle();
      
      if (error) throw error;
      return data;
    },
    enabled: !!staff?.id,
  });

  // Fetch existing ratings if resuming
  const { data: existingItems } = useQuery({
    queryKey: ['my-baseline-items', assessmentId],
    queryFn: async () => {
      if (!assessmentId) return [];
      const { data, error } = await supabase
        .from('doctor_baseline_items')
        .select('action_id, self_score, self_note')
        .eq('assessment_id', assessmentId);
      
      if (error) throw error;
      return data;
    },
    enabled: !!assessmentId,
  });

  // Fetch doctor pro moves grouped by domain
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
        const competency = pm.competencies;
        const domain = competency?.domains;
        
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
          competency_name: competency?.name || '',
        });
      });
      
      return Array.from(domainMap.values());
    },
  });

  // Initialize assessment on component load
  useEffect(() => {
    if (existingAssessment?.status === 'completed') {
      navigate('/doctor');
    } else if (existingAssessment?.id) {
      setAssessmentId(existingAssessment.id);
      setCurrentStep('assessment');
    }
  }, [existingAssessment, navigate]);

  // Load existing ratings when resuming
  useEffect(() => {
    if (existingItems?.length) {
      const loadedRatings: Record<number, { score: number | null; note: string }> = {};
      existingItems.forEach(item => {
        loadedRatings[item.action_id] = {
          score: item.self_score,
          note: item.self_note || '',
        };
      });
      setRatings(loadedRatings);
    }
  }, [existingItems]);

  // Show tutorial when entering assessment for the first time
  useEffect(() => {
    if (currentStep === 'assessment' && domains?.length) {
      const seen = localStorage.getItem('baseline-tutorial-seen');
      if (!seen) {
        // Small delay to let DOM render
        const timer = setTimeout(() => setShowTutorial(true), 500);
        return () => clearTimeout(timer);
      }
    }
  }, [currentStep, domains]);

  // Create assessment mutation
  const createAssessmentMutation = useMutation({
    mutationFn: async () => {
      if (!staff?.id) throw new Error('No staff ID');
      
      const { data, error } = await supabase
        .from('doctor_baseline_assessments')
        .insert({
          doctor_staff_id: staff.id,
          status: 'in_progress',
        })
        .select('id')
        .single();
      
      if (error) throw error;
      return data.id;
    },
    onSuccess: (id) => {
      setAssessmentId(id);
      setCurrentStep('assessment');
    },
    onError: (error: Error) => {
      toast({
        title: 'Error starting assessment',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Save rating mutation
  const saveRatingMutation = useMutation({
    mutationFn: async ({ actionId, score, note }: { actionId: number; score: number | null; note: string }) => {
      if (!assessmentId) throw new Error('No assessment ID');
      
      const { error } = await supabase
        .from('doctor_baseline_items')
        .upsert({
          assessment_id: assessmentId,
          action_id: actionId,
          self_score: score,
          self_note: note || null,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'assessment_id,action_id',
        });
      
      if (error) throw error;
    },
  });

  // Complete assessment mutation
  const completeAssessmentMutation = useMutation({
    mutationFn: async () => {
      if (!assessmentId) throw new Error('No assessment ID');
      
      const { error } = await supabase
        .from('doctor_baseline_assessments')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
        })
        .eq('id', assessmentId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-baseline'] });
      setCurrentStep('complete');
    },
    onError: (error: Error) => {
      toast({
        title: 'Error completing assessment',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleStart = () => {
    if (existingAssessment?.id) {
      setAssessmentId(existingAssessment.id);
      setCurrentStep('assessment');
    } else {
      createAssessmentMutation.mutate();
    }
  };

  const handleRatingChange = (actionId: number, score: number | null, note: string = '') => {
    const existingNote = ratings[actionId]?.note || '';
    setRatings(prev => ({
      ...prev,
      [actionId]: { score, note: note || existingNote },
    }));
    
    saveRatingMutation.mutate({ actionId, score, note: note || existingNote });
  };

  // Separate note-only save
  const saveNoteMutation = useMutation({
    mutationFn: async ({ actionId, note }: { actionId: number; note: string }) => {
      if (!assessmentId) throw new Error('No assessment ID');
      
      const { error } = await supabase
        .from('doctor_baseline_items')
        .upsert({
          assessment_id: assessmentId,
          action_id: actionId,
          self_note: note || null,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'assessment_id,action_id',
          ignoreDuplicates: false,
        });
      
      if (error) throw error;
    },
  });

  const handleNoteChange = (actionId: number, noteText: string) => {
    setRatings(prev => ({
      ...prev,
      [actionId]: { score: prev[actionId]?.score ?? null, note: noteText },
    }));
    
    const existingScore = ratings[actionId]?.score;
    if (existingScore !== null && existingScore !== undefined) {
      saveRatingMutation.mutate({ actionId, score: existingScore, note: noteText });
    } else {
      saveNoteMutation.mutate({ actionId, note: noteText });
    }
  };

  const handleNextDomain = () => {
    if (domains && currentDomainIndex < domains.length - 1) {
      setCurrentDomainIndex(prev => prev + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handlePrevDomain = () => {
    if (currentDomainIndex > 0) {
      setCurrentDomainIndex(prev => prev - 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleComplete = () => {
    completeAssessmentMutation.mutate();
  };

  const handleFinish = () => {
    navigate('/doctor');
  };

  const handleTutorialComplete = () => {
    setShowTutorial(false);
    localStorage.setItem('baseline-tutorial-seen', 'true');
  };

  if (domainsLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!domains || domains.length === 0) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="text-center py-12">
          <p className="text-muted-foreground">No doctor pro moves found. Please contact administration.</p>
        </div>
      </div>
    );
  }

  const totalProMoves = domains?.reduce((sum, d) => sum + d.proMoves.length, 0) || 0;
  const ratedCount = Object.values(ratings).filter(r => r.score !== null).length;
  const progressPct = totalProMoves > 0 ? Math.round((ratedCount / totalProMoves) * 100) : 0;
  const isLastDomain = domains ? currentDomainIndex === domains.length - 1 : false;
  const allRated = ratedCount === totalProMoves;

  // Get first pro move ID for tutorial targeting
  const firstProMove = domains[0]?.proMoves[0];

  return (
    <div className="max-w-4xl mx-auto">
      {currentStep === 'welcome' && (
        <BaselineWelcome 
          staffName={staff?.name || 'Doctor'}
          onStart={handleStart}
          isLoading={createAssessmentMutation.isPending}
        />
      )}

      {currentStep === 'assessment' && domains && domains[currentDomainIndex] && (
        <div className="space-y-6">
          {/* Progress header */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <button
                type="button"
                onClick={() => { setForceOpenProMoveId(null); setShowTutorial(true); }}
                className="text-xs text-muted-foreground hover:text-foreground underline"
              >
                View tutorial
              </button>
              <span className="text-muted-foreground">
                Domain {currentDomainIndex + 1} of {domains.length}
              </span>
              <span>{ratedCount} of {totalProMoves} Pro Moves rated</span>
            </div>
            <Progress value={progressPct} className="h-2" />
          </div>

          <DomainAssessmentStep
            domain={domains[currentDomainIndex]}
            ratings={ratings}
            onRatingChange={handleRatingChange}
            onNoteChange={handleNoteChange}
            onPrevious={currentDomainIndex > 0 ? handlePrevDomain : undefined}
            onNext={isLastDomain ? undefined : handleNextDomain}
            onComplete={isLastDomain && allRated ? handleComplete : undefined}
            isCompleting={completeAssessmentMutation.isPending}
            forceOpenProMoveId={forceOpenProMoveId}
          />
        </div>
      )}

      {currentStep === 'complete' && (
        <BaselineComplete onFinish={handleFinish} assessmentId={assessmentId} />
      )}

      {/* Tutorial overlay */}
      {showTutorial && firstProMove && (
        <BaselineTutorial
          firstActionId={firstProMove.action_id}
          onComplete={handleTutorialComplete}
          onForceOpenMaterials={(actionId) => setForceOpenProMoveId(actionId)}
        />
      )}
    </div>
  );
}
