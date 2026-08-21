import { useEffect, useState } from 'react';
import DOMPurify from 'dompurify';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, FileText, User, AlertCircle, CheckCircle2, Info, MessageSquare, Sun, Sprout } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { getEvaluation, isLegacyInterviewEval } from '@/lib/evaluations';
import { legacyNoteOf } from '@/lib/evalCaptureData';
import { getDomainColor, getDomainColorRaw, getDomainColorRichRaw } from '@/lib/domainColors';
import { getDomainOrderIndex } from '@/lib/domainUtils';
import type { EvaluationWithItems, ExtractedInsights, InsightsPerspective, DomainInsight } from '@/lib/evaluations';
import { ParticipationSnapshotCard, type ParticipationSnapshot } from '@/components/evaluations/ParticipationSnapshotCard';
import { scoreBucketTokens, type ScoreBucket } from '@/lib/confidenceScoreRamp';

// DSN-3 slice 3: this is the same 1-4 observer/self score EvaluationHub.tsx's
// SCORE_OPTIONS already migrated in slice 1, just in a read-only pill here —
// reuses scoreBucketTokens() instead of a second hardcoded copy. Band 1
// moves from red to --score-1's orange, the same intentional DASH-1a hue
// shift documented for RatingBandCollapsible.tsx in slice 2.
function ReadOnlyScore({ value }: { value: number | null }) {
  if (value == null) return <span className="text-xs text-muted-foreground">—</span>;
  const tokens = scoreBucketTokens(value as ScoreBucket);
  return (
    <span
      className="px-2.5 py-1 rounded border text-sm"
      style={{ backgroundColor: tokens.bg, color: tokens.ink, borderColor: tokens.text }}
    >
      {value}
    </span>
  );
}

type RolledNote = {
  source: 'Observer' | 'Self';
  competency: string;
  competency_id: number;
  text: string | null;
  glow?: string | null;
  grow?: string | null;
};

