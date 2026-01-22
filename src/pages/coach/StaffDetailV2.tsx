import { useState, useMemo } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ArrowLeft, CalendarOff, MoreVertical, Check, X } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { useStaffAllWeeklyScores } from '@/hooks/useStaffAllWeeklyScores';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import OnTimeRateWidget from '@/components/coach/OnTimeRateWidget';
import { QuarterlyEvalsTab } from '@/components/coach/QuarterlyEvalsTab';
import { StaffPriorityFocusTab } from '@/components/coach/StaffPriorityFocusTab';
import { RawScoreRow } from '@/types/coachV2';
import { getDomainColor } from '@/lib/domainColors';
import ConfPerfDelta from '@/components/ConfPerfDelta';
import { toast } from 'sonner';

type ExcusedSubmission = {
  id: string;
  staff_id: string;
  week_of: string;
  metric: 'confidence' | 'performance';
  reason: string | null;
  created_at: string;
};

export default function StaffDetailV2() {
  const { staffId } = useParams<{ staffId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isSuperAdmin } = useUserRole();
  const queryClient = useQueryClient();
  const selectedWeek = searchParams.get('week');

  const { rawData, weekSummaries, loading, error } = useStaffAllWeeklyScores({ staffId });

  // Fetch excused submissions for this staff member
  const { data: excusedSubmissions = [] } = useQuery({
    queryKey: ['excused_submissions', staffId],
    queryFn: async () => {
      if (!staffId) return [];
      const { data, error } = await supabase
        .from('excused_submissions')
        .select('*')
        .eq('staff_id', staffId);
      if (error) throw error;
      return data as ExcusedSubmission[];
    },
    enabled: !!staffId && isSuperAdmin,
  });

  // Mutation for adding/removing excusals
  const excuseMutation = useMutation({
    mutationFn: async ({ weekOf, metric, action }: { weekOf: string; metric: 'confidence' | 'performance'; action: 'add' | 'remove' }) => {
      if (action === 'add') {
        const { error } = await supabase.from('excused_submissions').insert({
          staff_id: staffId,
          week_of: weekOf,
          metric,
        });
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('excused_submissions')
          .delete()
          .eq('staff_id', staffId)
          .eq('week_of', weekOf)
          .eq('metric', metric);
        if (error) throw error;
      }
    },
    onSuccess: (_, { metric, action }) => {
      // Invalidate excused submissions cache
      queryClient.invalidateQueries({ queryKey: ['excused_submissions', staffId] });
      // Invalidate all submission windows queries for this staff member (partial key match)
      queryClient.invalidateQueries({ queryKey: ['staff-submission-windows', staffId], exact: false });
      // Invalidate batch submission rates (used by coach dashboard)
      queryClient.invalidateQueries({ queryKey: ['staff-submission-rates-batch'], exact: false });
      // Invalidate location/org accountability queries that may include this staff member
      queryClient.invalidateQueries({ queryKey: ['location-accountability-quarter'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['org-accountability-quarter'], exact: false });
      // Invalidate weekly scores queries that feed into the history
      queryClient.invalidateQueries({ queryKey: ['weekly-scores'] });
      queryClient.invalidateQueries({ queryKey: ['staff-all-weekly-scores', staffId] });
      toast.success(`${metric === 'confidence' ? 'Confidence' : 'Performance'} ${action === 'add' ? 'excused' : 'excuse removed'}`);
    },
    onError: (error) => {
      toast.error(`Failed to update excuse: ${error.message}`);
    },
  });

  // Helper to check if a metric is excused
  const isExcused = (weekOf: string, metric: 'confidence' | 'performance') =>
    excusedSubmissions.some(e => e.week_of === weekOf && e.metric === metric);

  // Get staff info from first available summary
  const staffInfo = useMemo(() => {
    const firstSummary = Array.from(weekSummaries.values())[0];
    if (!firstSummary) return null;
    return {
      name: firstSummary.staff_name,
      email: firstSummary.staff_email,
      role_id: firstSummary.role_id,
      role_name: firstSummary.role_name,
      location_id: firstSummary.location_id,
      location_name: firstSummary.location_name,
      organization_name: firstSummary.organization_name,
    };
  }, [weekSummaries]);

  // Group weeks by year/month for accordion (filter out future weeks)
  const groupedWeeks = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    
    const groups = new Map<string, Array<[string, typeof weekSummaries extends Map<string, infer T> ? T : never]>>();
    
    const sortedEntries = Array.from(weekSummaries.entries())
      .filter(([weekOf]) => new Date(weekOf) <= now)
      .sort((a, b) => new Date(b[0]).getTime() - new Date(a[0]).getTime());

    sortedEntries.forEach(([weekOf, summary]) => {
      const date = parseISO(weekOf);
      const key = format(date, 'yyyy-MM');
      const label = format(date, 'MMMM yyyy');
      
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push([weekOf, summary]);
    });

    return Array.from(groups.entries()).map(([key, weeks]) => ({
      key,
      label: format(parseISO(weeks[0][0]), 'MMMM yyyy'),
      weeks,
    }));
  }, [weekSummaries]);

  // Status pill component
  function StatusPill({ 
    hasAll, 
    hasAnyLate, 
    isExempt,
    isExcused 
  }: { 
    hasAll: boolean; 
    hasAnyLate: boolean; 
    isExempt?: boolean;
    isExcused?: boolean;
  }) {
    if (isExempt) {
      return <span className="text-muted-foreground">—</span>;
    }
    if (isExcused) {
      return (
        <Badge variant="secondary" className="bg-slate-100 text-slate-600 border-slate-200">
          Excused
        </Badge>
      );
    }
    if (!hasAll) {
      return (
        <Badge variant="destructive" className="bg-red-100 text-red-800 border-red-200">
          Missing
        </Badge>
      );
    }
    if (hasAnyLate) {
      return (
        <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 border-yellow-200">
          Late
        </Badge>
      );
    }
    return (
      <Badge variant="secondary" className="bg-green-100 text-green-800 border-green-200">
        Complete
      </Badge>
    );
  }

  // Excuse dropdown component for super admins
  function ExcuseDropdown({ weekOf }: { weekOf: string }) {
    const confExcused = isExcused(weekOf, 'confidence');
    const perfExcused = isExcused(weekOf, 'performance');

    const handleExcuse = (metric: 'confidence' | 'performance') => {
      const alreadyExcused = metric === 'confidence' ? confExcused : perfExcused;
      excuseMutation.mutate({
        weekOf,
        metric,
        action: alreadyExcused ? 'remove' : 'add',
      });
    };

    const handleExcuseBoth = () => {
      if (!confExcused) {
        excuseMutation.mutate({ weekOf, metric: 'confidence', action: 'add' });
      }
      if (!perfExcused) {
        excuseMutation.mutate({ weekOf, metric: 'performance', action: 'add' });
      }
    };

    const handleRemoveAll = () => {
      if (confExcused) {
        excuseMutation.mutate({ weekOf, metric: 'confidence', action: 'remove' });
      }
      if (perfExcused) {
        excuseMutation.mutate({ weekOf, metric: 'performance', action: 'remove' });
      }
    };

    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={(e) => e.stopPropagation()}>
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
          <DropdownMenuItem onClick={() => handleExcuse('confidence')}>
            {confExcused ? (
              <>
                <X className="h-4 w-4 mr-2 text-destructive" />
                Remove Confidence Excuse
              </>
            ) : (
              <>
                <Check className="h-4 w-4 mr-2" />
                Excuse Confidence
              </>
            )}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleExcuse('performance')}>
            {perfExcused ? (
              <>
                <X className="h-4 w-4 mr-2 text-destructive" />
                Remove Performance Excuse
              </>
            ) : (
              <>
                <Check className="h-4 w-4 mr-2" />
                Excuse Performance
              </>
            )}
          </DropdownMenuItem>
          {(!confExcused || !perfExcused) && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleExcuseBoth}>
                <Check className="h-4 w-4 mr-2" />
                Excuse Both
              </DropdownMenuItem>
            </>
          )}
          {(confExcused || perfExcused) && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleRemoveAll} className="text-destructive">
                <X className="h-4 w-4 mr-2" />
                Remove All Excuses
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" onClick={() => navigate('/coach')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Dashboard
        </Button>
        <div className="animate-pulse space-y-4">
          <div className="h-32 bg-muted rounded" />
          <div className="h-64 bg-muted rounded" />
        </div>
      </div>
    );
  }

  if (error || !staffInfo) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" onClick={() => navigate('/coach')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Dashboard
        </Button>
        <Card>
          <CardContent className="pt-6">
            <p className="text-destructive">
              {error ? `Error loading data: ${error.message}` : 'Staff not found'}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => navigate('/coach')}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Dashboard
            </Button>
          </div>
          <h1 className="text-3xl font-bold">{staffInfo.name}</h1>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span>{staffInfo.role_name}</span>
            <span>•</span>
            <span>{staffInfo.location_name}</span>
            <span>•</span>
            <span>{staffInfo.organization_name}</span>
          </div>
        </div>
      </div>

      {/* On-time widget */}
      <OnTimeRateWidget staffId={staffId!} />

      {/* Tabs */}
      <Tabs defaultValue="history" className="space-y-6">
        <TabsList>
          <TabsTrigger value="history">Performance History</TabsTrigger>
          <TabsTrigger value="focus">Priority Focus</TabsTrigger>
          <TabsTrigger value="evaluations">Quarterly Evaluations</TabsTrigger>
        </TabsList>

        <TabsContent value="history" className="space-y-4">
          {groupedWeeks.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                No performance history available
              </CardContent>
            </Card>
          ) : (
            groupedWeeks.map(({ key, label, weeks }) => (
              <Card key={key}>
                <CardHeader>
                  <CardTitle className="text-lg">{label}</CardTitle>
                </CardHeader>
                <CardContent>
                  <Accordion type="multiple" defaultValue={selectedWeek ? [selectedWeek] : []}>
                    {weeks.map(([weekOf, summary]) => {
                      const isWeekExempt = summary.scores.length > 0 && (summary.scores[0] as RawScoreRow & { is_week_exempt?: boolean }).is_week_exempt;
                      const confExcused = isExcused(weekOf, 'confidence');
                      const perfExcused = isExcused(weekOf, 'performance');
                      const hasAllConf = summary.conf_count === summary.assignment_count;
                      const hasAllPerf = summary.perf_count === summary.assignment_count;
                      
                      return (
                        <AccordionItem key={weekOf} value={weekOf}>
                          <AccordionTrigger className="hover:no-underline">
                            <div className="flex items-center justify-between w-full pr-4">
                              <div className="flex items-center gap-3">
                                <span className="font-medium">
                                  Week of {format(parseISO(weekOf), 'MMM d, yyyy')}
                                </span>
                                {isWeekExempt && (
                                  <Badge variant="secondary" className="bg-amber-100 text-amber-800 border-amber-200">
                                    <CalendarOff className="h-3 w-3 mr-1" />
                                    Exempt
                                  </Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-3">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm text-muted-foreground">Confidence:</span>
                                  <StatusPill
                                    hasAll={hasAllConf}
                                    hasAnyLate={summary.scores.some(s => s.confidence_late)}
                                    isExempt={isWeekExempt}
                                    isExcused={confExcused}
                                  />
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-sm text-muted-foreground">Performance:</span>
                                  <StatusPill
                                    hasAll={hasAllPerf}
                                    hasAnyLate={summary.scores.some(s => s.performance_late)}
                                    isExempt={isWeekExempt}
                                    isExcused={perfExcused}
                                  />
                                </div>
                                {isSuperAdmin && <ExcuseDropdown weekOf={weekOf} />}
                              </div>
                            </div>
                          </AccordionTrigger>
                          <AccordionContent>
                            <div className="space-y-2 pt-2">
                              {summary.scores
                                .sort((a, b) => (a.display_order || 0) - (b.display_order || 0))
                                .map((score, idx) => (
                                  <div
                                    key={`${score.assignment_id}-${idx}`}
                                    className="flex items-center gap-3 p-3 rounded-lg border"
                                    style={{
                                      backgroundColor: score.domain_name
                                        ? `hsl(${getDomainColor(score.domain_name).match(/hsl\((.+)\)/)?.[1]} / 0.3)`
                                        : undefined,
                                    }}
                                  >
                                    {score.domain_name && (
                                      <Badge
                                        variant="outline"
                                        className="shrink-0"
                                        style={{
                                          backgroundColor: getDomainColor(score.domain_name),
                                          borderColor: getDomainColor(score.domain_name),
                                        }}
                                      >
                                        {score.domain_name}
                                      </Badge>
                                    )}
                                    <p className="flex-1 text-sm">
                                      {score.action_statement}
                                    </p>
                                    {score.self_select && (
                                      <Badge variant="secondary" className="shrink-0 text-xs">
                                        Self-Select
                                      </Badge>
                                    )}
                                    <div className="shrink-0">
                                      <ConfPerfDelta
                                        confidence={score.confidence_score}
                                        performance={score.performance_score}
                                      />
                                    </div>
                                  </div>
                                ))}
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      );
                    })}
                  </Accordion>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="focus">
          <StaffPriorityFocusTab rawData={rawData} />
        </TabsContent>

        <TabsContent value="evaluations">
          {user && (
            <QuarterlyEvalsTab
              staffId={staffId!}
              staffInfo={{
                name: staffInfo.name,
                role_id: staffInfo.role_id,
                location_id: staffInfo.location_id,
              }}
              currentUserId={user.id}
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
