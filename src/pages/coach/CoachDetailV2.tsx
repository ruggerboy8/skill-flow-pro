import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, ChevronLeft, ChevronRight, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { getDomainColor } from '@/lib/domainColors';
import ConfPerfDelta from '@/components/ConfPerfDelta';
import { QuarterlyEvalsTab } from '@/components/coach/QuarterlyEvalsTab';
import { useStaffDetailWeek } from '@/hooks/useStaffDetailWeek';
import { startOfWeek, addWeeks, format, isValid } from 'date-fns';
import { toast } from 'sonner';

export default function CoachDetailV2() {
  const { staffId } = useParams<{ staffId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { isCoach, isLead, isSuperAdmin, loading: authLoading, user } = useAuth();

  // Week state
  const getInitialWeek = () => {
    const weekParam = searchParams.get('week');
    if (weekParam) {
      const parsed = new Date(weekParam);
      if (isValid(parsed)) return startOfWeek(parsed, { weekStartsOn: 1 });
    }
    return startOfWeek(new Date(), { weekStartsOn: 1 });
  };

  const [selectedWeek, setSelectedWeek] = useState<Date>(getInitialWeek);

  // Fetch data
  const { data, isLoading, error, refetch } = useStaffDetailWeek({
    staffId,
    weekStart: selectedWeek,
    enabled: !authLoading && (isCoach || isLead || isSuperAdmin),
  });

  // Role gate
  useEffect(() => {
    if (!authLoading && !isCoach && !isLead && !isSuperAdmin) {
      navigate('/');
    }
  }, [isCoach, isLead, isSuperAdmin, authLoading, navigate]);

  // Week navigation
  const handlePrevWeek = () => {
    setSelectedWeek(addWeeks(selectedWeek, -1));
  };

  const handleNextWeek = () => {
    setSelectedWeek(addWeeks(selectedWeek, 1));
  };

  // Back navigation preserving filters
  const handleBackClick = () => {
    const params = new URLSearchParams(searchParams);
    navigate(`/coach?${params.toString()}`);
  };

  // Delete score handler
  const handleDeleteScore = async (assignmentId: string, scoreType: 'confidence' | 'performance') => {
    if (!staffId) return;
    
    const confirmMsg = scoreType === 'confidence' 
      ? 'Delete this confidence score?' 
      : 'Delete this performance score?';
    
    if (!confirm(confirmMsg)) return;

    try {
      const updateData = scoreType === 'confidence'
        ? { confidence_score: null, confidence_date: null, confidence_late: null }
        : { performance_score: null, performance_date: null, performance_late: null };

      const { error } = await supabase
        .from('weekly_scores')
        .update(updateData)
        .eq('staff_id', staffId)
        .eq('assignment_id', assignmentId);

      if (error) throw error;

      toast.success(`${scoreType === 'confidence' ? 'Confidence' : 'Performance'} score deleted`);
      refetch();
    } catch (error) {
      console.error(`Error deleting ${scoreType} score:`, error);
      toast.error(`Failed to delete ${scoreType} score`);
    }
  };

  if (authLoading || isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-10 w-48" />
        <div className="space-y-4">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <Card>
        <CardContent className="py-16 text-center">
          <p className="text-destructive">
            {error ? 'Error loading staff data' : 'Staff member not found'}
          </p>
        </CardContent>
      </Card>
    );
  }

  const { staff, week, assignments, summary } = data;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <Button 
            variant="outline" 
            size="sm"
            onClick={handleBackClick}
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Staff List
          </Button>
        </div>
        <div>
          <h1 className="text-3xl font-bold">{staff.name}</h1>
          <p className="text-muted-foreground">
            {staff.roleName} · {staff.locationName}
          </p>
        </div>
      </div>

      {/* Week Picker */}
      <Card>
        <CardHeader>
          <CardTitle>Week Selection</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-4">
            <Button
              variant="outline"
              size="sm"
              onClick={handlePrevWeek}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Previous
            </Button>
            <div className="text-center">
              <div className="text-sm text-muted-foreground">
                Cycle {week.cycle}, Week {week.weekInCycle}
              </div>
              <div className="font-semibold">
                {format(selectedWeek, 'MMMM d, yyyy')}
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleNextWeek}
            >
              Next
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Main Content Tabs */}
      <Tabs defaultValue="assignments" className="w-full">
        <TabsList>
          <TabsTrigger value="assignments">Weekly Assignments</TabsTrigger>
          <TabsTrigger value="quarterly-evals">Quarterly Evals</TabsTrigger>
        </TabsList>
        
        <TabsContent value="assignments" className="space-y-4">
          {/* Summary Card */}
          <Card>
            <CardHeader>
              <CardTitle>Submission Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <div className="text-sm text-muted-foreground mb-1">Confidence</div>
                  <div className="flex items-center gap-2">
                    <span className="text-2xl font-bold">
                      {summary.confSubmittedCount}/{summary.requiredCount}
                    </span>
                    {summary.confLateCount > 0 && (
                      <Badge className="bg-yellow-500 text-white">
                        {summary.confLateCount} late
                      </Badge>
                    )}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground mb-1">Performance</div>
                  <div className="flex items-center gap-2">
                    <span className="text-2xl font-bold">
                      {summary.perfSubmittedCount}/{summary.requiredCount}
                    </span>
                    {summary.perfLateCount > 0 && (
                      <Badge className="bg-yellow-500 text-white">
                        {summary.perfLateCount} late
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Assignments List */}
          {assignments.length === 0 ? (
            <Card>
              <CardContent className="py-16 text-center">
                <p className="text-muted-foreground">No assignments found for this week.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {assignments.map((assignment) => (
                <Card key={assignment.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start gap-4">
                      {/* Domain Badge */}
                      <Badge 
                        style={{ backgroundColor: getDomainColor(assignment.domainName) }}
                        className="ring-1 ring-border/50 text-foreground shrink-0"
                      >
                        {assignment.domainName}
                      </Badge>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <p className="font-medium mb-2">
                              {assignment.actionStatement}
                            </p>
                            <div className="flex items-center gap-4">
                              <ConfPerfDelta
                                confidence={assignment.confidenceScore}
                                performance={assignment.performanceScore}
                              />
                              {assignment.confidenceLate && assignment.confidenceScore !== null && (
                                <Badge variant="outline" className="text-yellow-600 border-yellow-400">
                                  Conf Late
                                </Badge>
                              )}
                              {assignment.performanceLate && assignment.performanceScore !== null && (
                                <Badge variant="outline" className="text-yellow-600 border-yellow-400">
                                  Perf Late
                                </Badge>
                              )}
                            </div>
                          </div>

                          {/* Delete Buttons */}
                          <div className="flex gap-2 shrink-0">
                            {assignment.confidenceScore !== null && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive hover:text-destructive"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteScore(assignment.id, 'confidence');
                                }}
                                title="Delete confidence score"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                            {assignment.performanceScore !== null && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive hover:text-destructive"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteScore(assignment.id, 'performance');
                                }}
                                title="Delete performance score"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="quarterly-evals">
          <QuarterlyEvalsTab 
            staffId={staff.id}
            staffInfo={{
              name: staff.name,
              role_id: staff.roleId,
              location_id: staff.locationId,
            }}
            currentUserId={user?.id || ''}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
