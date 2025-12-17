import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FileText, Sparkles, Target, TrendingUp, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

// Types for extracted insights
export interface DomainInsight {
  domain: 'Clinical' | 'Clerical' | 'Cultural' | 'Case Acceptance';
  strengths: string[];
  growth_areas: string[];
}

export interface GrowthPlanItem {
  title: string;
  domain: string;
  observation: string;
  suggested_action: string;
}

export interface ExtractedInsights {
  evaluation_summary_html: string;
  domain_insights: DomainInsight[];
  tactical_growth_plan: GrowthPlanItem[];
}

// Domain color mapping
const DOMAIN_COLORS: Record<string, { bg: string; border: string; text: string; badge: string }> = {
  'Clinical': { 
    bg: 'bg-blue-50', 
    border: 'border-blue-200', 
    text: 'text-blue-700',
    badge: 'bg-blue-100 text-blue-800 border-blue-200'
  },
  'Clerical': { 
    bg: 'bg-green-50', 
    border: 'border-green-200', 
    text: 'text-green-700',
    badge: 'bg-green-100 text-green-800 border-green-200'
  },
  'Cultural': { 
    bg: 'bg-purple-50', 
    border: 'border-purple-200', 
    text: 'text-purple-700',
    badge: 'bg-purple-100 text-purple-800 border-purple-200'
  },
  'Case Acceptance': { 
    bg: 'bg-amber-50', 
    border: 'border-amber-200', 
    text: 'text-amber-700',
    badge: 'bg-amber-100 text-amber-800 border-amber-200'
  },
};

interface InsightsDisplayProps {
  summaryFeedback: string | null;
  extractedInsights: ExtractedInsights | null;
}

export function InsightsDisplay({ summaryFeedback, extractedInsights }: InsightsDisplayProps) {
  const hasObservationSummary = !!summaryFeedback;
  const hasInterviewAnalysis = !!extractedInsights;

  return (
    <div className="space-y-6">
      {/* Section 1: Observation Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Observation Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          {hasObservationSummary ? (
            <div 
              className="prose prose-sm max-w-none"
              dangerouslySetInnerHTML={{ __html: summaryFeedback }}
            />
          ) : (
            <div className="flex items-center gap-3 p-4 bg-muted/50 rounded-lg text-muted-foreground">
              <AlertCircle className="w-5 h-5" />
              <p>Complete observation recording to see your summary here.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section 2: Interview Analysis */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Sparkles className="w-5 h-5" />
            Interview Analysis
          </CardTitle>
        </CardHeader>
        <CardContent>
          {hasInterviewAnalysis ? (
            <div className="space-y-6">
              {/* Evaluation Summary */}
              {extractedInsights.evaluation_summary_html && (
                <div className="p-4 bg-muted/30 rounded-lg border">
                  <h4 className="font-medium mb-2 flex items-center gap-2">
                    <Target className="w-4 h-4" />
                    Self-Assessment Summary
                  </h4>
                  <div 
                    className="prose prose-sm max-w-none"
                    dangerouslySetInnerHTML={{ __html: extractedInsights.evaluation_summary_html }}
                  />
                </div>
              )}

              {/* Domain Insights Grid */}
              {extractedInsights.domain_insights && extractedInsights.domain_insights.length > 0 && (
                <div>
                  <h4 className="font-medium mb-3">Domain Insights</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {extractedInsights.domain_insights.map((insight, idx) => {
                      const colors = DOMAIN_COLORS[insight.domain] || DOMAIN_COLORS['Clinical'];
                      return (
                        <div 
                          key={idx}
                          className={cn(
                            "p-4 rounded-lg border",
                            colors.bg,
                            colors.border
                          )}
                        >
                          <Badge className={cn("mb-3", colors.badge)}>
                            {insight.domain}
                          </Badge>
                          
                          {insight.strengths && insight.strengths.length > 0 && (
                            <div className="mb-3">
                              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                                Strengths
                              </p>
                              <ul className="text-sm space-y-1">
                                {insight.strengths.map((s, i) => (
                                  <li key={i} className="flex items-start gap-2">
                                    <span className="text-green-600">✓</span>
                                    <span>{s}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                          
                          {insight.growth_areas && insight.growth_areas.length > 0 && (
                            <div>
                              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                                Growth Areas
                              </p>
                              <ul className="text-sm space-y-1">
                                {insight.growth_areas.map((g, i) => (
                                  <li key={i} className="flex items-start gap-2">
                                    <span className="text-amber-600">→</span>
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
                </div>
              )}

              {/* Tactical Growth Plan */}
              {extractedInsights.tactical_growth_plan && extractedInsights.tactical_growth_plan.length > 0 && (
                <div>
                  <h4 className="font-medium mb-3 flex items-center gap-2">
                    <TrendingUp className="w-4 h-4" />
                    Growth Plan
                  </h4>
                  <div className="space-y-3">
                    {extractedInsights.tactical_growth_plan.map((goal, idx) => {
                      const colors = DOMAIN_COLORS[goal.domain] || DOMAIN_COLORS['Clinical'];
                      return (
                        <div 
                          key={idx}
                          className="p-4 rounded-lg border bg-background"
                        >
                          <div className="flex items-center gap-2 mb-2">
                            <h5 className="font-medium">{goal.title}</h5>
                            <Badge variant="outline" className={cn("text-xs", colors.badge)}>
                              {goal.domain}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground mb-2">
                            <strong>Observation:</strong> {goal.observation}
                          </p>
                          <p className="text-sm">
                            <strong>Action:</strong> {goal.suggested_action}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-3 p-4 bg-muted/50 rounded-lg text-muted-foreground">
              <AlertCircle className="w-5 h-5" />
              <p>Complete self-assessment interview and extract insights to see analysis here.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