const r1 = (n: number | null) => n == null ? null : Math.round(n * 10) / 10;
const avg = (arr: Array<number | null>) => {
  const vals = arr.filter((v): v is number => v != null);
  return vals.length ? r1(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
};

type GroupedItem = {
  competency_id: number;
  competency_name_snapshot: string;
  competency_description_snapshot: string | null;
  domain_name: string;
  self_score: number | null;
  observer_score: number | null;
  self_note: string | null;
  observer_note: string | null;
  observer_glow: string | null;
  observer_grow: string | null;
};

// Helper to get legacy structure as self_assessment perspective
function getLegacyAsSelfAssessment(insights: ExtractedInsights): InsightsPerspective | null {
  if (insights.evaluation_summary_html && insights.domain_insights) {
    return {
      summary_html: insights.evaluation_summary_html,
      domain_insights: insights.domain_insights
    };
  }
  return null;
}

function PerspectiveCard({ 
  title, 
  icon: Icon, 
  perspective 
}: { 
  title: string; 
  icon: React.ElementType;
  perspective: InsightsPerspective;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <Icon className="w-4 h-4" />
        {title}
      </div>
      
      {/* Summary */}
      {perspective.summary_html && (
        <div 
          className="prose prose-sm max-w-none text-sm"
          dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(perspective.summary_html) }}
        />
      )}
      
      {/* Domain Insights */}
      {perspective.domain_insights && perspective.domain_insights.length > 0 && (
        <div className="space-y-3">
          {perspective.domain_insights.map((insight, idx) => {
            const bgColor = getDomainColorRaw(insight.domain);
            const accentColor = getDomainColorRichRaw(insight.domain);
            
            return (
              <div 
                key={idx}
                className="p-3 rounded-lg border"
                style={{ 
                  backgroundColor: `hsl(${bgColor})`,
                  borderColor: `hsl(${accentColor} / 0.3)`
                }}
              >
                <Badge 
                  className="mb-2"
                  style={{ 
                    backgroundColor: `hsl(${accentColor} / 0.15)`,
                    color: `hsl(${accentColor})`,
                    borderColor: `hsl(${accentColor} / 0.3)`
                  }}
                >
                  {insight.domain}
                </Badge>
                
                {insight.strengths && insight.strengths.length > 0 && (
                  <div className="mb-2">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                      Strengths
                    </p>
                    <ul className="text-sm space-y-0.5">
                      {insight.strengths.map((s, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <span style={{ color: `hsl(${accentColor})` }}>✓</span>
                          <span>{s}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                
                {insight.growth_areas && insight.growth_areas.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                      Growth Opportunities
                    </p>
                    <ul className="text-sm space-y-0.5">
                      {insight.growth_areas.map((g, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <span style={{ color: `hsl(${accentColor})` }}>→</span>
                          <span>{g}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function EvaluationViewer() {
  const { evalId } = useParams<{ evalId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnTo = searchParams.get('returnTo');
  const { user, isCoach, isSuperAdmin, isLead } = useAuth();
  const [loading, setLoading] = useState(true);
  const [evaluation, setEvaluation] = useState<EvaluationWithItems | null>(null);
  const [staffName, setStaffName] = useState<string>('');
  const [evaluatorName, setEvaluatorName] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [backUrl, setBackUrl] = useState('/stats/evaluations');
  const [activeTab, setActiveTab] = useState('scores');
  const [isOwnEval, setIsOwnEval] = useState(false);
  const [needsReview, setNeedsReview] = useState(false);

  useEffect(() => {
    if (!user || !evalId) return;

    (async () => {
      try {
        // Get current user's staff id (+ location, for the lead-access check below)
        const { data: staff } = await supabase
          .from('staff')
          .select('id, primary_location_id')
          .eq('user_id', user.id)
          .maybeSingle();

        if (!staff) {
          setError("Staff record not found.");
          return;
        }

        // Get evaluation
        const evalData = await getEvaluation(evalId);

        if (!evalData) {
          setError("Evaluation not found.");
          return;
        }

        // Check access: must be submitted, and either this user's evaluation OR user is coach/admin
        if (evalData.status !== 'submitted') {
          setError("You don't have access to this evaluation.");
          return;
        }

        // Allow access if: own evaluation OR is coach/admin OR a lead viewing a
        // teammate at their own location (mobile-shell Team surface, section F.2 —
        // leads can already read coach-surface data via allowCoachSurface, this
        // just extends the evaluation viewer's own allow-list to match).
        const isOwnEval = evalData.staff_id === staff.id;
        let isLeadForThisStaff = false;
        if (!isOwnEval && isLead && staff.primary_location_id) {
          const { data: targetStaff } = await supabase
            .from('staff')
            .select('primary_location_id')
            .eq('id', evalData.staff_id)
            .maybeSingle();
          isLeadForThisStaff = targetStaff?.primary_location_id === staff.primary_location_id;
        }
        if (!isOwnEval && !isCoach && !isSuperAdmin && !isLeadForThisStaff) {
          setError("You don't have access to this evaluation.");
          return;
        }

        // If viewing own evaluation, check visibility
        if (isOwnEval && !isCoach && !isSuperAdmin && !evalData.is_visible_to_staff) {
          setError("This evaluation is not yet available for viewing. Results will be released soon.");
          return;
        }

        // Fetch staff name
        const { data: staffData } = await supabase
          .from('staff')
          .select('name')
          .eq('id', evalData.staff_id)
          .single();

        if (staffData) {
          setStaffName(staffData.name);
        }

        // Fetch evaluator name
        if (evalData.evaluator_id) {
          const { data: evaluatorData } = await supabase
            .from('staff')
            .select('name')
            .eq('id', evalData.evaluator_id)
            .maybeSingle();
          if (evaluatorData) setEvaluatorName(evaluatorData.name);
        }

        // Set back URL: if coach viewing another staff's evaluation, go to that staff's page
        if ((isCoach || isSuperAdmin) && evalData.staff_id !== staff.id) {
          setBackUrl(`/coach/${evalData.staff_id}`);
        } else if (isLeadForThisStaff) {
          setBackUrl(`/team/${evalData.staff_id}`);
        }

        // Mark viewed only if staff is viewing their OWN evaluation
        if (isOwnEval && evalData.is_visible_to_staff) {
          try {
            await supabase.rpc('mark_eval_viewed', { p_eval_id: evalId });
          } catch (e) {
            console.warn('Failed to mark eval as viewed:', e);
          }
        }

        // Track whether this is own eval and if review is needed
        setIsOwnEval(isOwnEval);
        setNeedsReview(isOwnEval && evalData.is_visible_to_staff && !(evalData as any).acknowledged_at);

        setEvaluation(evalData);
      } catch (err) {
        console.error('Error loading evaluation:', err);
        setError("Failed to load evaluation.");
      } finally {
        setLoading(false);
      }
    })();
  }, [user, evalId]);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (error || !evaluation) {
    return (
      <Card>
        <CardContent className="py-16 text-center">
          <p className="text-muted-foreground">{error || "Evaluation not found."}</p>
          <Button 
            variant="outline" 
            className="mt-4"
            onClick={() => returnTo ? navigate(returnTo) : navigate(-1)}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Group items by domain and sort
  const groupedByDomain = evaluation.items.reduce((acc, item) => {
    const domainName = item.domain_name || 'General';
    if (!acc[domainName]) {
      acc[domainName] = [];
    }
    acc[domainName].push(item);
    return acc;
  }, {} as Record<string, GroupedItem[]>);

  // Sort domains by predefined order
  const sortedDomains = Object.keys(groupedByDomain).sort((a, b) => {
    return getDomainOrderIndex(a) - getDomainOrderIndex(b);
  });

  // Sort items within each domain by competency_id
  sortedDomains.forEach(domain => {
    groupedByDomain[domain].sort((a, b) => a.competency_id - b.competency_id);
  });

  const submittedDate = evaluation.updated_at ? new Date(evaluation.updated_at).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric', 
    year: 'numeric'
  }) : '';

  // Count scores
  const totalItems = evaluation.items.length;
  const observerScored = evaluation.items.filter(item => item.observer_score != null).length;
  const selfScored = evaluation.items.filter(item => item.self_score != null).length;

  // Type detection
  const isBaseline = evaluation.type === 'Baseline';
  const isLegacy = isLegacyInterviewEval(evaluation as any);

  // Get insights perspectives (only relevant for legacy interview-sourced evals)
  const extractedInsights = evaluation.extracted_insights;
  const selfAssessmentPerspective = isLegacy
    ? (extractedInsights?.self_assessment || getLegacyAsSelfAssessment(extractedInsights || {}))
    : null;
  const hasAnyInsights = selfAssessmentPerspective || (isLegacy && (evaluation as any).summary_feedback);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button 
          variant="outline" 
          size="sm"
          onClick={() => returnTo ? navigate(returnTo) : navigate(-1)}
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">
            {staffName && `${staffName} - `}{evaluation.type} {evaluation.quarter} {evaluation.program_year} Evaluation
          </h1>
          <p className="text-muted-foreground">
            Submitted {submittedDate}
          </p>
          <p className="text-sm text-muted-foreground">
            Observer items scored {observerScored}/{totalItems}
            {!isBaseline && <> • Self items scored {selfScored}/{totalItems}</>}
          </p>
        </div>
        {needsReview && (
          <Button onClick={() => navigate(`/evaluation/${evalId}/review`)}>
            Start Review
          </Button>
        )}
        {isOwnEval && !needsReview && evaluation.is_visible_to_staff && (
          <Badge variant="secondary" className="flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" />
            Review completed
          </Badge>
        )}
      </div>

      {/* Tabbed Interface */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="scores">Your Scores</TabsTrigger>
          {hasAnyInsights && <TabsTrigger value="insights">Insights</TabsTrigger>}
        </TabsList>

        {/* Scores Tab */}
        <TabsContent value="scores" className="space-y-6">
          {/* Participation snapshot — frozen at submit time */}
          {!isBaseline && (
            <ParticipationSnapshotCard
              snapshot={(evaluation as any).participation_snapshot as ParticipationSnapshot | null}
              evalType={evaluation.type}
            />
          )}

          {/* Evaluator's free-form final note */}
          {(evaluation as any).evaluator_note && (evaluation as any).evaluator_note.trim() && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" />
                  A note from {evaluatorName || 'your evaluator'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm whitespace-pre-wrap">
                  {(evaluation as any).evaluator_note}
                </p>
              </CardContent>
            </Card>
          )}

          {/* Self-score explainer / legacy notice */}
          {!isBaseline && (
            <div className="flex items-start gap-2 text-sm text-muted-foreground bg-muted/40 rounded-md px-3 py-2">
              <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
              {isLegacy ? (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="cursor-help underline decoration-dotted underline-offset-2">
                        Self-scores in this evaluation came from a self-assessment interview.
                      </span>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      Self-scores in this evaluation were collected through a self-assessment interview. We've since moved to averaging your weekly performance submissions.
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ) : (
                <span>Your self-score is the average performance score you submitted during this quarter.</span>
              )}
            </div>
          )}

          {sortedDomains.map(domainName => {
            const domainItems = groupedByDomain[domainName];
            
            // Calculate domain averages
            const avgObserver = avg(domainItems.map(item => item.observer_score));
            const avgSelf = avg(domainItems.map(item => item.self_score));
            
            // Collect notes for this domain
            const notes: RolledNote[] = domainItems.flatMap(item => {
              const out: RolledNote[] = [];
              const glow = item.observer_glow?.trim() || null;
              const grow = item.observer_grow?.trim() || null;
              const legacyText = legacyNoteOf(item);
              if (glow || grow || legacyText) {
                out.push({
                  source: 'Observer',
                  competency: item.competency_name_snapshot,
                  competency_id: item.competency_id,
                  text: legacyText,
                  glow,
                  grow,
                });
              }
              if (!isBaseline && item.self_note) {
                out.push({ 
                  source: 'Self', 
                  competency: item.competency_name_snapshot, 
                  competency_id: item.competency_id,
                  text: item.self_note 
                });
              }
              return out;
            });

            // Sort notes: Observer notes first (by competency_id), then Self notes (by competency_id)
            notes.sort((a, b) => {
              if (a.source !== b.source) {
                return a.source === 'Observer' ? -1 : 1;
              }
              return a.competency_id - b.competency_id;
            });

            return (
              <Card key={domainName}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <span
                      className="px-2 py-0.5 rounded text-xs"
                      style={{ backgroundColor: getDomainColor(domainName), color: '#000' }}
                    >
                      {domainName}
                    </span>
                    <span>{domainName}</span>
                  </CardTitle>
                </CardHeader>

                <CardContent className="space-y-3">
                  {/* Header row */}
                  <div className="grid grid-cols-12 text-xs text-muted-foreground">
                    <div className="col-span-7">Competency</div>
                    <div className={isBaseline ? "col-span-5 text-center" : "col-span-2 text-center"}>Observer</div>
                    {!isBaseline && <div className="col-span-3 text-center">Self</div>}
                  </div>

                  {/* Competency rows */}
                  <div className="space-y-2">
                    {domainItems.map(item => (
                      <div key={item.competency_id} className="grid grid-cols-12 items-center py-2 border-b last:border-0">
                        <div className="col-span-7">
                          <div className="text-sm font-medium">{item.competency_name_snapshot}</div>
                          {item.competency_description_snapshot && (
                            <div className="text-xs text-muted-foreground italic">{item.competency_description_snapshot}</div>
                          )}
                        </div>
                        <div className={isBaseline ? "col-span-5 flex justify-center" : "col-span-2 flex justify-center"}>
                          <ReadOnlyScore value={item.observer_score} />
                        </div>
                        {!isBaseline && (
                          <div className="col-span-3 flex justify-center">
                            {item.self_score == null ? (
                              <span className="text-xs text-muted-foreground italic">Not enough data</span>
                            ) : (
                              <ReadOnlyScore value={item.self_score} />
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Averages row */}
                  <div className="grid grid-cols-12 items-center pt-2 border-t">
                    <div className="col-span-7 text-sm font-medium">Averages</div>
                    <div className={isBaseline ? "col-span-5 text-center text-sm" : "col-span-2 text-center text-sm"}>{avgObserver ?? '—'}</div>
                    {!isBaseline && <div className="col-span-3 text-center text-sm">{avgSelf ?? '—'}</div>}
                  </div>

                  {/* Notes accordion */}
                  {notes.length > 0 && (
                    <div className="pt-2">
                      <Accordion type="single" collapsible>
                        <AccordionItem value="notes">
                          <AccordionTrigger className="text-sm">Notes ({notes.length})</AccordionTrigger>
                          <AccordionContent>
                            <div className="space-y-3">
                              {notes.map((note, idx) => (
                                <div key={idx} className="text-sm">
                                  {/* DSN-3 slice 3: "Self" (was slate) is generic
                                      neutral chrome, migrated to muted. "Observer"
                                      is a source-attribution color with no
                                      domain/score/status/win meaning — left
                                      hardcoded. */}
                                  <span className={`inline-block px-2 py-0.5 mr-2 rounded text-xs ${
                                    note.source === 'Observer' ? 'bg-blue-100 text-blue-800' : 'bg-muted text-muted-foreground'
                                  }`}>
                                    {note.source}
                                  </span>
                                  <span className="font-medium">{note.competency}: </span>
                                  {note.glow || note.grow ? (
                                    <div className="mt-1 space-y-1">
                                      {note.glow && (
                                        <div className="flex items-start gap-1.5">
                                          <Sun className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: 'hsl(var(--score-4))' }} />
                                          <span className="text-muted-foreground">{note.glow}</span>
                                        </div>
                                      )}
                                      {note.grow && (
                                        <div className="flex items-start gap-1.5">
                                          <Sprout className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: 'hsl(var(--score-2))' }} />
                                          <span className="text-muted-foreground">{note.grow}</span>
                                        </div>
                                      )}
                                    </div>
                                  ) : (
                                    <span className="text-muted-foreground">{note.text}</span>
                                  )}
                                </div>
                              ))}
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      </Accordion>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>

        {/* Insights Tab — only rendered when legacy data exists */}
        {hasAnyInsights && (
          <TabsContent value="insights" className="space-y-6">
            {/* Legacy summary feedback display */}
            {(evaluation as any).summary_feedback && !selfAssessmentPerspective && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <FileText className="w-5 h-5" />
                    Overall Feedback
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div 
                    className="prose prose-sm max-w-none"
                    dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize((evaluation as any).summary_feedback || '') }}
                  />
                </CardContent>
              </Card>
            )}

            {/* Self-Assessment Insights (legacy interview-sourced only) */}
            {selfAssessmentPerspective && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <User className="w-5 h-5" />
                    Self-Assessment Insights
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className="w-4 h-4 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          These insights came from the legacy self-assessment interview flow. We've since moved to averaging weekly performance submissions.
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <PerspectiveCard 
                    title="" 
                    icon={User}
                    perspective={selfAssessmentPerspective}
                  />
                </CardContent>
              </Card>
            )}
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
