import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, Plus, Eye, FileEdit, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';
import { getEvaluationsForStaff, createDraftEvaluation, deleteEvaluation } from '@/lib/evaluations';
import { Database } from '@/integrations/supabase/types';

type Evaluation = Database['public']['Tables']['evaluations']['Row'];

interface QuarterlyEvalsTabProps {
  staffId: string;
  staffInfo: {
    name: string;
    role_id: number;
    location_id?: string;
  };
  currentUserId: string;
}

export function QuarterlyEvalsTab({ staffId, staffInfo, currentUserId }: QuarterlyEvalsTabProps) {
  const [evaluations, setEvaluations] = useState<{ drafts: Evaluation[]; submitted: Evaluation[] }>({
    drafts: [],
    submitted: []
  });
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [deletingEvalId, setDeletingEvalId] = useState<string | null>(null);
  const { toast } = useToast();
  const navigate = useNavigate();

  // Form state for new evaluation
  const [newEvalForm, setNewEvalForm] = useState({
    type: '' as 'Baseline' | 'Midpoint' | 'Quarterly' | '',
    quarter: '' as 'Q1' | 'Q2' | 'Q3' | 'Q4' | '',
    programYear: new Date().getFullYear(),
    observedAt: undefined as Date | undefined
  });

  useEffect(() => {
    loadEvaluations();
  }, [staffId]);

  const loadEvaluations = async () => {
    try {
      setLoading(true);
      const data = await getEvaluationsForStaff(staffId);
      setEvaluations(data);
    } catch (error) {
      console.error('Failed to load evaluations:', error);
      toast({
        title: "Error",
        description: "Failed to load evaluations",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateEvaluation = async () => {
    if (!newEvalForm.type || !staffInfo.location_id) {
      toast({
        title: "Error",
        description: "Please select a type and ensure location is set",
        variant: "destructive"
      });
      return;
    }

    if (newEvalForm.type === 'Quarterly' && !newEvalForm.quarter) {
      toast({
        title: "Error",
        description: "Please select a quarter for quarterly evaluations",
        variant: "destructive"
      });
      return;
    }

    try {
      setIsCreating(true);
      const result = await createDraftEvaluation({
        staffId,
        roleId: staffInfo.role_id,
        locationId: staffInfo.location_id,
        type: newEvalForm.type,
        quarter: newEvalForm.type === 'Quarterly' ? (newEvalForm.quarter as 'Q1' | 'Q2' | 'Q3' | 'Q4') : undefined,
        programYear: newEvalForm.programYear,
        evaluatorId: currentUserId,
        observedAt: newEvalForm.observedAt
      });

      toast({
        title: "Success",
        description: "Evaluation created successfully"
      });

      setShowCreateDialog(false);
      setNewEvalForm({
        type: '',
        quarter: '',
        programYear: new Date().getFullYear(),
        observedAt: undefined
      });

      // Navigate to evaluation hub
      navigate(`/coach/${staffId}/eval/${result.evaluation.id}`);
    } catch (error) {
      console.error('Failed to create evaluation:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to create evaluation",
        variant: "destructive"
      });
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteEvaluation = async (evalId: string) => {
    try {
      setDeletingEvalId(evalId);
      await deleteEvaluation(evalId);
      
      toast({
        title: "Success",
        description: "Evaluation deleted successfully"
      });
      
      // Reload evaluations after deletion
      await loadEvaluations();
    } catch (error) {
      console.error('Failed to delete evaluation:', error);
      toast({
        title: "Error",
        description: "Failed to delete evaluation",
        variant: "destructive"
      });
    } finally {
      setDeletingEvalId(null);
    }
  };

  const formatEvaluationSubtitle = (evaluation: Evaluation) => {
    const status = evaluation.status === 'draft' ? 'Draft' : 'Submitted';
    const timeAgo = new Date(evaluation.updated_at).toLocaleDateString();
    const quarterPart = evaluation.quarter ? `${evaluation.quarter} ` : '';
    return `${quarterPart}'${evaluation.program_year.toString().slice(-2)} • ${status} • ${timeAgo}`;
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-semibold">Quarterly Evaluations</h3>
        </div>
        <div className="space-y-2">
          {[1, 2, 3].map(i => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-4">
                <div className="h-4 bg-muted rounded w-1/3 mb-2"></div>
                <div className="h-3 bg-muted rounded w-1/2"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Quarterly Evaluations</h3>
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              New Evaluation
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Create New Evaluation</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="type">Evaluation Type *</Label>
                <Select 
                  value={newEvalForm.type} 
                  onValueChange={(value: 'Baseline' | 'Midpoint' | 'Quarterly') => 
                    setNewEvalForm(prev => ({ ...prev, type: value, quarter: value !== 'Quarterly' ? '' : prev.quarter }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select evaluation type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Baseline">Baseline</SelectItem>
                    <SelectItem value="Midpoint">Midpoint</SelectItem>
                    <SelectItem value="Quarterly">Quarterly</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {newEvalForm.type === 'Quarterly' && (
                <div className="space-y-2">
                  <Label htmlFor="quarter">Quarter *</Label>
                  <Select 
                    value={newEvalForm.quarter} 
                    onValueChange={(value: 'Q1' | 'Q2' | 'Q3' | 'Q4') => 
                      setNewEvalForm(prev => ({ ...prev, quarter: value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select quarter" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Q1">Q1 (Jan-Mar)</SelectItem>
                      <SelectItem value="Q2">Q2 (Apr-Jun)</SelectItem>
                      <SelectItem value="Q3">Q3 (Jul-Sep)</SelectItem>
                      <SelectItem value="Q4">Q4 (Oct-Dec)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="programYear">Program Year</Label>
                <Select 
                  value={newEvalForm.programYear.toString()} 
                  onValueChange={(value) => 
                    setNewEvalForm(prev => ({ ...prev, programYear: parseInt(value) }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[2024, 2025, 2026].map(year => (
                      <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Observation Date (Optional)</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !newEvalForm.observedAt && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {newEvalForm.observedAt ? format(newEvalForm.observedAt, "PPP") : "Pick a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={newEvalForm.observedAt}
                      onSelect={(date) => setNewEvalForm(prev => ({ ...prev, observedAt: date }))}
                      className="p-3 pointer-events-auto"
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="flex justify-end space-x-2 pt-4">
                <Button 
                  variant="outline" 
                  onClick={() => setShowCreateDialog(false)}
                  disabled={isCreating}
                >
                  Cancel
                </Button>
                <Button 
                  onClick={handleCreateEvaluation}
                  disabled={isCreating || !newEvalForm.type || (newEvalForm.type === 'Quarterly' && !newEvalForm.quarter)}
                >
                  {isCreating ? "Creating..." : "Create Evaluation"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* In Progress Section */}
      <div className="space-y-3">
        <h4 className="font-medium text-muted-foreground">In Progress</h4>
        {evaluations.drafts.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-center text-muted-foreground">
              No evaluations in progress
            </CardContent>
          </Card>
        ) : (
          evaluations.drafts.map(evaluation => (
            <Card key={evaluation.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h5 className="font-medium">
                      {evaluation.type} {evaluation.quarter ? `${evaluation.quarter} ` : ''}{evaluation.program_year} Evaluation
                    </h5>
                    <p className="text-sm text-muted-foreground">
                      {formatEvaluationSubtitle(evaluation)}
                    </p>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Badge variant="secondary">Draft</Badge>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button 
                          size="sm" 
                          variant="outline"
                          disabled={deletingEvalId === evaluation.id}
                        >
                          <Trash2 className="w-4 h-4 mr-1" />
                          Delete
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Evaluation</AlertDialogTitle>
                          <AlertDialogDescription>
                            This action cannot be undone. Are you sure you want to delete this evaluation report?
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction 
                            onClick={() => handleDeleteEvaluation(evaluation.id)}
                            disabled={deletingEvalId === evaluation.id}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            {deletingEvalId === evaluation.id ? "Deleting..." : "Delete"}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                    <Button 
                      size="sm"
                      onClick={() => navigate(`/coach/${staffId}/eval/${evaluation.id}`)}
                    >
                      <FileEdit className="w-4 h-4 mr-1" />
                      Continue
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Submitted Section */}
      <div className="space-y-3">
        <h4 className="font-medium text-muted-foreground">Submitted</h4>
        {evaluations.submitted.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-center text-muted-foreground">
              No submitted evaluations
            </CardContent>
          </Card>
        ) : (
          evaluations.submitted.map(evaluation => (
            <Card key={evaluation.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h5 className="font-medium">
                      {evaluation.type} {evaluation.quarter ? `${evaluation.quarter} ` : ''}{evaluation.program_year} Evaluation
                    </h5>
                    <p className="text-sm text-muted-foreground">
                      {formatEvaluationSubtitle(evaluation)}
                    </p>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Badge variant="default">Submitted</Badge>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button 
                          size="sm" 
                          variant="outline"
                          disabled={deletingEvalId === evaluation.id}
                        >
                          <Trash2 className="w-4 h-4 mr-1" />
                          Delete
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Evaluation</AlertDialogTitle>
                          <AlertDialogDescription>
                            This action cannot be undone. Are you sure you want to delete this evaluation report?
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction 
                            onClick={() => handleDeleteEvaluation(evaluation.id)}
                            disabled={deletingEvalId === evaluation.id}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            {deletingEvalId === evaluation.id ? "Deleting..." : "Delete"}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={() => navigate(`/coach/${staffId}/eval/${evaluation.id}`)}
                    >
                      <Eye className="w-4 h-4 mr-1" />
                      View
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}