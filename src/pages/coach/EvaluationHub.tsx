import React, { useState, useEffect } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { ArrowLeft, Check, ChevronLeft, ChevronRight, Plus, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { getDomainColor } from '@/lib/domainColors';
import { supabase } from '@/integrations/supabase/client';
import {
  getEvaluation,
  setObserverScore,
  setObserverNote,
  setSelfScore,
  setSelfNote,
  submitEvaluation,
  deleteEvaluation,
  isEvaluationComplete,
  type EvaluationWithItems
} from '@/lib/evaluations';

const SCORE_OPTIONS = [
  { value: 1, label: '1 - Needs Development', color: 'bg-red-100 text-red-800 border-red-200' },
  { value: 2, label: '2 - Developing', color: 'bg-orange-100 text-orange-800 border-orange-200' },
  { value: 3, label: '3 - Proficient', color: 'bg-blue-100 text-blue-800 border-blue-200' },
  { value: 4, label: '4 - Advanced', color: 'bg-green-100 text-green-800 border-green-200' }
];

export function EvaluationHub() {
  const { staffId, evalId } = useParams<{ staffId: string; evalId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [evaluation, setEvaluation] = useState<EvaluationWithItems | null>(null);
  const [staffName, setStaffName] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState(searchParams.get('phase') === 'self' ? 'self-assessment' : 'observation');
  const [currentSelfIndex, setCurrentSelfIndex] = useState(0);
  const [showObserverNotes, setShowObserverNotes] = useState<Record<number, boolean>>({});
  const [showSelfNote, setShowSelfNote] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (evalId) {
      loadEvaluation();
    }
  }, [evalId]);

  const loadEvaluation = async () => {
    if (!evalId) return;
    
    try {
      setLoading(true);
      const data = await getEvaluation(evalId);
      if (!data) {
        toast({
          title: "Error",
          description: "Evaluation not found",
          variant: "destructive"
        });
        navigate(`/coach/${staffId}`);
        return;
      }
      setEvaluation(data);

      // Fetch staff information
      const { data: staffData } = await supabase
        .from('staff')
        .select('name')
        .eq('id', data.staff_id)
        .single();
      
      if (staffData) {
        setStaffName(staffData.name);
      }
    } catch (error) {
      console.error('Failed to load evaluation:', error);
      toast({
        title: "Error",
        description: "Failed to load evaluation",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleObserverScoreChange = async (competencyId: number, score: number | null) => {
    if (!evalId) return;
    
    try {
      setSaving(true);
      await setObserverScore(evalId, competencyId, score);
      
      // Update local state
      setEvaluation(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          items: prev.items.map(item => 
            item.competency_id === competencyId 
              ? { ...item, observer_score: score }
              : item
          )
        };
      });

      toast({
        title: "Saved",
        description: "Observer score updated",
        variant: "default"
      });
    } catch (error) {
      console.error('Failed to update observer score:', error);
      toast({
        title: "Error",
        description: "Failed to save score",
        variant: "destructive"
      });
    } finally {
      setSaving(false);
    }
  };

  const handleObserverNoteChange = async (competencyId: number, note: string) => {
    if (!evalId) return;
    
    try {
      await setObserverNote(evalId, competencyId, note);
      
      // Update local state
      setEvaluation(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          items: prev.items.map(item => 
            item.competency_id === competencyId 
              ? { ...item, observer_note: note }
              : item
          )
        };
      });
    } catch (error) {
      console.error('Failed to update observer note:', error);
      toast({
        title: "Error",
        description: "Failed to save note",
        variant: "destructive"
      });
    }
  };

  const handleSelfScoreChange = async (competencyId: number, score: number | null) => {
    if (!evalId) return;
    
    try {
      setSaving(true);
      await setSelfScore(evalId, competencyId, score);
      
      // Update local state
      setEvaluation(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          items: prev.items.map(item => 
            item.competency_id === competencyId 
              ? { ...item, self_score: score }
              : item
          )
        };
      });

      toast({
        title: "Saved",
        description: "Self-assessment score updated",
        variant: "default"
      });
    } catch (error) {
      console.error('Failed to update self score:', error);
      toast({
        title: "Error",
        description: "Failed to save score",
        variant: "destructive"
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSelfNoteChange = async (competencyId: number, note: string) => {
    if (!evalId) return;
    
    try {
      await setSelfNote(evalId, competencyId, note);
      
      // Update local state
      setEvaluation(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          items: prev.items.map(item => 
            item.competency_id === competencyId 
              ? { ...item, self_note: note }
              : item
          )
        };
      });
    } catch (error) {
      console.error('Failed to update self note:', error);
      toast({
        title: "Error",
        description: "Failed to save note",
        variant: "destructive"
      });
    }
  };

  const handleSubmitEvaluation = async () => {
    if (!evalId || !evaluation) return;
    
    try {
      setIsSubmitting(true);
      await submitEvaluation(evalId);
      
      toast({
        title: "Success",
        description: "Evaluation submitted successfully",
        variant: "default"
      });

      // Refresh evaluation data
      await loadEvaluation();
    } catch (error) {
      console.error('Failed to submit evaluation:', error);
      toast({
        title: "Error",
        description: "Failed to submit evaluation",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteEvaluation = async () => {
    if (!evalId) return;
    
    try {
      setIsDeleting(true);
      await deleteEvaluation(evalId);
      
      toast({
        title: "Success",
        description: "Evaluation deleted successfully",
        variant: "default"
      });

      // Navigate back to staff detail page
      navigate(`/coach/${staffId}`);
    } catch (error) {
      console.error('Failed to delete evaluation:', error);
      toast({
        title: "Error",
        description: "Failed to delete evaluation",
        variant: "destructive"
      });
    } finally {
      setIsDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-1/3"></div>
          <div className="h-32 bg-muted rounded"></div>
          <div className="h-64 bg-muted rounded"></div>
        </div>
      </div>
    );
  }

  if (!evaluation) {
    return (
      <div className="max-w-6xl mx-auto p-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Evaluation Not Found</h1>
          <Button onClick={() => navigate(`/coach/${staffId}`)}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Staff Detail
          </Button>
        </div>
      </div>
    );
  }

  const completionStatus = isEvaluationComplete(evaluation);
  const isReadOnly = evaluation.status === 'submitted';
  const currentItem = evaluation.items[currentSelfIndex];
  
  // Calculate observation completion count
  const observerScoresCount = evaluation.items.filter(item => item.observer_score !== null).length;
  const totalItems = evaluation.items.length;

  return (
    <div className="max-w-6xl mx-auto p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-4">
          <Button 
            variant="outline" 
            onClick={() => navigate(`/coach/${staffId}`)}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold">
              {evaluation.type} {evaluation.quarter ? `${evaluation.quarter} ` : ''}{evaluation.program_year} Evaluation
            </h1>
            <p className="text-muted-foreground">
              {staffName || 'Staff Member'} • {evaluation.status === 'draft' ? 'Draft' : 'Submitted'}
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button 
                variant="outline" 
                size="sm"
                disabled={isDeleting}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Evaluation</AlertDialogTitle>
                <AlertDialogDescription>
                  This action cannot be undone. Are you sure you want to delete this evaluation report?
                  This will permanently remove the evaluation and all associated data.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction 
                  onClick={handleDeleteEvaluation}
                  disabled={isDeleting}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {isDeleting ? "Deleting..." : "Delete"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          {isReadOnly && <Badge variant="default">Submitted</Badge>}
        </div>
      </div>

      {/* Progress & Submit Bar */}
      {!isReadOnly && (
        <Card className="mb-6">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-6">
                <div className="flex items-center space-x-2">
                  {completionStatus.observerComplete ? (
                    <Check className="w-5 h-5 text-green-600" />
                  ) : (
                    <div className="w-5 h-5 rounded-full border-2 border-muted-foreground"></div>
                  )}
                  <span className={cn(
                     "font-medium",
                     completionStatus.observerComplete ? "text-green-600" : "text-muted-foreground"
                   )}>
                     Observation ({observerScoresCount}/{totalItems})
                   </span>
                </div>
                <div className="flex items-center space-x-2">
                  {completionStatus.selfComplete ? (
                    <Check className="w-5 h-5 text-green-600" />
                  ) : (
                    <div className="w-5 h-5 rounded-full border-2 border-muted-foreground"></div>
                  )}
                  <span className={cn(
                    "font-medium",
                    completionStatus.selfComplete ? "text-green-600" : "text-muted-foreground"
                  )}>
                    Self-Assessment
                  </span>
                </div>
              </div>
              <Button 
                onClick={handleSubmitEvaluation}
                disabled={!completionStatus.canSubmit || isSubmitting}
                className="bg-primary hover:bg-primary/90"
              >
                {isSubmitting ? "Submitting..." : "Submit Evaluation"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main Content */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-6">
          <TabsTrigger value="observation">Observation</TabsTrigger>
          <TabsTrigger value="self-assessment">Self-Assessment</TabsTrigger>
        </TabsList>

        <TabsContent value="observation">
          <Card>
            <CardHeader>
              <CardTitle>Observation Scores & Notes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {evaluation.items.map((item) => (
                <div key={item.competency_id} className="border rounded-lg p-4 space-y-4">
                  <div className="flex items-center gap-3 mb-2">
                    <h4 className="font-medium">{item.competency_name_snapshot}</h4>
                    {item.domain_name && (
                      <Badge 
                        variant="secondary" 
                        className="text-xs"
                        style={{ 
                          backgroundColor: getDomainColor(item.domain_name),
                          color: '#000'
                        }}
                      >
                        {item.domain_name}
                      </Badge>
                    )}
                  </div>
                  
                  {item.competency_description && (
                    <p className="text-sm text-muted-foreground italic">
                      {item.competency_description}
                    </p>
                  )}
                  
                  {/* Score Pills */}
                  <div className="flex space-x-2">
                    {SCORE_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        onClick={() => !isReadOnly && handleObserverScoreChange(item.competency_id, option.value)}
                        disabled={isReadOnly || saving}
                        className={cn(
                          "px-3 py-2 rounded-md text-sm font-medium border transition-colors",
                          item.observer_score === option.value
                            ? option.color
                            : "bg-background border-border hover:bg-muted",
                          isReadOnly && "cursor-not-allowed opacity-60"
                        )}
                      >
                        {option.value}
                      </button>
                    ))}
                  </div>

                  {/* Conditional Notes */}
                  {showObserverNotes[item.competency_id] ? (
                    <Textarea
                      placeholder="Add your notes..."
                      value={item.observer_note || ''}
                      onChange={(e) => !isReadOnly && handleObserverNoteChange(item.competency_id, e.target.value)}
                      disabled={isReadOnly}
                      className="min-h-[80px]"
                    />
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowObserverNotes(prev => ({ ...prev, [item.competency_id]: true }))}
                      disabled={isReadOnly}
                      className="flex items-center gap-2"
                    >
                      <Plus className="w-4 h-4" />
                      Add Note
                    </Button>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="self-assessment">
          {currentItem && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Self-Assessment ({currentSelfIndex + 1} of {evaluation.items.length})</CardTitle>
                  <div className="flex items-center space-x-2">
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => setCurrentSelfIndex(Math.max(0, currentSelfIndex - 1))}
                      disabled={currentSelfIndex === 0}
                    >
                      <ChevronLeft className="w-4 h-4" />
                      Previous
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => setCurrentSelfIndex(Math.min(evaluation.items.length - 1, currentSelfIndex + 1))}
                      disabled={currentSelfIndex === evaluation.items.length - 1}
                    >
                      Next
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                <Progress value={((currentSelfIndex + 1) / evaluation.items.length) * 100} className="w-full" />
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <h4 className="font-medium text-lg">{currentItem.competency_name_snapshot}</h4>
                    {currentItem.domain_name && (
                      <Badge 
                        variant="secondary" 
                        className="text-xs"
                        style={{ 
                          backgroundColor: getDomainColor(currentItem.domain_name),
                          color: '#000'
                        }}
                      >
                        {currentItem.domain_name}
                      </Badge>
                    )}
                  </div>
                  
                  {currentItem.competency_description && (
                    <p className="text-sm text-muted-foreground italic mb-4">
                      {currentItem.competency_description}
                    </p>
                  )}
                  
                  <p className="text-muted-foreground mb-4">
                    <strong>Interview Prompt:</strong> {currentItem.interview_prompt || 'No interview prompt available for this competency.'}
                  </p>
                </div>

                {/* Score Pills */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Self-Assessment Score</label>
                  <div className="flex space-x-2">
                    {SCORE_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        onClick={() => !isReadOnly && handleSelfScoreChange(currentItem.competency_id, option.value)}
                        disabled={isReadOnly || saving}
                        className={cn(
                          "px-3 py-2 rounded-md text-sm font-medium border transition-colors",
                          currentItem.self_score === option.value
                            ? option.color
                            : "bg-background border-border hover:bg-muted",
                          isReadOnly && "cursor-not-allowed opacity-60"
                        )}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Conditional Notes */}
                {showSelfNote ? (
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Self-Assessment Notes</label>
                    <Textarea
                      placeholder="Please share your thoughts and examples..."
                      value={currentItem.self_note || ''}
                      onChange={(e) => !isReadOnly && handleSelfNoteChange(currentItem.competency_id, e.target.value)}
                      disabled={isReadOnly}
                      className="min-h-[120px]"
                    />
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowSelfNote(true)}
                    disabled={isReadOnly}
                    className="flex items-center gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    Add Note
                  </Button>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}