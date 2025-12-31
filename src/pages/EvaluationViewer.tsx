import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, FileText, Eye, User, AlertCircle } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { getEvaluation } from '@/lib/evaluations';
import { getDomainColor, getDomainColorRaw, getDomainColorRichRaw } from '@/lib/domainColors';
import { getDomainOrderIndex } from '@/lib/domainUtils';
import type { EvaluationWithItems, ExtractedInsights, InsightsPerspective, DomainInsight } from '@/lib/evaluations';

const SCORE_PILLS = [
  { v: 1, cls: 'bg-red-100 text-red-800 border-red-200' },
  { v: 2, cls: 'bg-orange-100 text-orange-800 border-orange-200' },
  { v: 3, cls: 'bg-blue-100 text-blue-800 border-blue-200' },
  { v: 4, cls: 'bg-green-100 text-green-800 border-green-200' },
];

function ReadOnlyScore({ value }: { value: number | null }) {
  if (value == null) return <span className="text-xs text-muted-foreground">—</span>;
  const pill = SCORE_PILLS.find(p => p.v === value);
  return <span className={`px-2.5 py-1 rounded border text-sm ${pill?.cls}`}>{value}</span>;
}

type RolledNote = { source: 'Observer' | 'Self'; competency: string; text: string; competency_id: number };

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
          dangerouslySetInnerHTML={{ __html: perspective.summary_html }}
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
  const { user, isCoach, isSuperAdmin } = useAuth();
  const [loading, setLoading] = useState(true);
  const [evaluation, setEvaluation] = useState<EvaluationWithItems | null>(null);
  const [staffName, setStaffName] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [backUrl, setBackUrl] = useState('/stats/evaluations');
  const [activeTab, setActiveTab] = useState('scores');

  useEffect(() => {
    if (!user || !evalId) return;

    (async () => {
      try {
        // Get current user's staff id
        const { data: staff } = await supabase
          .from('staff')
          .select('id')
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

        // Allow access if: own evaluation OR is coach/admin
        if (evalData.staff_id !== staff.id && !isCoach && !isSuperAdmin) {
          setError("You don't have access to this evaluation.");
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

        // Set back URL: if coach viewing another staff's evaluation, go to that staff's page
        if ((isCoach || isSuperAdmin) && evalData.staff_id !== staff.id) {
          setBackUrl(`/coach/${evalData.staff_id}`);
        }

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
            onClick={() => navigate(-1)}
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

  // Get insights perspectives
  const extractedInsights = evaluation.extracted_insights;
  const observerPerspective = extractedInsights?.observer || null;
  // Check for self-assessment insights - either in unified structure or legacy format
  const selfAssessmentPerspective = extractedInsights?.self_assessment || getLegacyAsSelfAssessment(extractedInsights || {});
  const hasAnyInsights = observerPerspective || selfAssessmentPerspective || (evaluation as any).summary_feedback;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button 
          variant="outline" 
          size="sm"
          onClick={() => navigate(-1)}
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
        <div>
          <h1 className="text-2xl font-bold">
            {staffName && `${staffName} - `}{evaluation.type} {evaluation.quarter} {evaluation.program_year} Evaluation
          </h1>
          <p className="text-muted-foreground">
            Submitted {submittedDate}
          </p>
          <p className="text-sm text-muted-foreground">
            Observer items scored {observerScored}/{totalItems} • Self items scored {selfScored}/{totalItems}
          </p>
        </div>
      </div>

      {/* Tabbed Interface */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="scores">Your Scores</TabsTrigger>
          <TabsTrigger value="insights">Insights</TabsTrigger>
        </TabsList>

        {/* Scores Tab */}
        <TabsContent value="scores" className="space-y-6">
          {sortedDomains.map(domainName => {
            const domainItems = groupedByDomain[domainName];
            
            // Calculate domain averages
            const avgObserver = avg(domainItems.map(item => item.observer_score));
            const avgSelf = avg(domainItems.map(item => item.self_score));
            
            // Collect notes for this domain
            const notes: RolledNote[] = domainItems.flatMap(item => {
              const out: RolledNote[] = [];
              if (item.observer_note) {
                out.push({ 
                  source: 'Observer', 
                  competency: item.competency_name_snapshot, 
                  competency_id: item.competency_id,
                  text: item.observer_note 
                });
              }
              if (item.self_note) {
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
                    <div className="col-span-2 text-center">Observer</div>
                    <div className="col-span-3 text-center">Self</div>
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
                        <div className="col-span-2 flex justify-center">
                          <ReadOnlyScore value={item.observer_score} />
                        </div>
                        <div className="col-span-3 flex justify-center">
                          <ReadOnlyScore value={item.self_score} />
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Averages row */}
                  <div className="grid grid-cols-12 items-center pt-2 border-t">
                    <div className="col-span-7 text-sm font-medium">Averages</div>
                    <div className="col-span-2 text-center text-sm">{avgObserver ?? '—'}</div>
                    <div className="col-span-3 text-center text-sm">{avgSelf ?? '—'}</div>
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
                                  <span className={`inline-block px-2 py-0.5 mr-2 rounded text-xs ${
                                    note.source === 'Observer' ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-800'
                                  }`}>
                                    {note.source}
                                  </span>
                                  <span className="font-medium">{note.competency}: </span>
                                  <span className="text-muted-foreground">{note.text}</span>
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

        {/* Insights Tab */}
        <TabsContent value="insights" className="space-y-6">
          {hasAnyInsights ? (
            <>
              {/* Legacy summary feedback display */}
              {(evaluation as any).summary_feedback && !observerPerspective && (
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
                      dangerouslySetInnerHTML={{ __html: (evaluation as any).summary_feedback }}
                    />
                  </CardContent>
                </Card>
              )}

              {/* Coach Observations */}
              {observerPerspective && (
                <PerspectiveCard 
                  title="Coach Observations" 
                  icon={Eye}
                  perspective={observerPerspective}
                />
              )}

              {/* Self-Assessment Insights */}
              {selfAssessmentPerspective && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <User className="w-5 h-5" />
                      Self-Assessment Insights
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
            </>
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <AlertCircle className="w-8 h-8 mx-auto mb-3 text-muted-foreground" />
                <p className="text-muted-foreground">
                  No insights are available for this evaluation.
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
