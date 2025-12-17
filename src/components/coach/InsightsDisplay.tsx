import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FileText, Sparkles, Target, AlertCircle, Info } from 'lucide-react';
import { getDomainColorRaw, getDomainColorRichRaw } from '@/lib/domainColors';

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
              {/* Disclaimer */}
              <div className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg border border-border/50 text-sm text-muted-foreground">
                <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <p>These insights were generated from the self-assessment interview transcript using AI analysis.</p>
              </div>

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
                      const bgColor = getDomainColorRaw(insight.domain);
                      const accentColor = getDomainColorRichRaw(insight.domain);
                      
                      return (
                        <div 
                          key={idx}
                          className="p-4 rounded-lg border"
                          style={{ 
                            backgroundColor: `hsl(${bgColor})`,
                            borderColor: `hsl(${accentColor} / 0.3)`
                          }}
                        >
                          <Badge 
                            className="mb-3"
                            style={{ 
                              backgroundColor: `hsl(${accentColor} / 0.15)`,
                              color: `hsl(${accentColor})`,
                              borderColor: `hsl(${accentColor} / 0.3)`
                            }}
                          >
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
                                Growth Areas
                              </p>
                              <ul className="text-sm space-y-1">
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
