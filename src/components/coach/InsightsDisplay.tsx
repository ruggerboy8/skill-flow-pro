import React from 'react';
import DOMPurify from 'dompurify';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { User, AlertCircle, FileText } from 'lucide-react';
import { getDomainColorRaw, getDomainColorRichRaw } from '@/lib/domainColors';
import type { ExtractedInsights, DomainInsight, InsightsPerspective } from '@/lib/evaluations';

interface InsightsDisplayProps {
  summaryFeedback: string | null;
  extractedInsights: ExtractedInsights | null;
}

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
  perspective 
}: { 
  perspective: InsightsPerspective;
}) {
  return (
    <div className="space-y-4">
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

export function InsightsDisplay({ summaryFeedback, extractedInsights }: InsightsDisplayProps) {
  // Self-assessment insights (unified or legacy)
  const selfAssessmentPerspective = extractedInsights?.self_assessment || 
    (extractedInsights ? getLegacyAsSelfAssessment(extractedInsights) : null);

  // Legacy observation summary - only show for old evals that have summary_feedback but no self-assessment insights
  const hasLegacySummary = !!summaryFeedback && !selfAssessmentPerspective;

  return (
    <div className="space-y-6">
      {/* Legacy Observation Summary - historical fallback only */}
      {hasLegacySummary && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Observation Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div 
              className="prose prose-sm max-w-none"
              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(summaryFeedback || '') }}
            />
          </CardContent>
        </Card>
      )}

      {/* Self-Assessment Insights */}
      {selfAssessmentPerspective ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <User className="w-5 h-5" />
              Self-Assessment Insights
            </CardTitle>
          </CardHeader>
          <CardContent>
            <PerspectiveCard perspective={selfAssessmentPerspective} />
          </CardContent>
        </Card>
      ) : !hasLegacySummary && (
        <Card>
          <CardContent className="py-8">
            <div className="flex items-center gap-3 justify-center text-muted-foreground">
              <AlertCircle className="w-5 h-5" />
              <p>Complete the self-assessment interview to see insights here.</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// Re-export types for backwards compatibility
export type { ExtractedInsights, DomainInsight, InsightsPerspective };
