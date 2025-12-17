import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Eye, User, AlertCircle } from 'lucide-react';
import { getDomainColorRaw, getDomainColorRichRaw } from '@/lib/domainColors';
import type { ExtractedInsights, DomainInsight, InsightsPerspective } from '@/lib/evaluations';

interface InsightsDisplayProps {
  summaryFeedback: string | null;
  extractedInsights: ExtractedInsights | null;
}

// Helper to check if insights has the new unified structure
function hasUnifiedStructure(insights: ExtractedInsights | null): boolean {
  if (!insights) return false;
  return !!(insights.observer || insights.self_assessment);
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

export function InsightsDisplay({ summaryFeedback, extractedInsights }: InsightsDisplayProps) {
  const hasObservationSummary = !!summaryFeedback;
  
  // Determine perspectives to display
  const observerPerspective = extractedInsights?.observer || null;
  const selfAssessmentPerspective = extractedInsights?.self_assessment || 
    (extractedInsights ? getLegacyAsSelfAssessment(extractedInsights) : null);
  
  const hasAnyInsights = observerPerspective || selfAssessmentPerspective;

  return (
    <div className="space-y-6">
      {/* Legacy Observation Summary - shown if no observer insights but summary_feedback exists */}
      {hasObservationSummary && !observerPerspective && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Eye className="w-5 h-5" />
              Observation Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div 
              className="prose prose-sm max-w-none"
              dangerouslySetInnerHTML={{ __html: summaryFeedback }}
            />
          </CardContent>
        </Card>
      )}

      {/* Side-by-Side Insights Display */}
      {hasAnyInsights ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Insights</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Observer Perspective */}
              <div className="space-y-4">
                {observerPerspective ? (
                  <PerspectiveCard 
                    title="Coach Observations" 
                    icon={Eye}
                    perspective={observerPerspective}
                  />
                ) : (
                  <div className="flex items-center gap-3 p-4 bg-muted/50 rounded-lg text-muted-foreground">
                    <AlertCircle className="w-5 h-5 flex-shrink-0" />
                    <p className="text-sm">Complete observation recording to see coach insights here.</p>
                  </div>
                )}
              </div>
              
              {/* Self-Assessment Perspective */}
              <div className="space-y-4">
                {selfAssessmentPerspective ? (
                  <PerspectiveCard 
                    title="Self-Assessment" 
                    icon={User}
                    perspective={selfAssessmentPerspective}
                  />
                ) : (
                  <div className="flex items-center gap-3 p-4 bg-muted/50 rounded-lg text-muted-foreground">
                    <AlertCircle className="w-5 h-5 flex-shrink-0" />
                    <p className="text-sm">Complete self-assessment interview to see insights here.</p>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-8">
            <div className="flex items-center gap-3 justify-center text-muted-foreground">
              <AlertCircle className="w-5 h-5" />
              <p>Complete the observation and self-assessment recordings to see insights here.</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// Re-export types for backwards compatibility
export type { ExtractedInsights, DomainInsight, InsightsPerspective };
