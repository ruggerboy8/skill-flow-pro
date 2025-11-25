import { useState, useEffect, useMemo } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { ArrowLeft, CalendarOff } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { useStaffAllWeeklyScores } from '@/hooks/useStaffAllWeeklyScores';
import { useAuth } from '@/hooks/useAuth';
import OnTimeRateWidget from '@/components/coach/OnTimeRateWidget';
import { QuarterlyEvalsTab } from '@/components/coach/QuarterlyEvalsTab';
import { RawScoreRow } from '@/types/coachV2';

export default function StaffDetailV2() {
  const { staffId } = useParams<{ staffId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const selectedWeek = searchParams.get('week');

  const { weekSummaries, loading, error } = useStaffAllWeeklyScores({ staffId });

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

  // Group weeks by year/month for accordion
  const groupedWeeks = useMemo(() => {
    const groups = new Map<string, Array<[string, typeof weekSummaries extends Map<string, infer T> ? T : never]>>();
    
    const sortedEntries = Array.from(weekSummaries.entries()).sort((a, b) => 
      new Date(b[0]).getTime() - new Date(a[0]).getTime()
    );

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
  function StatusPill({ hasAll, hasAnyLate }: { hasAll: boolean; hasAnyLate: boolean }) {
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

  if (loading) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
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
        <Button variant="ghost" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
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
            <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
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
                      const isExempt = summary.scores.length > 0 && (summary.scores[0] as RawScoreRow & { is_week_exempt?: boolean }).is_week_exempt;
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
                                {isExempt && (
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
                                  />
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-sm text-muted-foreground">Performance:</span>
                                  <StatusPill
                                    hasAll={hasAllPerf}
                                    hasAnyLate={summary.scores.some(s => s.performance_late)}
                                  />
                                </div>
                              </div>
                            </div>
                          </AccordionTrigger>
                          <AccordionContent>
                            <div className="space-y-3 pt-2">
                              {summary.scores
                                .sort((a, b) => (a.display_order || 0) - (b.display_order || 0))
                                .map((score, idx) => (
                                  <div
                                    key={`${score.assignment_id}-${idx}`}
                                    className="border rounded-lg p-4 space-y-2"
                                  >
                                    <div className="flex items-start justify-between">
                                      <div className="space-y-1">
                                        <div className="font-medium">{score.action_statement}</div>
                                        <div className="text-sm text-muted-foreground">
                                          {score.domain_name}
                                        </div>
                                      </div>
                                      {score.self_select && (
                                        <Badge variant="outline">Self-Select</Badge>
                                      )}
                                    </div>
                                    <div className="grid grid-cols-2 gap-4 pt-2">
                                      <div>
                                        <div className="text-sm font-medium mb-1">Confidence</div>
                                        {score.confidence_score !== null ? (
                                          <div className="flex items-center gap-2">
                                            <span className="text-2xl font-bold">
                                              {score.confidence_score}
                                            </span>
                                            {score.confidence_late && (
                                              <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">
                                                Late
                                              </Badge>
                                            )}
                                          </div>
                                        ) : (
                                          <span className="text-muted-foreground">Not submitted</span>
                                        )}
                                        {score.confidence_date && (
                                          <div className="text-xs text-muted-foreground mt-1">
                                            {format(new Date(score.confidence_date), 'MMM d, h:mm a')}
                                          </div>
                                        )}
                                      </div>
                                      <div>
                                        <div className="text-sm font-medium mb-1">Performance</div>
                                        {score.performance_score !== null ? (
                                          <div className="flex items-center gap-2">
                                            <span className="text-2xl font-bold">
                                              {score.performance_score}
                                            </span>
                                            {score.performance_late && (
                                              <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">
                                                Late
                                              </Badge>
                                            )}
                                          </div>
                                        ) : (
                                          <span className="text-muted-foreground">Not submitted</span>
                                        )}
                                        {score.performance_date && (
                                          <div className="text-xs text-muted-foreground mt-1">
                                            {format(new Date(score.performance_date), 'MMM d, h:mm a')}
                                          </div>
                                        )}
                                      </div>
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
